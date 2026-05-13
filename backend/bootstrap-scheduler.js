const { spawn } = require('child_process');
const { getOperationalDateTimeParts } = require('../mlb_ops/scripts/lib/operational-date');

function minutesToMs(value) {
  return Math.max(1, Number(value || 1)) * 60 * 1000;
}

function startBootstrapScheduler({ root, scriptPath, intervalMinutes, force }) {
  let running = false;
  let lastStartedAt = null;

  function runBootstrap(trigger) {
    if (running) {
      console.log(`[bootstrap-scheduler] skipped ${trigger}; bootstrap already running`);
      return;
    }

    running = true;
    lastStartedAt = new Date().toISOString();
    const operationalDate = getOperationalDateTimeParts(new Date()).date;
    const child = spawn('node', [scriptPath], {
      cwd: root,
      env: {
        ...process.env,
        AUTO_DAILY_BOOTSTRAP: '1',
        FORCE_BOOTSTRAP: force ? '1' : '0',
        MLB_DATE: operationalDate,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    console.log(`[bootstrap-scheduler] started ${trigger} for ${operationalDate} at ${lastStartedAt}`);

    child.stdout.on('data', (chunk) => {
      process.stdout.write(`[bootstrap] ${chunk}`);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(`[bootstrap] ${chunk}`);
    });
    child.on('exit', (code) => {
      running = false;
      console.log(`[bootstrap-scheduler] finished ${trigger} with code ${code}`);
    });
    child.on('error', (error) => {
      running = false;
      console.error(`[bootstrap-scheduler] failed to start ${trigger}: ${error.message}`);
    });
  }

  runBootstrap('startup');
  const timer = setInterval(() => runBootstrap('interval'), minutesToMs(intervalMinutes));
  timer.unref?.();

  return {
    runNow: () => runBootstrap('manual'),
    stop: () => clearInterval(timer),
    status: () => ({
      running,
      last_started_at: lastStartedAt,
      interval_minutes: intervalMinutes,
      force,
    }),
  };
}

module.exports = {
  startBootstrapScheduler,
};
