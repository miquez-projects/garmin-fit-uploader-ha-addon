# Garmin FIT Uploader (HA Add-on)

This add-on accepts body composition data and uploads it to Garmin Connect as a FIT file.

## What you need first
1) Generate a Garmin session state file (`storageState.json`) locally using the Playwright script:

```
node /Users/gabormikes/garmin-fit-upload/upload-fit.js --init
```

Copy the resulting file into the add-on data directory on your Home Assistant box:

```
/\data/garmin-storage-state.json
```

## API
POST body composition values:

```
POST http://<ha-host>:8088/body-comp
Content-Type: application/json

{
  "timestamp": 1737050000,
  "weight_kg": 77.6,
  "fat_pct": 17
}
```

If `timestamp` is omitted, the current time is used.

Health check:

```
GET http://<ha-host>:8088/health
```

## Notes
- The add-on runs Playwright Chromium headless by default. You can disable headless via add-on options.
- The Garmin session will eventually expire; replace `garmin-storage-state.json` when needed.
- ARM devices can struggle with Chromium. If uploads are slow, increase the poll interval.
