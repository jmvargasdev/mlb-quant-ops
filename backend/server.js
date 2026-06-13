const express = require('express');
const fs = require('fs');
const path = require('path');
const portalRoutes = require('../api/portal-routes');
const analyticsRoutes = require('../api/analytics-routes');
const { createAnalyticsMiddleware } = require('./analytics-middleware');
const { getRuntimeConfig, validateRuntimeConfig } = require('../config');
const { startBootstrapScheduler } = require('./bootstrap-scheduler');
const { startIntradayScheduler } = require('./intraday-scheduler');

validateRuntimeConfig();
const config = getRuntimeConfig();
const ROOT = config.app.root;
const app = express();
const PORT = config.app.port;
const DIST_DIR = path.join(ROOT, 'frontend', 'dist');
const BOOTSTRAP_SCRIPT = path.join(ROOT, 'mlb_ops', 'scripts', 'daily_system_bootstrap.js');
const INTRADAY_SCRIPT = path.join(ROOT, 'mlb_ops', 'scripts', 'daily_operations_orchestrator.js');
function isAllowedOrigin(origin) {
  if (!origin) return false;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== 'https:') return false;
    return (
      hostname === 'marketsentinel.net' ||
      hostname === 'www.marketsentinel.net' ||
      hostname.endsWith('.lovable.app') ||
      hostname.endsWith('.lovableproject.com')
    );
  } catch {
    return false;
  }
}
let bootstrapScheduler = null;
let intradayScheduler = null;

app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json());
app.use(createAnalyticsMiddleware(config.storage.sqlitePath));
app.use('/api/portal', portalRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/screenshots', express.static(path.join(config.storage.artifactsPath, 'screenshots')));

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'mlb-quant-ops',
    environment: config.app.appEnv,
    timestamp: new Date().toISOString(),
    bootstrap_scheduler: bootstrapScheduler?.status?.() || null,
    intraday_scheduler: intradayScheduler?.status?.() || null,
  });
});

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get(/^(?!\/api\/).*/, (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`MLB Quant Ops API listening on http://localhost:${PORT}`);
  if (!config.app.autoDailyBootstrap) return;
  bootstrapScheduler = startBootstrapScheduler({
    root: ROOT,
    scriptPath: BOOTSTRAP_SCRIPT,
    intervalMinutes: config.app.autoBootstrapIntervalMinutes,
    force: config.app.autoBootstrapForce,
  });
});

if (config.app.autoIntradayScheduler) {
  intradayScheduler = startIntradayScheduler({
    root: ROOT,
    scriptPath: INTRADAY_SCRIPT,
    artifactsPath: config.storage.artifactsPath,
    runOnStartup: config.app.autoIntradayRunOnStartup,
  });
}
