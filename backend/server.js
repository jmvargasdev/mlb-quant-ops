const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const portalRoutes = require('../api/portal-routes');

const ROOT = path.resolve(__dirname, '..');
const app = express();
const PORT = Number(process.env.PORT || 8787);
const DIST_DIR = path.join(ROOT, 'frontend', 'dist');
const BOOTSTRAP_SCRIPT = path.join(ROOT, 'mlb_ops', 'scripts', 'daily_system_bootstrap.js');

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use('/api/portal', portalRoutes);
app.use('/screenshots', express.static(path.join(ROOT, 'mlb_ops', 'screenshots')));

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
  if (process.env.AUTO_DAILY_BOOTSTRAP === '0') return;
  const child = spawn('node', [BOOTSTRAP_SCRIPT], {
    cwd: ROOT,
    env: {
      ...process.env,
      AUTO_DAILY_BOOTSTRAP: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[bootstrap] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[bootstrap] ${chunk}`);
  });
  child.on('exit', (code) => {
    console.log(`MLB daily bootstrap finished with code ${code}`);
  });
  child.on('error', (error) => {
    console.error(`MLB daily bootstrap failed to start: ${error.message}`);
  });
});
