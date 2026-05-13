# Official Daily Bootstrap Procedure

Version: 1.0  
Status: Official  
Scope: MLB Quant Ops daily startup, historical tracking, and schedule alignment  
Last updated: 2026-05-08

## Purpose

This procedure defines the canonical daily startup sequence for the MLB Quant Ops system.
It ensures that every day begins with:

- fresh market acquisition for the active operational date,
- a current intraday snapshot for the active market window,
- recalculated operational status,
- validated process timestamps,
- persisted historical records for replay and research.

This is the official operating procedure for bringing the system online each day.

## Operational Principle

The system must distinguish between:

- `Process Update`: the latest backend/orchestrator refresh,
- `Latest Snapshot`: the latest captured market state,
- `Current Schedule Window`: the active operational window,
- `Timeline Progress`: the completeness of the current day’s capture schedule.

These are related but not interchangeable.

## Automatic Daily Startup Flow

When the API server starts, it launches the daily bootstrap routine automatically unless disabled.

Bootstrapped sequence:

1. `collect_mlb_ops.js`
2. `intraday_snapshot_engine.js` for the active window
3. `daily_operations_orchestrator.js`
4. validation of:
   - `Process Update`
   - `Latest Snapshot`
   - `Current Schedule Window`
   - `Snapshot Density`
   - `Timeline Progress`

## Required Startup Contract

The system is considered ready for the current day only if all of the following are true:

- the current operational date matches the active daily payload,
- the process update is fresh,
- a latest snapshot exists for the current day,
- the current schedule window is known,
- timeline progress is present and not truncated,
- snapshot density is non-zero and meaningful,
- the bootstrap status is persisted in the historical ledger.

## Canonical Commands

### Automatic startup

Start the API as usual:

```bash
npm run dashboard:api
```

The server will trigger:

- `mlb_ops/scripts/daily_system_bootstrap.js`

### Manual bootstrap

Use this when you need to force a fresh daily initialization:

```bash
npm run mlb:bootstrap
```

### Full daily operations

Use this when you want to recompute the full operational pipeline:

```bash
npm run mlb:ops
```

## Historical Persistence

Every startup must write a non-destructive historical record.

Canonical history locations:

- `mlb_ops/historical/bootstrap/YYYY-MM-DD.json`
- `mlb_ops/historical/daily_events/YYYY-MM-DD.json`
- `mlb_ops/historical/daily_runs/YYYY-MM-DD.json`

These records are append-only or date-partitioned. They must not overwrite unrelated days.

## Validation Rules

After bootstrap, validate the following:

- `Process Update` corresponds to the current day,
- `Last Snapshot` corresponds to the current day,
- `Current Schedule Window` is not `n/a`,
- `Timeline Progress` is populated,
- `snapshot_density` is not truncated,
- `pipeline_health` remains in healthy range,
- bootstrap status is recorded in `Ops Health`.

## Operational Status Interpretation

- `ready_for_today = true`: the day is operationally initialized and usable.
- `degraded`: the system ran, but one or more required signals are incomplete.
- `skipped`: bootstrap already completed for the date and was not forced.
- `failed`: one or more required stages failed.

## Failure Handling

If any stage fails:

- keep the historical record,
- preserve stage-level exit codes and stderr,
- do not overwrite successful prior artifacts,
- surface the failure in `Ops Health`,
- re-run only the failed stage when possible.

## Governance

This document is the canonical procedure for daily startup and operational date alignment.
Any future automation must preserve these rules:

- no destructive overwrites,
- no silent skips,
- no hidden time shifts,
- no ambiguous timestamps,
- no mixing of process freshness with market snapshot freshness.

## Automation

- If `AUTO_DAILY_BOOTSTRAP=1`, the API server starts a bootstrap supervisor.
- The supervisor runs once at API startup and then every `AUTO_BOOTSTRAP_INTERVAL_MINUTES`.
- `AUTO_BOOTSTRAP_FORCE=1` forces each scheduled tick to refresh the current operational window instead of silently skipping a previously completed date.
- The supervisor does not start a second bootstrap if one is already running.
- If `AUTO_DAILY_BOOTSTRAP=0`, use `npm run mlb:bootstrap` manually or run a dedicated platform cron/worker.

## Notes

- The dashboard should always show both the process update and the latest snapshot separately.
- Historical tracking is required before CLV research, replay analysis, and daily operations validation are considered complete.
