# Hosting Architecture Recommendation

## Recommended First Deployment Topology

For the first online version of MLB Quant Ops, the recommended architecture is:

1. `Backend + pipelines + persistent artifacts` on `Railway` or `Render`
2. `Frontend` either:
   - served by the same backend service initially, or
   - moved later to `Vercel` once API/runtime separation is operationally clean

## Why This Is The Recommended Path

MLB Quant Ops is not just a frontend dashboard. It depends on runtime-generated intelligence artifacts:

- processed operational state
- research bundles
- historical memory
- markdown reports
- replay outputs

That makes persistent storage a first-class infrastructure concern.

## Recommended Phase 1

### Option A: Single Runtime on Railway

Use Railway if you want the fastest path to a hosted full-stack service with persistent storage.

Recommended shape:

- one service for the Node backend
- same service can serve the built frontend
- attach a persistent volume
- mount the volume where artifact paths resolve

Suggested runtime mapping:

- `ARTIFACTS_PATH=/app/mlb_ops`
- `LOGS_PATH=/app/mlb_ops/logs`
- `SQLITE_PATH=/app/data/mlb-quant-ops.sqlite`

Why Railway is a strong fit:

- persistent volumes are supported
- cron jobs exist for scheduled tasks
- relative-path applications can persist data if mounted under `/app`

Operational caveat:

- Railway cron jobs are for short-lived scheduled tasks, not always-on web services

Reference:
- Railway Volumes: https://docs.railway.com/volumes
- Railway Cron Jobs: https://docs.railway.com/reference/cron-jobs

### Option B: Single Runtime on Render

Use Render if you prefer a more explicit service split between web runtime and background work.

Recommended shape:

- one `web service` for backend + frontend
- one `background worker` later if pipelines need separation
- attach a persistent disk to the web service or worker that owns artifacts

Why Render is a strong fit:

- persistent disks are supported for web services and background workers
- disks survive restarts and deploys
- daily disk snapshots exist

Operational caveats:

- persistent disks disable zero-downtime deploys
- cron jobs cannot access persistent disks directly
- if scheduled work needs persistent artifacts, use a worker instead of relying on cron jobs alone

Reference:
- Render Persistent Disks: https://render.com/docs/disks
- Render Cron Jobs: https://render.com/docs/cronjobs

## Not Recommended For Phase 1

### Full Runtime on Vercel

Vercel is not the recommended first home for the full MLB Quant Ops runtime.

Why:

- the system depends on persistent local artifacts
- Vercel cron jobs trigger HTTP functions, but the platform is not a natural fit for artifact-heavy local-disk pipelines
- the best use of Vercel here is frontend hosting after the backend runtime is separated and stabilized

Reference:
- Vercel Cron Jobs: https://vercel.com/docs/cron-jobs
- Vercel Managing Cron Jobs: https://vercel.com/docs/cron-jobs/manage-cron-jobs

## Practical Recommendation

### Best First Hosted Release

Choose one of these:

1. `Railway full-stack first`
   Fastest path if you want one deployable service with persistent volume support.

2. `Render full-stack first`
   Better if you expect cleaner future separation between web runtime and background worker.

### Best Second-Stage Evolution

After the backend runtime is stable:

- move frontend to `Vercel` if you want edge delivery and cleaner UI hosting
- keep backend + artifacts on `Railway` or `Render`

## Recommended Decision

If speed and simplicity matter most:

- start with `Railway`

If operational separation and future worker topology matter more:

- start with `Render`

## Minimum Environment Shape For Hosted Runtime

```dotenv
NODE_ENV=production
APP_ENV=production
PORT=8787
VITE_API_URL=
ARTIFACTS_PATH=/app/mlb_ops
LOGS_PATH=/app/mlb_ops/logs
SQLITE_PATH=/app/data/mlb-quant-ops.sqlite
AUTO_DAILY_BOOTSTRAP=0
ENABLE_RESEARCH_PIPELINES=true
ENABLE_CIO_LAYER=true
ENABLE_DECISION_PANEL=true
ENABLE_EXECUTIVE_MEMOS=true
ENABLE_PORTFOLIO_GOVERNANCE=true
ENABLE_TEMPORAL_RESEARCH=true
```

## Final Recommendation

The most defensible first online architecture for MLB Quant Ops is:

- `Railway` or `Render` for backend runtime and persistent intelligence artifacts
- `Vercel` only later, and only for the frontend if separation is desired

This keeps the deployment aligned with how the system actually works:

- temporal intelligence depends on persisted state
- portfolio governance depends on generated artifacts
- the CIO layer depends on runtime research outputs

So the infrastructure should preserve state before it optimizes distribution.

