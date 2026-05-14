# Quant Ops Expansion Handoff For Claude

## Context

The system started as `MLB Quant Ops`, but the architecture is now broader than MLB-only usage. The user wants the visible product identity to move toward `Quant Ops`, with the active sport shown as a sublabel or selector, and the design prepared for future expansion to NBA, NHL, and eventually financial markets.

The goal is not to rewrite the learning stack. The goal is to make the naming, hierarchy, and data model coherent with a multi-domain future while preserving the current MLB-first behavior.

## Product Direction

Use `Quant Ops` as the umbrella name.

Use the active domain as a sublabel or context marker:

- MLB
- NBA
- NHL
- later, non-sports domains such as financial markets

The UI should communicate:

- what the system is
- which domain is active
- what the page is useful for
- why the outputs matter to investors

## Core Idea

The useful part of the system is not MLB itself. The useful part is the epistemic loop:

- capture data
- build evidence
- validate temporally
- govern allocation
- record decisions
- attribute outcomes
- learn from feedback

That loop should remain the core. The sport or asset class is the adapter.

## Requested Work

### 1. Rename visible surfaces

Update visible branding from `MLB Quant Ops` to `Quant Ops` where it makes sense in the UI.

Keep the active domain visible as a sublabel or compact selector.

Do not do a destructive repository-wide rename unless it is needed for the active surfaces.

### 2. Add domain awareness to the home/header experience

The home workspace should support a small domain selector or placeholder menu for:

- MLB
- NBA
- NHL

This is a placeholder today, but it should be structured so a future adapter can switch domain content cleanly.

### 3. Separate core from domain adapters

Prepare the codebase mentally and structurally for:

- `core` capabilities that are domain-agnostic
- `sports` adapters that translate MLB/NBA/NHL data into the shared core
- later `markets` adapters for financial instruments

The shared core should include:

- policy gates
- decision trace
- ledger
- outcome attribution
- policy feedback
- learning observability

The adapters should own:

- data collection
- feature engineering
- labels
- market-specific timing logic
- domain-specific naming

### 4. Keep mock data bounded

If mock data remains enabled in the home performance dashboard, it must stay clearly labeled as mock and remain frontend-only.

Mock mode should not destroy or reset backend learning artifacts.

### 5. Preserve the existing learning system

Do not disturb the following unless the refactor requires it:

- decision ledger
- contract validation
- policy gates
- decision trace
- outcome attribution
- policy feedback
- learning observability

The request is a presentation and architecture alignment task, not a reset of the learning engine.

## Suggested Implementation Path

1. Update visible branding in the home header and sidebar to support `Quant Ops` as the umbrella identity.
2. Add a compact domain indicator or selector in the home header.
3. Introduce a small domain config shape, even if only MLB is active for now.
4. Replace hardcoded MLB-only copy where appropriate with domain-aware copy.
5. Keep the current MLB behavior intact while making the UI ready for NBA/NHL.
6. If multi-domain support is extended later, add sport-specific adapters instead of expanding MLB-specific logic.

## Financial Markets Extension

If the system is later adapted to financial markets, the same epistemic loop should remain intact, but the adapter layer must change.

The financial adapter would own:

- price and volume collection
- volatility and liquidity features
- calendar/event context
- market regime features
- PnL and risk labels

The shared core should continue to manage:

- allocation posture
- decision trace
- audit memory
- outcome attribution
- policy feedback

## Acceptance Criteria

The task is complete when:

- the visible product name no longer overcommits the system to MLB-only identity
- the home surface shows an active domain context
- the layout remains compact and legible
- the core decision-learning system remains unchanged
- the codebase has a clear path to NBA, NHL, and later financial markets

## Notes For Claude

Do not over-rename the repository in one pass.

Prefer:

- small visible UI updates
- localized naming abstractions
- one core / many adapters

Avoid:

- large unrelated refactors
- changing operational logic that is already working
- collapsing the mock mode or the current MLB workflow
