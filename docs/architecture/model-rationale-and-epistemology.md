# Model Rationale and Epistemology

## Prologue

MLB Quant Ops began as a practical pilot around Playwright. The original intent was to test whether browser automation could collect useful public data for a model aimed at investment decisions in MLB betting markets.

The first question was operational rather than philosophical:

```text
Can public baseball, lineup, weather and market data be collected, normalized and compared well enough to identify exploitable opportunities?
```

The project started by extracting essential sabermetric and market information from public sources. Playwright made it possible to observe websites as a user would: opening pages, waiting for dynamic content, reading visible lineups and odds, capturing screenshots, and turning scattered public information into structured artifacts.

At first, the system was mainly a collection and observation workflow. It could gather lineups, public odds, weather context, probable pitchers, park context and sabermetric inputs. Over time, however, it became clear that data collection was not the core problem. The harder problem was deciding which information should matter, when it should matter, and whether it justified capital.

That realization changed the system. MLB Quant Ops evolved from a data extraction pilot into a decision system. The architecture matured through several stages:

- collection
- scoring
- temporal validation
- portfolio governance
- executive allocation
- decision memory
- outcome attribution
- policy feedback
- learning observability

The current system still preserves the original empirical spirit of the pilot, but its purpose is now broader and more disciplined: transform public observations into evidence, evidence into governed capital decisions, and decisions into auditable learning.

## What Playwright Contributes

Playwright is a browser automation tool. It allows the system to interact with web pages as a real user would: loading pages, waiting for JavaScript-rendered content, reading tables and cards, extracting visible text, and capturing screenshots for inspection.

In MLB Quant Ops, Playwright was used because not every relevant public input was available through a clean API. Some information lived in dynamic pages, including lineup cards, market boards, weather descriptions and odds displays.

Playwright imports or supports collection of:

- lineup status
- batting order
- player handedness
- probable starter display information
- weather text and weather icons
- market odds display
- opening and current moneyline boards
- totals when available
- public park-factor views

These inputs are not final investment decisions. They are empirical observations. Their value is that they give the system a repeatable view of the same public information a human market analyst would inspect manually.

## Imported Data And Why It Matters

### Lineups

Lineups matter because a projected team quality before confirmation can differ materially from the actual team quality at first pitch. The system uses lineup status, player order, handedness and lineup completeness to determine whether the offensive projection is stable or still uncertain.

Lineup data supports:

- lineup quality
- split edge against opposing pitcher hand
- lineup confirmation risk
- timing quality
- lineup reaction detection

### Market Odds

Odds matter because the system is not trying to pick winners in isolation. It is trying to identify whether the market price is favorable relative to the system's fair probability.

Market data supports:

- implied probability
- fair probability comparison
- edge percentage points
- opening-to-current movement
- market disagreement
- steam or repricing detection
- volatility and timing analysis

### Sabermetrics

Sabermetrics provide the baseball structure behind a selection. Expected statistics and Statcast-style metrics help the system evaluate whether a side has underlying quality beyond the market price.

Sabermetric inputs support:

- starter edge
- lineup strength
- expected offensive quality
- hard-contact context
- barrel-rate context
- xwOBA and xERA-based evaluation

### Weather And Park Context

Weather and park context matter because baseball outcomes are sensitive to the run environment. Wind, rain, humidity, temperature and park factors can affect scoring conditions and market totals.

These inputs support:

- weather impact
- run-environment adjustment
- volatility risk
- weather mismatch flags
- market-total interpretation

## Derived Metrics

The system derives higher-order metrics from the collected data. These are not directly imported by Playwright; they are computed by the model.

Key derived metrics include:

- `market_implied_probability`
- `fair_win_probability`
- `edge_pct_points`
- `quant_score`
- `lineup_quality`
- `starter_edge`
- `split_edge`
- `weather_impact`
- `park_factor_adjustment`
- `volatility_score`
- `persistence_score`
- `timing_quality_score`
- `market_disagreement`
- `edge_survived`
- `edge_decayed`
- `edge_strengthening`

The purpose of these metrics is to move the system from raw observation to decision evidence.

## Rationale Of The Model

The model is built around one principle:

```text
Information has investment value only when it improves capital allocation.
```

For that reason, MLB Quant Ops separates three levels:

1. Signal
   Raw edge, odds movement, lineup strength, sabermetrics and market indicators.

2. Evidence
   Persistence, timing quality, volatility regime, replay, CLV research and market correction behavior.

3. Allocation
   The governed capital action: `Execute Now`, `Reduced Quality`, `Wait for Confirmation` or `Pass`.

This separation is critical. A strong raw edge is not automatically a capital decision. A side can have attractive signal but still fail deployment quality because of timing risk, volatility, lineup uncertainty, market correction, correlation or portfolio concentration.

## Primary Allocation

The `Primary Allocation` is the most visible expression of the Executive Allocation Layer. It is not simply the highest raw score or the most interesting team. It is the structure that survives the full epistemic chain:

```text
raw signal -> temporal validation -> market regime -> portfolio governance -> policy gates -> executive allocation
```

The Primary Allocation exists to answer:

```text
What should be done with capital now?
```

Its legitimacy comes from the convergence of:

- structural baseball evidence
- market price evidence
- timing evidence
- persistence evidence
- volatility evidence
- portfolio governance
- explicit policy gates
- decision trace
- historical memory
- outcome feedback

## Architectural Features And Their Epistemic Sources

### Data Collection Layer

Epistemic source:

```text
Empirical observation
```

Model inspiration:

```text
Web automation
Data ingestion pipelines
```

This layer captures the public facts of the slate: schedule, teams, pitchers, lineups, odds, weather and park context. It gives the system observable reality.

### Scoring Engine

Epistemic source:

```text
Quantitative inference
```

Model inspiration:

```text
Factor models
Quantitative handicapping
```

The scoring engine compares structural team quality against market price. It estimates fair probability and measures whether the market is mispricing a side.

### Temporal Market State

Epistemic source:

```text
Persistence over time
```

Model inspiration:

```text
Time-series analysis
Market microstructure
```

This layer asks whether an edge survives interaction with the market. It distinguishes early signal from durable signal.

### Replay Engine

Epistemic source:

```text
Historical reconstruction
```

Model inspiration:

```text
Event replay
Audit trail
```

Replay explains how a decision evolved throughout the day. It allows a user to see whether the final allocation was the product of stable evidence or late instability.

### CLV Research Layer

Epistemic source:

```text
Market efficiency and closing-price validation
```

Model inspiration:

```text
Closing line value research
Backtesting
```

This layer studies whether the system tends to capture favorable price relative to the market's later view.

### Executive Allocation Layer

Epistemic source:

```text
Governed capital judgment
```

Model inspiration:

```text
CIO allocation frameworks
Portfolio governance
```

This is the central decision layer. It turns evidence into action: execute, reduce, wait or pass.

### Policy Gates

Epistemic source:

```text
Explicit governance rules
```

Model inspiration:

```text
OPA
Policy-as-code
Approval gates
```

Policy gates prevent hidden or scattered capital logic. They make downgrade, wait and pass behavior auditable.

### Decision Trace

Epistemic source:

```text
Causal traceability
```

Model inspiration:

```text
LangGraph
ReAct trace discipline
Stateful decision graphs
```

The decision trace records the path from raw signal to capital decision. It explains why raw edge does not always become deployment.

### Decision Ledger

Epistemic source:

```text
Auditable memory
```

Model inspiration:

```text
Event Sourcing
Temporal history model
```

The ledger stores what the system believed at decision time. This prevents silent historical mutation and enables learning.

### Contract Validation

Epistemic source:

```text
Structural truth
```

Model inspiration:

```text
Pydantic
JSON Schema
AJV-compatible validation
```

Contracts protect the Executive Allocation Layer from malformed payloads and make assumptions explicit.

### Plan-And-Execute Pipeline

Epistemic source:

```text
Disciplined execution
```

Model inspiration:

```text
Plan-and-Execute
Temporal workflow semantics
Prefect orchestration
Dagster observability
```

The execution plan turns scripts into an explicit workflow with steps, artifacts, status, validation and retry intent.

### Outcome Attribution

Epistemic source:

```text
Decision reality check
```

Model inspiration:

```text
Backtesting
ML evaluation loop
Event Sourcing projection
```

Outcome attribution compares decisions against actual results. It separates profitable process from noise and luck.

### Policy Feedback

Epistemic source:

```text
Governed learning
```

Model inspiration:

```text
OPA policy review loop
Human-in-the-loop governance
ReAct verify step
```

Policy feedback converts outcomes into reviewable recommendations without automatically changing thresholds.

### Learning Observability

Epistemic source:

```text
Metaknowledge
```

Model inspiration:

```text
Dagster observability
Prefect run visibility
Semantic Kernel plugin boundary
```

Learning observability shows whether the system has enough memory, outcomes and feedback to claim that it is improving.

## Current Maturity

The system has matured from a Playwright pilot into an allocation-first decision architecture.

Its current epistemic chain is:

```text
public observation
  -> structured data
  -> quantitative signal
  -> temporal validation
  -> portfolio governance
  -> executive allocation
  -> decision memory
  -> outcome attribution
  -> policy feedback
  -> learning observability
```

The final goal is not more information. The final goal is better capital allocation for investors who care about risk-adjusted profitability.
