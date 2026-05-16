const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SCHEMA = {
  PORT: { type: 'number', default: 8787, min: 1 },
  NODE_ENV: { type: 'enum', values: ['development', 'test', 'production'], default: 'development' },
  APP_ENV: { type: 'string', default: 'local' },
  LOG_LEVEL: { type: 'enum', values: ['debug', 'info', 'warn', 'error'], default: 'info' },
  VITE_API_URL: { type: 'string', default: '' },
  VITE_REFRESH_INTERVAL: { type: 'number', default: 120000, min: 1000 },
  SNAPSHOT_INTERVAL_SECONDS: { type: 'number', default: 75, min: 1 },
  MARKET_REFRESH_POLICY: { type: 'string', default: 'market_watch' },
  ENABLE_RESEARCH_PIPELINES: { type: 'boolean', default: true },
  ENABLE_CIO_LAYER: { type: 'boolean', default: true },
  DATABASE_URL: { type: 'string', default: '' },
  SQLITE_PATH: { type: 'string', default: './data/mlb-quant-ops.sqlite' },
  ARTIFACTS_PATH: { type: 'string', default: './mlb_ops' },
  LOGS_PATH: { type: 'string', default: './mlb_ops/logs' },
  MLB_STATS_API_BASE: { type: 'string', default: 'https://statsapi.mlb.com/api/v1' },
  BASEBALL_SAVANT_BASE: { type: 'string', default: 'https://baseballsavant.mlb.com' },
  ROTOWIRE_BASE: { type: 'string', default: 'https://www.rotowire.com' },
  COVERS_BASE: { type: 'string', default: 'https://www.covers.com' },
  OPEN_METEO_BASE: { type: 'string', default: 'https://api.open-meteo.com/v1' },
  PLAYWRIGHT_HEADLESS: { type: 'boolean', default: true },
  PLAYWRIGHT_TIMEOUT: { type: 'number', default: 30000, min: 1000 },
  PLAYWRIGHT_BROWSER: { type: 'enum', values: ['chromium', 'firefox', 'webkit'], default: 'chromium' },
  ENABLE_DECISION_PANEL: { type: 'boolean', default: true },
  ENABLE_EXECUTIVE_MEMOS: { type: 'boolean', default: true },
  ENABLE_PORTFOLIO_GOVERNANCE: { type: 'boolean', default: true },
  ENABLE_TEMPORAL_RESEARCH: { type: 'boolean', default: true },
  AUTO_DAILY_BOOTSTRAP: { type: 'boolean', default: true },
  AUTO_BOOTSTRAP_INTERVAL_MINUTES: { type: 'number', default: 15, min: 1 },
  AUTO_BOOTSTRAP_FORCE: { type: 'boolean', default: true },
  AUTO_INTRADAY_SCHEDULER: { type: 'boolean', default: false },
  AUTO_INTRADAY_RUN_ON_STARTUP: { type: 'boolean', default: false },
  VITE_DEV_PORT: { type: 'number', default: 5173, min: 1 },
};

let cachedConfig = null;

function hasExplicitEnv(key) {
  return process.env[key] !== undefined;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const values = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function loadEnvFiles() {
  const fileOrder = ['.env', '.env.local'];
  const loaded = {};
  for (const filename of fileOrder) {
    const entries = parseEnvFile(path.join(ROOT, filename));
    for (const [key, value] of Object.entries(entries)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
      loaded[key] = process.env[key];
    }
  }
  return loaded;
}

function coerceValue(key, raw, rule) {
  if (rule.type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    const normalized = String(raw).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false;
    throw new Error(`${key} must be a boolean-like value`);
  }
  if (rule.type === 'number') {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) throw new Error(`${key} must be a valid number`);
    if (rule.min !== undefined && numeric < rule.min) throw new Error(`${key} must be >= ${rule.min}`);
    return numeric;
  }
  if (rule.type === 'enum') {
    const normalized = String(raw).trim();
    if (!rule.values.includes(normalized)) {
      throw new Error(`${key} must be one of: ${rule.values.join(', ')}`);
    }
    return normalized;
  }
  return String(raw);
}

function normalizePath(relativeOrAbsolute) {
  if (!relativeOrAbsolute) return '';
  return path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.resolve(ROOT, relativeOrAbsolute);
}

function validateAndBuildConfig() {
  loadEnvFiles();
  const errors = [];
  const values = {};
  const inferredNodeEnv = process.env.NODE_ENV !== undefined ? String(process.env.NODE_ENV).trim() : SCHEMA.NODE_ENV.default;

  for (const [key, rule] of Object.entries(SCHEMA)) {
    let raw;
    if (hasExplicitEnv(key)) {
      raw = process.env[key];
    } else if (key === 'AUTO_DAILY_BOOTSTRAP' && inferredNodeEnv === 'production') {
      raw = false;
    } else {
      raw = rule.default;
    }
    try {
      values[key] = coerceValue(key, raw, rule);
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (values.NODE_ENV === 'production') {
    const productionRequired = ['APP_ENV', 'ARTIFACTS_PATH', 'LOGS_PATH', 'MLB_STATS_API_BASE'];
    for (const key of productionRequired) {
      if (!String(values[key] || '').trim()) {
        errors.push(`${key} is required in production`);
      }
    }
  }

  if (errors.length) {
    const message = `Invalid environment configuration:\n- ${errors.join('\n- ')}`;
    const error = new Error(message);
    error.name = 'ConfigurationError';
    throw error;
  }

  return {
    app: {
      root: ROOT,
      port: values.PORT,
      nodeEnv: values.NODE_ENV,
      appEnv: values.APP_ENV,
      logLevel: values.LOG_LEVEL,
      autoDailyBootstrap: values.AUTO_DAILY_BOOTSTRAP,
      autoBootstrapIntervalMinutes: values.AUTO_BOOTSTRAP_INTERVAL_MINUTES,
      autoBootstrapForce: values.AUTO_BOOTSTRAP_FORCE,
      autoIntradayScheduler: values.AUTO_INTRADAY_SCHEDULER,
      autoIntradayRunOnStartup: values.AUTO_INTRADAY_RUN_ON_STARTUP,
    },
    frontend: {
      apiUrl: values.VITE_API_URL,
      refreshInterval: values.VITE_REFRESH_INTERVAL,
      devPort: values.VITE_DEV_PORT,
    },
    pipelines: {
      snapshotIntervalSeconds: values.SNAPSHOT_INTERVAL_SECONDS,
      marketRefreshPolicy: values.MARKET_REFRESH_POLICY,
      enableResearchPipelines: values.ENABLE_RESEARCH_PIPELINES,
      enableCioLayer: values.ENABLE_CIO_LAYER,
    },
    storage: {
      databaseUrl: values.DATABASE_URL,
      sqlitePath: normalizePath(values.SQLITE_PATH),
      artifactsPath: normalizePath(values.ARTIFACTS_PATH),
      logsPath: normalizePath(values.LOGS_PATH),
    },
    apis: {
      mlbStatsApiBase: values.MLB_STATS_API_BASE,
      baseballSavantBase: values.BASEBALL_SAVANT_BASE,
      rotowireBase: values.ROTOWIRE_BASE,
      coversBase: values.COVERS_BASE,
      openMeteoBase: values.OPEN_METEO_BASE,
    },
    playwright: {
      headless: values.PLAYWRIGHT_HEADLESS,
      timeout: values.PLAYWRIGHT_TIMEOUT,
      browser: values.PLAYWRIGHT_BROWSER,
    },
    features: {
      enableDecisionPanel: values.ENABLE_DECISION_PANEL,
      enableExecutiveMemos: values.ENABLE_EXECUTIVE_MEMOS,
      enablePortfolioGovernance: values.ENABLE_PORTFOLIO_GOVERNANCE,
      enableTemporalResearch: values.ENABLE_TEMPORAL_RESEARCH,
    },
    raw: values,
  };
}

function getRuntimeConfig() {
  if (!cachedConfig) {
    cachedConfig = validateAndBuildConfig();
  }
  return cachedConfig;
}

function validateRuntimeConfig() {
  return getRuntimeConfig();
}

module.exports = {
  ROOT,
  getRuntimeConfig,
  validateRuntimeConfig,
};
