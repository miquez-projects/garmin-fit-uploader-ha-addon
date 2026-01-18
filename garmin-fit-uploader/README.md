# Garmin FIT Uploader (HA Add-on)

This add-on accepts body composition data and uploads it to Garmin Connect as a FIT file.

## What you need first
### Preferred (recommended): Garmin OAuth tokens via garth
1) Generate Garmin OAuth tokens locally (one-time 2FA login).
2) Copy the token directory to HA (must contain `oauth1_token.json` and `oauth2_token.json`):

```
/data/garmin-oauth
/config/garmin-oauth
/share/garmin-oauth
```

### Fallback: Playwright session state (may expire quickly)
1) Generate a Garmin session state file (`storageState.json`) locally using the Playwright script:

```
node /Users/gabormikes/garmin-fit-upload/upload-fit.js --init
```

Copy the resulting file into the add-on data directory on your Home Assistant box (or `/config` / `/share`):

```
/data/garmin-storage-state.json
/config/garmin-storage-state.json
/share/garmin-storage-state.json
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
