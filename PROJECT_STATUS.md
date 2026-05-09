# Project Status

## Repository Scope

MLB Quant Ops is currently a local institutional research and decision-support platform for MLB market intelligence. The codebase is now being prepared for professional version control and future deployment hosting without altering the current business logic.

## Current Architecture

- `api/`
  Express route layer for dashboard and data endpoints.
- `backend/`
  Data aggregation, memo generation, research synthesis, and decision payload assembly.
- `frontend/`
  React and Vite dashboard application.
- `mlb_ops/`
  Operational artifacts, research outputs, scripts, and historical memory.
- `src/decision-engines/`
  Pure decision logic, including the CIO allocation engine.

## Existing Engines

- acquisition layer
- scoring engine
- snapshot engine
- replay engine
- research pipeline
- persistence research
- timing quality research
- CLV preparation and research
- portfolio governance layer
- executive CIO allocation layer

## Research Pipelines

- persistence analysis
- timing quality analysis
- market correction analysis
- volatility regime analysis
- historical memory accumulation
- downloadable markdown quant memo generation

## Dashboard Status

- operational dashboard: implemented
- research workspace: implemented
- ranking explainability layer: implemented
- downloadable report preview and download: implemented

## Decision Panel Status

- operational posture: implemented
- best operational structures: implemented
- exposure recommendations: implemented
- portfolio summary: implemented
- correlation awareness: implemented
- concentration risk: implemented
- slate stability: implemented
- aggression control: implemented
- aggregate exposure intelligence: implemented

## CIO Layer Status

- CIO decision engine: implemented
- executive allocation decisions: implemented
- executive memo generation: implemented
- exposure compression at executive layer: implemented
- live API integration: implemented

## Deployment Readiness Assessment

### Current Strengths

- modular backend and frontend separation
- stable local dashboard workflows
- explicit research artifacts
- markdown reporting layer
- decision engine abstraction under `src/decision-engines/`

### Current Gaps Before Deployment

- no deployment manifests yet
- no CI workflow yet
- no environment template yet
- runtime data strategy for generated artifacts not finalized
- no hosted secret management configured

## Recommended Next Steps

1. Add `.env.example` and environment contract documentation.
2. Define artifact persistence strategy for hosted environments.
3. Add GitHub Actions for build verification.
4. Add deployment configs for Vercel, Railway, or Render after runtime strategy is finalized.
5. Add contributor and operations runbook documentation.

