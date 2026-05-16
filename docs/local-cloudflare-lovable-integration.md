# Local Cloudflare and Lovable Integration

This document records the local production bridge used for MarketSentinel.

## Current Topology

```text
marketsentinel.net
  -> Lovable frontend

api.marketsentinel.net
  -> Cloudflare Tunnel
  -> cloudflared on the Mac
  -> http://localhost:8787
  -> backend/server.js
```

The repository can remain named `mlb-quant-ops`. The public product brand is `MarketSentinel`, and `MLB Quant Ops` is the current operational module.

## Domain and DNS

The domain is managed by Cloudflare:

```text
marketsentinel.net
www.marketsentinel.net
api.marketsentinel.net
```

The frontend uses the root and `www` hostnames. The backend API uses only:

```text
https://api.marketsentinel.net
```

## Local Backend

The backend runs from this repo:

```bash
npm run dashboard:api
```

The service listens on:

```text
http://localhost:8787
```

Health check:

```bash
curl http://127.0.0.1:8787/health
curl https://api.marketsentinel.net/health
```

## Cloudflare Tunnel

The tunnel name is:

```text
scraper-api
```

The local Cloudflare config lives outside the repo:

```text
~/.cloudflared/config.yml
~/.cloudflared/<tunnel-id>.json
~/.cloudflared/cert.pem
```

Expected tunnel ingress:

```yaml
tunnel: scraper-api
credentials-file: /Users/josevargas/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: api.marketsentinel.net
    service: http://localhost:8787
  - service: http_status:404
```

Do not commit Cloudflare certificates, tunnel credential JSON files, or copied `.cloudflared` directories.

## macOS Services

The API is managed by `launchd`:

```text
~/Library/LaunchAgents/com.marketsentinel.api.plist
```

The tunnel is managed by `launchd`:

```text
~/Library/LaunchAgents/com.cloudflare.cloudflared.plist
```

These are user LaunchAgents. They start when the user logs in.

Useful checks:

```bash
launchctl print gui/501/com.marketsentinel.api
launchctl print gui/501/com.cloudflare.cloudflared
```

Logs:

```text
~/Library/Logs/mlb-quant-ops/api.out.log
~/Library/Logs/mlb-quant-ops/api.err.log
~/Library/Logs/com.cloudflare.cloudflared.out.log
~/Library/Logs/com.cloudflare.cloudflared.err.log
```

## Lovable Frontend

Lovable should use:

```env
VITE_API_URL=https://api.marketsentinel.net
```

Do not include a trailing slash or backslash.

The real frontend entrypoint in this repo is:

```text
frontend/src/main.jsx
frontend/src/app/App.jsx
```

`frontend/src/App.jsx` is legacy and should not be used as the main frontend reference.

## API Endpoints Verified

```text
GET /health
GET /api/portal/overview
GET /api/portal/games/:gameId
GET /api/portal/decision-panel
GET /api/portal/research
GET /api/portal/quant-report
GET /api/portal/quant-report/download
```

## CORS

The backend allows these frontend origins:

```text
https://marketsentinel.net
https://www.marketsentinel.net
https://*.lovable.app
https://*.lovableproject.com
```

The Lovable preview origin may change, so the wildcard support for `lovableproject.com` is intentional.

## Git Ignore Policy

Keep these out of Git:

```text
.env
.env.*
~/.cloudflared/*
Cloudflare tunnel credential JSON files
cert.pem
LaunchAgent plist files with machine-local paths
logs
frontend/dist
mlb_ops generated artifacts
SQLite databases
Playwright reports and screenshots
```

Only commit templates and documentation:

```text
.env.example
docs/*
source code
configuration templates without secrets
```

## Quick Verification Checklist

```bash
npm run config:validate
curl https://api.marketsentinel.net/health
curl https://api.marketsentinel.net/api/portal/overview
curl https://api.marketsentinel.net/api/portal/games/824359
```

Expected public health response includes:

```json
{
  "status": "ok",
  "service": "mlb-quant-ops",
  "environment": "production"
}
```
