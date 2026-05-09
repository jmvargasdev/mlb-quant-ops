# Railway Onboarding Checklist

## Objective

Bring `mlb-quant-ops` online on Railway as a first hosted release, without changing business logic and without enabling unattended bootstrap behavior.

## Precondition

Before starting, the repository should already contain:

- `railway.json`
- `/health` endpoint
- `.env.production.example`
- runtime configuration validation
- CI build verification

## Phase 1 — Create The Railway Project

1. Log into Railway.
2. Create a new project.
3. Choose `Deploy from GitHub repo`.
4. Select the private repository:

```text
jmvargasdev/mlb-quant-ops
```

5. Create a single service from the root of the repository.

## Phase 2 — Attach Persistent Volume

This step is mandatory for a meaningful first deployment.

Create one volume and attach it to the service with this mount path:

```text
/app/mlb_ops
```

### Why This Exact Path

The current system writes runtime artifacts to `./mlb_ops`, and Railway mounts app code under `/app`. Mounting the volume at `/app/mlb_ops` preserves the current filesystem assumptions without refactoring the engines.

## Phase 3 — Configure Environment Variables

Add the following variables to the Railway service.

### Recommended Initial Production Set

```dotenv
PORT=8787
NODE_ENV=production
APP_ENV=production
LOG_LEVEL=info

VITE_API_URL=
VITE_REFRESH_INTERVAL=120000
VITE_DEV_PORT=5173

SNAPSHOT_INTERVAL_SECONDS=75
MARKET_REFRESH_POLICY=market_watch
ENABLE_RESEARCH_PIPELINES=true
ENABLE_CIO_LAYER=true

DATABASE_URL=
SQLITE_PATH=/app/mlb_ops/sqlite/mlb-quant-ops.sqlite
ARTIFACTS_PATH=/app/mlb_ops
LOGS_PATH=/app/mlb_ops/logs

MLB_STATS_API_BASE=https://statsapi.mlb.com/api/v1
BASEBALL_SAVANT_BASE=https://baseballsavant.mlb.com
ROTOWIRE_BASE=https://www.rotowire.com
COVERS_BASE=https://www.covers.com
OPEN_METEO_BASE=https://api.open-meteo.com/v1

PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT=45000
PLAYWRIGHT_BROWSER=chromium

ENABLE_DECISION_PANEL=true
ENABLE_EXECUTIVE_MEMOS=true
ENABLE_PORTFOLIO_GOVERNANCE=true
ENABLE_TEMPORAL_RESEARCH=true

AUTO_DAILY_BOOTSTRAP=0
```

### Important Notes

- Leave `VITE_API_URL` empty if frontend and backend are served from the same Railway service.
- Keep `AUTO_DAILY_BOOTSTRAP=0` for the first hosted release.
- Leave `DATABASE_URL` empty unless and until a hosted database is intentionally introduced.

## Phase 4 — Deploy

Once the repo and variables are connected:

1. Trigger the first deployment from Railway.
2. Wait for build and start to complete.
3. Confirm Railway is using:
   - build command from `railway.json`
   - start command from `railway.json`

Expected runtime behavior:

- backend starts on Railway `PORT`
- built frontend is served by the backend
- `/health` returns `200`

## Phase 5 — Generate Public Domain

After the service is healthy:

1. Open the Railway service settings.
2. Go to networking.
3. Generate a public domain.

## Phase 6 — Validate Post-Deploy

Run these checks in order:

### 1. Healthcheck

```text
https://<railway-domain>/health
```

Expected:

- `200 OK`
- JSON response with `status: "ok"`

### 2. Overview API

```text
https://<railway-domain>/api/portal/overview
```

Expected:

- valid JSON response
- no startup error

### 3. Research API

```text
https://<railway-domain>/api/portal/research
```

Expected:

- valid JSON response

### 4. Decision Panel API

```text
https://<railway-domain>/api/portal/decision-panel
```

Expected:

- valid JSON response
- `executive_allocation` present

### 5. Dashboard UI

Open the Railway domain root and verify:

- dashboard loads
- sidebar renders
- Decision Panel renders
- Research Workspace renders

## Phase 7 — Volume Validation

After deployment, verify the app is actually using the volume-backed paths:

- `ARTIFACTS_PATH=/app/mlb_ops`
- `LOGS_PATH=/app/mlb_ops/logs`
- `SQLITE_PATH=/app/mlb_ops/sqlite/mlb-quant-ops.sqlite`

### Operational Check

The key question is:

`Are processed artifacts and reports still present after a restart or redeploy?`

If not, the volume path is wrong or the runtime is still writing outside the mounted path.

## Phase 8 — First Restart Test

Once the first deploy is healthy:

1. Trigger a restart in Railway.
2. Re-check:
   - `/health`
   - `/api/portal/overview`
   - dashboard root
3. Confirm artifacts persist after restart.

## Phase 9 — What Not To Enable Yet

Do not do these in the first hosted release:

- no unattended cron automation yet
- no automatic bootstrap on service start
- no premature split into multiple services
- no Vercel frontend separation yet
- no database migration beyond current file-backed design

## Phase 10 — First Safe Next Step After Go-Live

Once the single-service runtime is healthy, the next step should be one of:

1. Introduce a dedicated scheduled bootstrap service on Railway.
2. Introduce a dedicated scheduled research refresh service.
3. Separate frontend hosting only after backend artifact persistence is proven stable.

## Quick Copy Checklist

```text
[ ] Create Railway project from GitHub
[ ] Connect jmvargasdev/mlb-quant-ops
[ ] Create one service from repo root
[ ] Attach volume at /app/mlb_ops
[ ] Add production environment variables
[ ] Keep AUTO_DAILY_BOOTSTRAP=0
[ ] Deploy
[ ] Validate /health
[ ] Validate /api/portal/overview
[ ] Validate /api/portal/research
[ ] Validate /api/portal/decision-panel
[ ] Validate dashboard UI
[ ] Restart service once
[ ] Confirm artifacts persist
```

