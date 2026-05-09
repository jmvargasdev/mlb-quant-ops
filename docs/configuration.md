# Configuration

## Purpose

MLB Quant Ops separates code from runtime configuration through a centralized loader under `config/runtime.js`. The goal is to keep secrets out of version control, make local onboarding predictable, and prepare the project for future hosted environments.

## Quick Start

```bash
cp .env.example .env
cp .env.local.example .env.local
```

Adjust values only where needed. Never commit `.env` or `.env.local`.

## How Configuration Works

- `.env.example` documents the full contract.
- `.env.local.example` documents common local overrides.
- `config/runtime.js` loads `.env` and `.env.local`.
- environment values are normalized, validated, and exposed through a single config object.
- startup fails early when configuration is invalid.

## Variable Groups

### Required In Practice

These are the variables you should review for every environment:

- `PORT`
- `NODE_ENV`
- `APP_ENV`
- `ARTIFACTS_PATH`
- `LOGS_PATH`
- `VITE_API_URL`

### Usually Optional Because Defaults Exist

- `LOG_LEVEL`
- `VITE_REFRESH_INTERVAL`
- `SNAPSHOT_INTERVAL_SECONDS`
- `MARKET_REFRESH_POLICY`
- `PLAYWRIGHT_*`
- `ENABLE_*` feature flags
- source base URLs

### Reserved For Future Hosted Environments

- `DATABASE_URL`
- `SQLITE_PATH`

## Environment Differences

### Local

- can use relative paths
- `PLAYWRIGHT_HEADLESS=false` is acceptable
- `VITE_API_URL=http://localhost:8787` is typical

### Staging

- should use production-like paths and feature flags
- should validate remote API base URLs explicitly
- should keep bootstrap and artifact behavior intentional

### Production

- should define `APP_ENV=production`
- should use managed secret injection from the host platform
- should avoid local file assumptions unless persistent storage is explicitly configured

## Startup Validation

The system now validates configuration at startup. Invalid values such as malformed ports, unsupported booleans, or invalid enum values fail fast with clear error messages instead of causing silent runtime drift.

## Deployment Platform Readiness

The configuration contract is compatible with:

- `Vercel`
- `Railway`
- `Render`
- `GitHub Actions`

These platforms can inject environment variables directly without changing application code.

## Secrets Hygiene

- `.env` and `.env.*` remain ignored by git
- `auth.json` remains ignored
- never store cookies, tokens, or API credentials in tracked files
- use placeholders only in example files

