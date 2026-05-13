# Decision Learning System Plan

## Purpose

This document defines the execution plan for evolving MLB Quant Ops from a decision-support dashboard into an auditable decision-learning system.

The goal is not only to produce executive allocation recommendations, but to learn from those recommendations over time so the system can improve precision, reduce false positives, and support better investor outcomes.

The core learning loop is:

```text
decision -> market close -> result -> CLV / ROI attribution -> postmortem -> policy feedback
```

## Rationale

MLB Quant Ops is allocation-first. Its highest-value output is not abstract market information, but a governed capital decision:

- execute now
- reduce quality
- wait for confirmation
- pass

For the system to improve, every decision must become auditable memory. The platform should be able to answer:

- What did the system decide?
- Why did it decide that?
- What evidence was available at the time?
- Which policies or gates were active?
- What happened afterward?
- Was the decision profitable, efficient, or avoidable?
- What should the system learn?

This requires contracts, durable decision records, centralized policy gates, explicit decision traces, and outcome attribution.

## Target Architecture

The target architecture combines selected patterns from durable workflow systems, decision graphs, policy engines, contract-first data validation, and event sourcing.

The system should adopt the patterns without prematurely depending on a large external orchestration framework.

### Core Additions

1. `Decision Ledger`
   Append-only memory of every executive allocation decision.

2. `Contract Validation`
   JSON Schema validation for critical artifacts and API payloads.

3. `Policy Gates`
   Centralized rules that govern deployment, reduction, waiting, and passing.

4. `Decision Graph`
   Explicit trace of how raw edge becomes executive allocation.

5. `Plan-And-Execute Pipeline`
   Planned execution with per-step validation, status, retry intent, and failure reason.

6. `Outcome Attribution`
   Closing-line, result, CLV, ROI proxy, and decision-quality evaluation.

7. `Policy Feedback`
   Reports that identify which rules or thresholds may need adjustment.

8. `Learning Observability`
   UI/reporting for historical decision quality, policy activations, and performance by action/tier/regime.

## Phased Execution Plan

### Phase 1: Decision Ledger

Framework / pattern reference:

```text
Event Sourcing
Temporal history model
Dagster asset lineage mindset
```

Create an append-only record of each executive allocation decision.

Suggested path:

```text
mlb_ops/historical/decision_ledger/YYYY-MM-DD.jsonl
```

Each row should include:

```text
date
snapshot_label
generated_at
game_id
team
side
action
executive_exposure
raw_exposure
conviction_tier
reason
reason_codes
timing_quality_score
persistence_score
volatility_score
market_regime
portfolio_risk
source_signature
result_status
```

Initial state:

```text
result_status=pending
```

Purpose:

- preserve what the system believed at decision time
- enable postmortem analysis
- prevent silent mutation of historical decisions

### Phase 2: Contract Validation

Framework / pattern reference:

```text
Pydantic
JSON Schema
AJV
Contract-first API design
```

Add contract-first validation for critical artifacts.

Recommended tools:

```text
JSON Schema
AJV
```

Initial contracts:

```text
daily_operations_status.json
scored_matchups.json
temporal_market_state.json
edge_validation.json
clv_research.json
decision_panel payload
executive_allocation payload
```

Expected command:

```text
npm run contracts:validate
```

Purpose:

- catch broken artifacts early
- protect the Executive Allocation Layer from malformed data
- make data assumptions explicit

### Phase 3: Policy Gates

Framework / pattern reference:

```text
OPA
Policy-as-code
Approval gate pattern
```

Centralize capital governance rules.

Candidate policies:

```text
PASS_CANNOT_BE_PRIMARY
STALE_SNAPSHOT_REDUCES_AGGRESSION
UNSTABLE_CANNOT_FULL_DEPLOY
LOW_TIMING_REQUIRES_CONFIRMATION
HIGH_CORRELATION_COMPRESSES_EXPOSURE
MISSING_CLOSE_SNAPSHOT_BLOCKS_FULL_CONFIDENCE
HIGH_VOLATILITY_REDUCES_QUALITY
```

Each policy result should include:

```json
{
  "code": "LOW_TIMING_REQUIRES_CONFIRMATION",
  "status": "active",
  "effect": "downgrade_to_wait",
  "severity": "warning",
  "evidence": {}
}
```

Purpose:

- keep capital rules in one place
- make downgrade/pass behavior auditable
- prevent UI/backend/script rule drift

### Phase 4: Decision Graph

Framework / pattern reference:

```text
LangGraph
ReAct trace discipline
Stateful decision graph pattern
```

Refactor the CIO decision process into explicit nodes.

Suggested graph:

```text
Raw Edge Node
  -> Temporal Validation Node
  -> Timing Quality Node
  -> Market Regime Node
  -> Portfolio Concentration Node
  -> Policy Gate Node
  -> Executive Allocation Node
  -> Decision Ledger Node
```

Each node should emit:

```text
input summary
output state
reason_codes
confidence impact
policy effects
```

Purpose:

- explain how signals become capital decisions
- make decisions reconstructable
- clarify why raw edge does not equal deployment

### Phase 5: Plan-And-Execute Pipeline

Framework / pattern reference:

```text
Plan-and-Execute
Temporal workflow semantics
Prefect orchestration model
Dagster pipeline observability
```

Add an explicit execution plan for daily operations.

Daily plan:

```text
collect
score
snapshot
temporal
replay
clv_research
decision_panel
contract_validation
policy_validation
decision_ledger_write
```

Each step should record:

```text
status
started_at
ended_at
input_artifacts
output_artifacts
validation_result
retryable
failure_reason
```

Purpose:

- improve reliability
- support retries and resumability
- expose operational failure modes before they affect capital decisions

### Phase 6: Outcome Attribution

Framework / pattern reference:

```text
Event Sourcing projection
Dagster materialized asset mindset
ML evaluation / backtesting loop
```

Close the learning loop after games and market close.

Attach outcomes to previous ledger rows:

```text
closing_line
closing_implied_probability
CLV
game_result
profit_loss_proxy
decision_quality
was_action_correct
was_sizing_correct
```

Questions to answer:

- Did `Reduced Quality` outperform full deployment in volatile regimes?
- Did `Wait for Confirmation` preserve capital or lose positive CLV?
- Which reason codes predict false positives?
- Which regimes produce the best/worst capital decisions?

Purpose:

- connect decisions to results
- distinguish good process from lucky outcome
- build a measurable learning base

### Phase 7: Policy Feedback

Framework / pattern reference:

```text
OPA policy review loop
ReAct verify step
Human-in-the-loop governance
```

Generate reports that suggest rule or threshold adjustments.

Suggested output:

```text
mlb_ops/reports/policy_feedback_report.md
```

Examples:

```text
LOW_TIMING threshold may be too strict.
UNSTABLE penalty avoided negative CLV.
Reduced Quality outperformed Execute Now in elevated volatility.
Wait for Confirmation lost CLV in stable market regimes.
```

Purpose:

- improve policies without reckless auto-optimization
- support human review before rule changes
- make learning explicit

### Phase 8: Learning Observability

Framework / pattern reference:

```text
Dagster observability
Prefect run visibility
Semantic Kernel plugin boundary for future integrations
```

Expose decision-learning quality in reports or frontend views.

Candidate metrics:

```text
decision ledger coverage
contract validation status
policy gate activations
decision graph trace availability
CLV by action
ROI proxy by conviction tier
false-positive rate by reason code
pass correctness
wait correctness
reduced quality performance
```

Purpose:

- show whether the system is improving
- make investor-facing confidence evidence-based
- separate decision intelligence from raw information display

## First Minimal Delivery

The first implementation should be intentionally small:

```text
Decision Ledger
Basic executive_allocation JSON schema
PASS_CANNOT_BE_PRIMARY policy
```

This creates:

- durable decision memory
- a validated executive allocation output
- one critical safety rule aligned with the allocation-first frontend

## Non-Goals

This plan does not require:

- integrating Temporal immediately
- integrating LangGraph immediately
- integrating OPA immediately
- adding CrewAI or AutoGen
- turning the system into a conversational agent platform
- auto-optimizing policies without review
- replacing the current artifact pipeline immediately

The intent is to adopt proven patterns incrementally while preserving the current artifact-driven architecture.

## Success Criteria

The system is progressing correctly when it can answer:

```text
What was decided?
Why was it decided?
What evidence existed then?
Which policies activated?
What happened after close?
Did the decision produce positive CLV or ROI proxy?
What should be adjusted?
```

The long-term goal is a decision system whose learning loop improves capital allocation quality and investor outcomes over time.
