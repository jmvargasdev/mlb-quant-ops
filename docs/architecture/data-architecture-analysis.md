# Data Architecture Analysis — MLB Quant Ops

**Date:** 2026-05-14  
**Scope:** Full pipeline — raw extraction through historical persistence  
**Conclusion:** File-based architecture is sustainable for the 2026 season with two immediate refactors; SQLite migration warranted for matchup history by July 2026.

---

## Current Storage Inventory

| Layer | Size | Files | Pattern |
|-------|------|-------|---------|
| `mlb_ops/raw/` | 126 MB | 1,265 | Timestamped extractions per run |
| `mlb_ops/historical/` | 123 MB | 533 | JSONL append-only + per-run matchup JSON |
| `mlb_ops/snapshots/` | 19 MB | 252 | JSON per schedule label |
| `mlb_ops/processed/` | 9.7 MB | 27 | Active working files |
| `mlb_ops/logs/` | 916 KB | 100+ | Audit trail and source health |
| `mlb_ops/reports/` | 116 KB | 12+ | Markdown outputs |

**Total active: ~393 MB across ~4 days of operational data.**

---

## Identified Bottlenecks

### 1. Snapshot load — O(n) directory scan (critical)

`temporal_density_engine.js → loadSnapshots()` reads the full snapshot directory on every run:

- Lists all `.json` files (53 today, projected 80–100 on active market days)
- Loads each file in full (`36 KB × 53 = 1.9 MB per run`)
- Sorts by timestamp after loading all files

The sort key (timestamp) is implicit in the filename — the load order is unnecessary.

**Fix:** Name snapshot files by label (`06:00_open.json`) instead of timestamp. Eliminates `readdirSync` + post-load sort. No data model change required.

### 2. `market_timeline.json` loaded three times per bootstrap

Three independent scripts each load the same 1.6 MB file on every bootstrap run:

```
replay_engine.js          → 1.6 MB full parse
clv_research_engine.js    → 1.6 MB full parse
daily_research_pipeline.js → 1.6 MB full parse
```

The file grows unbounded as the season progresses.

**Fix:** Partition by date: `market_timeline_2026-05-14.json`. Each script loads only the day it needs (~1.6 MB → stable per-day ceiling). Annual footprint: ~580 MB structured vs. one unbounded file.

### 3. Manual relational joins via `Map()` construction

`clv_research_engine.js` constructs three Maps on every run to join processed files by `game_id`:

```javascript
const temporalMap = new Map(temporal.games.map(g => [g.game_id, g]));
const prepMap     = new Map(prep.games.map(g => [`${g.game_id}:${g.side}`, g]));
const edgeMap     = new Map(edge.rows.map(r => [`${r.game_id}:${r.side}`, r]));
```

This is relational JOIN logic implemented in-process. It works at current scale; it is the correct signal that this data wants indexed storage.

### 4. Matchup history file explosion

`historical/matchups_run-*.json` produces ~126 files per day (multiple runs):

- 4 days → 506 files, 123 MB
- No query capability: finding a game by `game_id` requires scanning all files
- Projected end-of-season: ~7,000 files / **14.6 GB**

This is the only component where the file pattern fundamentally mismatches the access pattern.

---

## Growth Projections

| Source | Daily | 6 months | 12 months |
|--------|-------|----------|-----------|
| Matchup history | ~40 MB | ~7.2 GB | **~14.6 GB** |
| Snapshots | ~2.5 MB | ~450 MB | ~900 MB |
| Decision ledger | ~350 KB | ~63 MB | ~126 MB |
| Daily events | ~460 KB | ~83 MB | ~168 MB |

The matchup history is the only outlier that crosses a practical threshold for file-based management.

---

## Decision: What Needs a Database

### Does NOT require a database (2026 season)

| Component | Reason |
|-----------|--------|
| `processed/*.json` | 325 KB max; full-file load is fast and appropriate |
| `historical/decision_ledger/*.jsonl` | ~138 records/day; full-season volume is manageable |
| `historical/research/history.jsonl` | Low volume, no cross-file query pattern |
| `logs/`, `reports/` | Audit trail and human-readable output; no query requirements |
| `snapshots/` | Solvable by naming convention refactor alone |

### Requires SQLite — target: before July 2026

**`historical/matchups_run-*.json`** is the single component that warrants a database migration this season. The access pattern is already relational:

- Queries by `game_id`, `date`, `team`
- Cross-run deduplication by `source_signature`
- Season-long backtesting requires indexed range scans

**Proposed schema:**

```sql
CREATE TABLE matchup_runs (
  id          INTEGER PRIMARY KEY,
  date        TEXT NOT NULL,
  game_id     TEXT NOT NULL,
  run_ts      TEXT NOT NULL,
  payload     TEXT NOT NULL  -- JSON blob
);

CREATE INDEX idx_matchup_runs_game ON matchup_runs (date, game_id);
CREATE INDEX idx_matchup_runs_date ON matchup_runs (date);
```

Dependency: `better-sqlite3` (synchronous, no server process, compatible with current Node.js patterns).

### Can wait until 2027 season planning

| Component | Condition to revisit |
|-----------|----------------------|
| `decision_ledger` | If backtesting requires cross-season JOIN queries |
| Snapshots | If active snapshot volume exceeds 5 GB |
| TimescaleDB | Only if snapshot query latency becomes measurable |
| Redis | Only if Map construction between scripts becomes a measured bottleneck |

---

## Recommended Action Plan

### Week of 2026-05-14 (immediate)

1. **Refactor `loadSnapshots()`** — rename snapshot files to use label as filename; remove timestamp sort after load.
2. **Partition `market_timeline.json`** — split writes and reads by date; update all three consumers.

### Before 2026-07-01

3. **SQLite migration for matchup history** — introduce `better-sqlite3`, create `matchup_runs` table, write migration script to import existing files, update `historical_matchups_engine.js` write path.

### 2027 pre-season

4. Evaluate `decision_ledger` + `outcome_attribution` migration to SQLite based on backtesting query requirements.
5. Reassess snapshot storage if volume exceeds 5 GB active.

---

## Files Referenced

| File | Size | Consumers |
|------|------|-----------|
| `processed/latest_matchups.json` | 325 KB | 6+ scripts |
| `processed/market_timeline.json` | 1.6 MB | 3 scripts (growing) |
| `processed/temporal_market_state.json` | 184 KB | 4 scripts |
| `processed/clv_research.json` | 611 KB | 2 scripts |
| `historical/matchups_run-*.json` | 323 KB × 506 files | backtesting only |
| `historical/decision_ledger/*.jsonl` | 400 lines/day | outcome attribution |
| `logs/source_health_history.jsonl` | 51 lines | orchestrator (7-day window) |

---

*Analysis performed 2026-05-14. Re-evaluate before 2027 season if daily game count or pipeline frequency changes significantly.*
