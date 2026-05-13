# Allocation-First Frontend Plan

## Purpose

This document records the product and architecture decision to make the frontend allocation-first.

MLB Quant Ops exists to support capital decisions under uncertainty. The frontend should therefore prioritize executive allocation, governed exposure, and actionable portfolio posture before abstract research exploration.

The primary question the interface must answer is:

- What should the operator do with capital now?

Supporting questions are:

- How much exposure is justified?
- Which structures should be executed, reduced, delayed, or passed?
- What evidence supports the allocation?
- What risk conditions would invalidate or downgrade the posture?

## Rationale

The `Executive CIO Layer` is the highest-value cognitive layer for the end user because it converts multiple epistemic inputs into a capital decision.

Those inputs include:

- structural edge
- market pricing behavior
- temporal persistence
- timing quality
- CLV preparation
- volatility
- disagreement
- concentration risk
- portfolio governance
- operational health

If the frontend gives equal visual priority to every analytical module, the user must perform the final synthesis manually. That weakens the system's value because the project is not intended to be an abstract information dashboard. Its purpose is to improve investment decision quality.

The interface should make allocation the center of gravity and use the other layers as evidence, audit, and diagnostic support.

## Target Frontend Hierarchy

The desired hierarchy is:

1. Executive allocation and capital posture
2. Exposure recommendations and action states
3. Portfolio risk and governance constraints
4. Decision evidence
5. Market structure and research drill-down
6. Replay and historical audit
7. Operational health and system confidence

This does not remove existing workspaces. It changes their epistemic role.

## Workspace Roles

### Executive Allocation

Primary workspace. It should answer:

- recommended aggression
- total suggested exposure
- raw exposure vs governed exposure
- execute now / wait / reduced quality / pass
- decision reason per structure
- executive memo
- portfolio-level warnings

### Portfolio Risk

Support workspace or primary section within Executive Allocation. It should explain:

- concentration risk
- correlated exposure
- aggregate timing risk
- aggregate volatility risk
- aggregate disagreement risk
- exposure compression
- max single exposure
- max total daily exposure

### Decision Evidence

Evidence layer attached to each allocation row. It should expose:

- persistence score
- timing quality
- validation bucket
- lifecycle state
- volatility score
- disagreement score
- reason codes
- market structure evidence

### Market Structure

Supporting analytical workspace. It should explain how price, disagreement, line movement, and pressure are evolving.

### Research Memory

Supporting epistemic workspace. It should explain persistence, timing quality, market correction behavior, volatility regimes, and historical memory.

### Replay

Audit workspace. It should reconstruct how the decision evolved through the day.

### Ops Health

Confidence workspace. It should explain whether the system state is fresh, complete, and reliable enough to trust.

## Execution Plan

### Phase 1: Reorder Product Hierarchy

- Make `Decision Panel` or `Executive Allocation` the default workspace.
- Place it first in workspace navigation.
- Update labels so the primary destination reads as a capital decision surface, not a generic panel.
- Reduce the visual prominence of Daily Ops as the default entry point.

### Phase 2: Redesign The Primary View

Create or refactor the primary decision workspace around:

- capital posture summary
- total suggested exposure
- raw vs governed exposure
- aggression state
- allocation actions table
- portfolio risk summary
- executive memo
- downgrade or invalidation conditions

The first viewport should make the current capital posture obvious.

### Phase 3: Attach Evidence To Decisions

Each allocation row should provide direct access to the evidence that supports or weakens the recommendation:

- persistence
- timing quality
- CLV readiness
- volatility
- disagreement
- validation bucket
- lifecycle state
- relevant reason codes

The user should not need to leave the decision surface to understand why a recommendation exists.

### Phase 4: Reframe Existing Workspaces

Keep current workspaces, but reposition them as support layers:

- Market Structure explains pricing behavior.
- Research explains temporal and historical validity.
- Replay explains intraday evolution.
- Ops Health explains trustworthiness.
- Daily Ops explains raw tactical context.

### Phase 5: Refine Copy And Interaction Language

Prefer capital-decision language over abstract analytical language.

Examples:

- use `Deploy`, `Wait`, `Reduce`, `Pass`
- use `Governed Exposure` instead of only raw score language
- use `Risk Compression` where exposure is reduced
- use `Invalidation Condition` for triggers that weaken a decision

## Data Contract Expectations

The frontend should primarily consume `/api/portal/decision-panel` for allocation-first views.

Important fields include:

- `executive_allocation`
- `portfolio_summary`
- `exposure_governance`
- `concentration_risk`
- `aggregate_exposure_intelligence`
- `best_structures`
- `risk_layer`
- `research_insights`
- `operational_conclusion`

Decision logic should remain in the backend or decision engines. React should display and organize the decision output, not recreate allocation logic in the client.

## Success Criteria

The redesign succeeds if an investor can answer these questions quickly:

- What is the recommended posture today?
- How much capital should be exposed?
- Which structures are actionable now?
- Which structures should wait?
- Which structures should be passed?
- Why was exposure compressed?
- What are the dominant portfolio risks?
- What evidence supports the allocation?
- What would invalidate or downgrade the decision?

## Non-Goals

This plan does not require:

- changing the scoring model
- changing the CIO allocation engine
- replacing existing research workspaces
- introducing a database
- rewriting the backend API
- removing current market/research/replay views

The first implementation should be a frontend hierarchy and composition change using the current decision-panel payload.
