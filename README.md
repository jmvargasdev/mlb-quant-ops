# MLB Quant Ops

MLB Quant Ops is an institutional-grade market intelligence and portfolio governance platform for baseball betting research. It is designed to turn structural baseball signals, market pricing, temporal behavior, and portfolio risk controls into disciplined exposure decisions under uncertainty.

## What The System Is

MLB Quant Ops is not a traditional handicapping sheet. It is a layered decision-support system that:

- forms structural hypotheses from baseball inputs
- compares those hypotheses against market prices
- studies how edges survive or decay through time
- evaluates timing quality and market correction behavior
- compresses exposure when portfolio overlap becomes dangerous
- produces an executive allocation view through a CIO-style decision layer

## Core Philosophy

- `edge != deployment`
- market behavior matters as much as baseball quality
- timing changes execution quality
- persistence matters more than static signal snapshots
- capital preservation comes before action volume
- fewer positions can represent better portfolio quality

## Market Intelligence vs Handicapping

Traditional handicapping asks who should win.

MLB Quant Ops asks:

- where pricing may be misaligned
- whether that edge survives market correction
- when the structure is most usable
- how much of the slate deserves capital
- what should be reduced, delayed, or passed

## Current System Layers

1. `Sabermetrics Layer`
   Structural baseball evaluation and matchup context.
2. `Market Pricing Layer`
   Implied probability, price comparison, and edge formation.
3. `Temporal Intelligence Layer`
   Persistence, timing quality, market correction, and volatility regimes.
4. `Portfolio Governance Layer`
   Correlation awareness, exposure compression, concentration control, and aggression modulation.
5. `Executive CIO Layer`
   Final capital deployment decisions and institutional decision memos.

## What The System Does Not Do

- it does not guarantee profits
- it does not predict outcomes with certainty
- it does not auto-execute wagers
- it does not optimize for aggressive staking
- it does not replace risk governance with raw conviction

## Technology Stack

- `Node.js`
- `Express`
- `React`
- `Vite`
- `Recharts`
- JSON and markdown-based research artifacts

## Current Project Status

- operational dashboard: live
- research workspace: live
- downloadable quant memo: live
- decision panel: live
- portfolio governance layer: live
- executive CIO allocation layer: live
- deployment: not yet configured

## Environment Configuration

Copy the example environment file before running local services:

```bash
cp .env.example .env
cp .env.local.example .env.local
```

The project now uses centralized runtime configuration and startup validation through `config/runtime.js`. See [docs/configuration.md](docs/configuration.md) for:

- required and optional variables
- local vs staging vs production guidance
- Vercel, Railway, Render, and GitHub Actions readiness
- secrets hygiene expectations

## Repository Intent

This repository is being prepared as the institutional foundation for future private hosting and deployment. The immediate goal is version control hardening, documentation clarity, and infrastructure readiness without changing business logic.

See [PROJECT_STATUS.md](PROJECT_STATUS.md) and [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md) for more detail.
