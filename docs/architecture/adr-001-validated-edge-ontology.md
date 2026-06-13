# ADR-001: Validated Edge Ontology

**Status:** EXPERIMENTAL  
**Effective:** 2026-06-13  
**Review date:** 2026-08-15  
**Author:** MarketSentinel Quant Ops

---

## Context

The original decision ontology classified signals into four actions:

| Action | Intent |
|---|---|
| Execute Now | Highest confidence — all governance gates passed |
| Wait for Confirmation | Edge present but timing quality low (score < 20) |
| Reduced Quality | Edge present but volatility or restriction applies |
| Pass | No actionable edge |

This hierarchy assumed `Execute Now` was the most reliable signal and `Wait for Confirmation` was a lower-quality fallback.

### What the data showed

After 33 days of operation (2026-05-12 → 2026-06-13), historical outcome attribution was deduplicated and analyzed across 126 complete signals:

| Action | n (deduped) | Accuracy | P/L |
|---|---|---|---|
| Execute Now | 8 | **12.5%** | -2.25u |
| Wait for Confirmation | 123 | **71.5%** | +1.00u |
| Supportive (conviction tier) | 101 | **78.2%** | +3.25u |

The hierarchy was inverted. `Execute Now` — the supposedly best signal — was the worst performer. `Wait for Confirmation` was the most accurate by a large margin.

Root cause investigation revealed:
- `Execute Now` fires when `timing_quality_score >= 20` + low volatility + low disagreement — conditions that characterize **highly efficient, consensus markets** where edge rarely survives
- `Wait for Confirmation` fires when `timing_quality_score < 20` — early-window evaluations before the market has fully adjusted, where model edge is more likely to be real

### Sizing analysis (Quarter-Kelly backtest)

Running Quarter-Kelly cap 10% on the 126 Validated Edge signals (starting bankroll 100u):

| Method | Bankroll | ROI | Max Drawdown |
|---|---|---|---|
| 2% Flat | 215.7u | +116% | 9.2% |
| Q-Kelly cap 5% | 477.3u | +377% | 18.5% |
| **Q-Kelly cap 10%** | **1,943u** | **+1,843%** | **34.4%** |
| Q-Kelly cap 15% | 4,305u | +4,205% | 43.6% |

Cap 10% selected as the reference sizing: captures the bulk of the Kelly distribution (91% of signals fall in 0–15% range) while keeping drawdown below 35%.

---

## Decision

Replace the four-action ontology with a three-action ontology grounded in observed signal performance:

### New ontology

| Action | Condition | Sizing |
|---|---|---|
| **Validated Edge** | Positive Kelly edge AND lifecycle not collapsing AND volatility < 14 | Q-Kelly cap 10% of bankroll |
| **Watchlist** | Has edge but volatility ≥ 14 OR restricted aggression state | Monitor only — no capital |
| **Pass** | No Kelly edge OR collapsing lifecycle OR rejected validation | No action |

### Policy gate order (`evaluateStructurePolicies`)

1. `exposure ≤ 0` → Pass (Kelly sees no edge)
2. `lifecycle = collapsing` OR `validation = rejected` → Pass (edge is dead)
3. `volatility ≥ 14` OR `aggressionState = Restricted` → Watchlist
4. All else → Validated Edge

### Sizing formula

```
f = min(0.25 × (p×b - q) / b, 0.10)
```

Where `p = fair_probability`, `b = 1/market_implied_probability - 1`, `q = 1 - p`.

---

## Files changed

| File | Change |
|---|---|
| `src/decision-engines/cio-agent/policies.js` | New ACTIONS constants, new gate logic |
| `src/decision-engines/cio-agent/index.js` | priorityWeight, buildDecisionReason updated |
| `backend/data-service.js` | kellyExposure(), isValidatedEdge(), VALIDATED_EDGE filter |
| `mlb_ops/scripts/notify_local.js` | Alert on Validated Edge |
| `frontend/src/workspaces/decision-panel/useExecuteNowAlert.js` | Alert on Validated Edge |

### Backward compatibility

Historical records written with the old action names (`Wait for Confirmation`, `Execute Now`, `Supportive` conviction tier) are still counted as Validated Edge in all analytics. No historical data is invalidated. The `buildPerformanceDashboard`, `buildModelAnalysis`, and `loadHistoricalOutcomeRows` functions maintain dual-name recognition.

---

## Risks and open questions

1. **Sample size** — 126 signals over 33 days. Behavior during playoffs, trade deadline, or high-volatility periods is unknown.
2. **Live sizing not tested** — Q-Kelly cap 10% has only been backtested, never executed live with real capital.
3. **Execute Now sample too small** — 8 deduped signals is insufficient to fully discard the concept. It may have been miscalibrated on those specific dates rather than fundamentally flawed.
4. **Timing gate removal** — eliminating the `timing_quality_score < 20` distinction loses granularity that may prove meaningful with more data.

---

## Review criteria (2026-08-15)

This ADR moves from EXPERIMENTAL to ACCEPTED if, by the review date:

- [ ] At least 50 additional Validated Edge signals have been generated and attributed
- [ ] Accuracy on new signals (post-2026-06-13) remains ≥ 60%
- [ ] No more than 2 consecutive losing streaks of 5+ signals
- [ ] Live P/L with Q-Kelly cap 10% sizing is positive

If criteria are not met, revert to the previous ontology or introduce a hybrid approach.

---

## Alternatives considered

**A. Keep old ontology, fix thresholds** — Adjusting the timing_quality_score threshold rather than removing it. Rejected because the data doesn't indicate a better threshold exists; the direction of the relationship appears inverted.

**B. Merge WFC and Execute Now without removing either** — Both mapped to "Validated Edge" in display only, keeping internal distinction. Rejected because it perpetuates a misleading internal model.

**C. Wait for more data before refactoring** — Deferred the display refactor but not the action logic change. Rejected because the current Execute Now fires Q-Kelly sizing on the least accurate signals.
