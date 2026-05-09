# Railway Deployment Plan

## Goal

Prepare `mlb-quant-ops` for a first hosted release on Railway without changing business logic or pipeline semantics.

## Why Railway Fits This System

Railway supports:

- config as code via `railway.json`
- persistent volumes
- start command overrides
- cron jobs for short-lived scheduled tasks

This matches MLB Quant Ops better than a stateless frontend-only platform because the system depends on persisted artifacts under `mlb_ops/`.

Official references used:

- Railway Config as Code: https://docs.railway.com/config-as-code
- Railway Config Reference: https://docs.railway.com/reference/config-as-code
- Railway Volumes: https://docs.railway.com/volumes
- Railway Build and Start Commands: https://docs.railway.com/builds/build-and-start-commands
- Railway Healthchecks: https://docs.railway.com/reference/healthchecks

## Files Added For Railway

- [`railway.json`](../railway.json)
- [`/health` endpoint](../backend/server.js)
- `start` script in [`package.json`](../package.json)

## Deployment Shape

### Phase 1

Deploy a single Railway service that:

- builds the frontend
- runs the Node backend
- serves the dashboard and API together
- keeps operational artifacts on a persistent volume

### Why Single Service First

- simpler operational model
- no premature split between frontend and backend
- preserves current local workflow
- easiest path to getting the full dashboard online without rewriting data paths

## Required Railway Settings

### Start Command

Handled by `railway.json`:

```json
"startCommand": "npm run start"
```

### Healthcheck

Handled by `railway.json`:

```json
"healthcheckPath": "/health"
```

This avoids using a research-dependent endpoint as the deployment health signal.

### Restart Policy

Handled by `railway.json`:

```json
"restartPolicyType": "ON_FAILURE",
"restartPolicyMaxRetries": 10
```

## Persistent Volume Strategy

### Critical Constraint

The current system still reads and writes most runtime intelligence state under `./mlb_ops`.

Because Railway mounts relative-path persistence under `/app`, the most compatible first mount path is:

```text
/app/mlb_ops
```

This aligns with Railway's official volume guidance for relative-path applications.

### Recommended Volume Mount

Attach one volume to the service and mount it at:

```text
/app/mlb_ops
```

That preserves:

- `mlb_ops/processed/`
- `mlb_ops/historical/`
- `mlb_ops/reports/`
- `mlb_ops/logs/`
- `mlb_ops/raw/`
- `mlb_ops/snapshots/`
- `mlb_ops/screenshots/`

### Important Note

Because the volume is mounted at runtime and not at build time, the application should not rely on build-time artifact generation for persisted operational state.

## Recommended Railway Variables

Set these in the Railway service:

```dotenv
PORT=8787
NODE_ENV=production
APP_ENV=production
LOG_LEVEL=info
VITE_API_URL=
VITE_REFRESH_INTERVAL=120000
SNAPSHOT_INTERVAL_SECONDS=75
MARKET_REFRESH_POLICY=market_watch
ENABLE_RESEARCH_PIPELINES=true
ENABLE_CIO_LAYER=true
ARTIFACTS_PATH=/app/mlb_ops
LOGS_PATH=/app/mlb_ops/logs
SQLITE_PATH=/app/mlb_ops/sqlite/mlb-quant-ops.sqlite
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT=45000
PLAYWRIGHT_BROWSER=chromium
ENABLE_DECISION_PANEL=true
ENABLE_EXECUTIVE_MEMOS=true
ENABLE_PORTFOLIO_GOVERNANCE=true
ENABLE_TEMPORAL_RESEARCH=true
AUTO_DAILY_BOOTSTRAP=0
```

### Why `AUTO_DAILY_BOOTSTRAP=0`

For first hosted release, bootstrap should be controlled intentionally, not automatically at every container start.

## Build And Runtime Flow

Railway will:

1. detect the repo
2. use `railway.json`
3. run:

```bash
npm ci && npm run dashboard:build
```

4. start:

```bash
npm run start
```

## Manual Setup Steps

### 1. Create the Railway project

- Create a new project in Railway
- Connect the `mlb-quant-ops` GitHub repository

### 2. Attach a volume

- Add a volume to the service
- Set the mount path to:

```text
/app/mlb_ops
```

### 3. Add environment variables

- Copy the values from `.env.production.example`
- override the paths to use `/app/mlb_ops`

### 4. Generate a public domain

- In Railway networking, generate the public domain for the web service

### 5. Validate health

Check:

```text
/health
```

Then validate:

- `/api/portal/overview`
- dashboard root

## Cron Strategy On Railway

Railway cron jobs are good for short-lived scheduled tasks, not for the long-running web service itself.

Recommended first use:

- keep the web service separate
- if needed later, create dedicated cron-triggered services for:
  - daily bootstrap
  - daily research pipeline
  - reporting refresh

Do not convert the main dashboard service into a cron service.

## Risks To Respect

- the app still relies on file-based operational artifacts
- cron and runtime ownership of artifacts must stay explicit
- first deployment should prioritize persistence and observability, not automation density

## Recommended Next Railway Step

After this prep, the next operational step is:

1. create the Railway project
2. attach the volume at `/app/mlb_ops`
3. set env vars
4. deploy manually from GitHub
5. validate `/health`, `/api/portal/overview`, and the dashboard UI

