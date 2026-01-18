const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const { chromium } = require('playwright');

const DATA_DIR = '/data';
const DB_PATH = path.join(DATA_DIR, 'queue.sqlite');
const STORAGE_STATE = path.join(DATA_DIR, 'garmin-storage-state.json');
const FIT_SDK_JAR = '/opt/fit-sdk/java/FitCSVTool.jar';
const IMPORT_URL = 'https://connect.garmin.com/modern/import-data';
const PORT = 8088;

const POLL_INTERVAL = Number(process.env.POLL_INTERVAL_SECONDS || 30);
const HEADLESS = String(process.env.HEADLESS || 'true') === 'true';

const FIT_EPOCH_OFFSET = 631065600; // seconds between 1970-01-01 and 1989-12-31

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function openDb() {
  const db = new sqlite3.Database(DB_PATH);
  db.serialize(() => {
    db.run(
      `CREATE TABLE IF NOT EXISTS body_comp_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        measured_at INTEGER NOT NULL,
        weight_kg REAL NOT NULL,
        fat_pct REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT,
        created_at INTEGER NOT NULL,
        uploaded_at INTEGER
      )`
    );
  });
  return db;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function toFitTimestamp(unixSeconds) {
  return unixSeconds - FIT_EPOCH_OFFSET;
}

function writeWeightScaleCsv({ measuredAt, weightKg, fatPct }) {
  const fitTs = toFitTimestamp(measuredAt);
  const csvPath = path.join(DATA_DIR, `weight_scale_${fitTs}.csv`);

  const lines = [
    'Type,Local Number,Message,Field 1,Value 1,Units 1,Field 2,Value 2,Units 2,Field 3,Value 3,Units 3,Field 4,Value 4,Units 4,Field 5,Value 5,Units 5,',
    'Definition,0,file_id,type,1,,manufacturer,1,,product,1,,serial_number,1,,time_created,1,,',
    `Data,0,file_id,type,"9",,manufacturer,"15",,garmin_product,"22",,serial_number,"1234",,time_created,"${fitTs}",,`,
    'Definition,0,user_profile,message_index,1,,gender,1,,age,1,,height,1,,weight,1,,',
    `Data,0,user_profile,message_index,"0",,gender,"1",,age,"30",years,height,"1.75",m,weight,"${weightKg}",kg,`,
    'Definition,0,weight_scale,timestamp,1,,weight,1,,percent_fat,1,,,,,,,,',
    `Data,0,weight_scale,timestamp,"${fitTs}",s,weight,"${weightKg}",kg,percent_fat,"${fatPct}",%,,,,,,,`,
  ];

  fs.writeFileSync(csvPath, lines.join('\n') + '\n');
  return csvPath;
}

function encodeFit(csvPath) {
  const fitPath = csvPath.replace(/\.csv$/, '.fit');
  execFileSync('java', ['-jar', FIT_SDK_JAR, '-c', csvPath, fitPath], { stdio: 'inherit' });
  return fitPath;
}

async function uploadFit(fitPath) {
  if (!fs.existsSync(STORAGE_STATE)) {
    throw new Error(`Missing Garmin session: ${STORAGE_STATE}. Provide a storageState.json file.`);
  }

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ storageState: STORAGE_STATE });
  const page = await context.newPage();

  await page.goto(IMPORT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=/Drop files here/i', { timeout: 30000 });

  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.count()) {
    await fileInput.setInputFiles(fitPath);
  } else {
    const browseText = page.locator('span:has-text("Browse")').first();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 30000 }),
      browseText.click(),
    ]);
    await chooser.setFiles(fitPath);
  }

  const importBtn = page.getByRole('button', { name: /import data/i }).first();
  if (await importBtn.isVisible().catch(() => false)) {
    await importBtn.click();
  }

  await page.waitForTimeout(5000);
  await browser.close();
}

function startServer(db) {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/body-comp') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const measuredAt = payload.timestamp || nowSeconds();
          const weightKg = Number(payload.weight_kg);
          const fatPct = Number(payload.fat_pct);

          if (!Number.isFinite(weightKg) || !Number.isFinite(fatPct)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'weight_kg and fat_pct are required numbers' }));
            return;
          }

          db.run(
            'INSERT INTO body_comp_queue (measured_at, weight_kg, fat_pct, status, created_at) VALUES (?, ?, ?, ?, ?)',
            [measuredAt, weightKg, fatPct, 'pending', nowSeconds()],
            function (err) {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
                return;
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ id: this.lastID }));
            }
          );
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        }
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(PORT, () => {
    console.log(`REST API listening on :${PORT}`);
  });
}

function startWorker(db) {
  setInterval(() => {
    db.get(
      'SELECT * FROM body_comp_queue WHERE status = ? ORDER BY id ASC LIMIT 1',
      ['pending'],
      async (err, row) => {
        if (err) {
          console.error('DB error:', err.message);
          return;
        }
        if (!row) return;

        db.run('UPDATE body_comp_queue SET status = ? WHERE id = ?', ['processing', row.id]);

        try {
          const csvPath = writeWeightScaleCsv({
            measuredAt: row.measured_at,
            weightKg: row.weight_kg,
            fatPct: row.fat_pct,
          });
          const fitPath = encodeFit(csvPath);
          await uploadFit(fitPath);

          db.run(
            'UPDATE body_comp_queue SET status = ?, uploaded_at = ? WHERE id = ?',
            ['uploaded', nowSeconds(), row.id]
          );

          fs.unlinkSync(csvPath);
          fs.unlinkSync(fitPath);
        } catch (uploadErr) {
          console.error('Upload error:', uploadErr.message);
          db.run(
            'UPDATE body_comp_queue SET status = ?, error = ? WHERE id = ?',
            ['failed', String(uploadErr.message).slice(0, 500), row.id]
          );
        }
      }
    );
  }, POLL_INTERVAL * 1000);
}

ensureDataDir();
const db = openDb();
startServer(db);
startWorker(db);
