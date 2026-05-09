# Deployment Readiness

## Purpose

This document defines the minimum operational decisions required before MLB Quant Ops should move from local execution into a hosted environment.

## Current State

The application code is deployment-capable, but the full system still depends on generated operational artifacts under `mlb_ops/`. That means deployment should be blocked until artifact persistence is made explicit.

## Why This Matters

MLB Quant Ops is not only a web UI. It is a pipeline-driven operational system that generates:

- processed market snapshots
- temporal research outputs
- downloadable markdown reports
- historical research memory
- replay data
- screenshots and logs

If those artifacts are treated as disposable in production, the application may start successfully while the intelligence layer quietly degrades.

## Artifact Classes

### 1. Runtime-Critical Artifacts

These are required for dashboard usefulness and decision support:

- `mlb_ops/processed/`
- `mlb_ops/reports/downloadable_quant_report.md`
- `mlb_ops/reports/*.md`

Recommendation:
- persist across restarts
- treat as required runtime state

### 2. Research Memory Artifacts

These preserve temporal learning:

- `mlb_ops/historical/`
- `mlb_ops/reports/quant_reports/`
- `mlb_ops/reports/replay_reports/`

Recommendation:
- persist across restarts
- back up periodically
- keep outside ephemeral container storage

### 3. Operational Logs and Screenshots

- `mlb_ops/logs/`
- `mlb_ops/screenshots/`
- `mlb_ops/raw/`
- `mlb_ops/snapshots/`

Recommendation:
- logs can be externalized to platform logging if desired
- screenshots and raw captures should be retained only if operationally necessary
- treat as lower-priority than processed and historical intelligence state

## Recommended Persistence Strategy

### Short-Term Hosted Strategy

For first deployment on Railway or Render:

- mount a persistent disk or volume
- map `ARTIFACTS_PATH` to that volume
- keep `SQLITE_PATH` on the same persistent volume
- keep `LOGS_PATH` on persistent storage or platform logs

Recommended structure:

```text
/var/lib/mlb-quant-ops/
├── artifacts/
│   ├── processed/
│   ├── historical/
│   ├── reports/
│   ├── snapshots/
│   └── raw/
└── mlb-quant-ops.sqlite
```

### Vercel Note

Vercel is suitable for frontend hosting and lightweight API delivery, but not ideal as the primary runtime for artifact-heavy operational pipelines unless storage is externalized.

Recommendation:

- Vercel for frontend only, if desired
- separate persistent backend runtime for pipelines and artifact storage

## Platform Guidance

### Railway

Good fit if:

- backend and pipelines stay together
- a persistent volume is attached
- environment variables are managed in the project settings

### Render

Good fit if:

- persistent disk is configured
- cron or scheduled jobs are used carefully
- artifact retention policy is explicit

### Vercel

Best fit for:

- frontend only
- proxying to a separate API runtime

Not recommended for:

- artifact-heavy local-disk pipeline execution

## Minimum Go-Live Checklist

Do not deploy the full system until these are true:

1. CI passes on every push.
2. Production env contract is documented.
3. Artifact persistence path is defined.
4. Runtime-critical artifact retention is guaranteed.
5. SQLite or alternative storage location is explicit.
6. Bootstrap behavior in production is intentional.
7. Secrets are platform-managed, not file-managed.

## Immediate Recommendation

Before deployment:

1. keep frontend and backend build verification in CI
2. keep production environment examples versioned
3. decide whether first hosted release is:
   - full stack on Railway or Render
   - frontend on Vercel plus backend on a persistent host

Until that decision is made, the repository is deployment-ready at the code level but not yet operationally deployment-ready as a full intelligence platform.

