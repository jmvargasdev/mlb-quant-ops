const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getOperationalDateTimeParts } = require('../mlb_ops/scripts/lib/operational-date');

function secondsToMs(value) {
  return Math.max(1, Number(value || 1)) * 1000;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function minutesUntilNextPitch(latest, now = new Date()) {
  const nowMs = now.getTime();
  const starts = (latest?.games || [])
    .map((game) => game.matchup?.game_time_utc)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (!starts.length) return null;
  const upcoming = starts
    .filter((value) => value >= nowMs)
    .sort((a, b) => a - b);

  if (upcoming.length) {
    return Math.round((upcoming[0] - nowMs) / 60000);
  }

  const lastStart = Math.max(...starts);
  return Math.round((lastStart - nowMs) / 60000);
}

function cadenceForMinutes(minutesToNextPitch) {
  if (minutesToNextPitch === null || minutesToNextPitch === undefined) {
    return {
      interval_seconds: 900,
      profile: 'idle',
      rationale: 'No game start times are available.',
    };
  }
  if (minutesToNextPitch <= -120) {
    return {
      interval_seconds: 900,
      profile: 'post_start_watch',
      rationale: 'All first pitches are more than two hours old.',
    };
  }
  if (minutesToNextPitch <= 15) {
    return {
      interval_seconds: 60,
      profile: 'close_watch',
      rationale: 'Within 15 minutes of the next first pitch.',
    };
  }
  if (minutesToNextPitch <= 60) {
    return {
      interval_seconds: 120,
      profile: 'late_pregame',
      rationale: 'Within 60 minutes of the next first pitch.',
    };
  }
  if (minutesToNextPitch <= 90) {
    return {
      interval_seconds: 180,
      profile: 'pregame_acceleration',
      rationale: 'Within 90 minutes of the next first pitch.',
    };
  }
  if (minutesToNextPitch <= 180) {
    return {
      interval_seconds: 300,
      profile: 'lineup_watch',
      rationale: 'Within three hours of the next first pitch.',
    };
  }
  if (minutesToNextPitch <= 360) {
    return {
      interval_seconds: 600,
      profile: 'market_watch',
      rationale: 'Within six hours of the next first pitch.',
    };
  }
  return {
    interval_seconds: 900,
    profile: 'open_watch',
    rationale: 'Early market window before pregame acceleration.',
  };
}

function startIntradayScheduler({ root, scriptPath, artifactsPath, runOnStartup }) {
  const latestPath = path.join(artifactsPath, 'processed', 'latest_matchups.json');
  let timer = null;
  let running = false;
  let lastStartedAt = null;
  let lastFinishedAt = null;
  let lastExitCode = null;
  let lastCadence = null;
  let lastTrigger = null;
  let stopped = false;

  function resolveCadence() {
    const latest = readJsonIfExists(latestPath);
    const minutes = minutesUntilNextPitch(latest);
    const cadence = cadenceForMinutes(minutes);
    lastCadence = {
      ...cadence,
      minutes_to_next_pitch: minutes,
    };
    return lastCadence;
  }

  function scheduleNext(reason) {
    if (stopped) return;
    const cadence = resolveCadence();
    const delayMs = secondsToMs(cadence.interval_seconds);
    clearTimeout(timer);
    timer = setTimeout(() => runOrchestrator(reason), delayMs);
    timer.unref?.();
  }

  function runOrchestrator(trigger) {
    if (running) {
      console.log(`[intraday-scheduler] skipped ${trigger}; orchestrator already running`);
      scheduleNext('overlap_skip');
      return;
    }

    running = true;
    lastTrigger = trigger;
    lastStartedAt = new Date().toISOString();
    const operationalDate = getOperationalDateTimeParts(new Date()).date;
    const child = spawn('node', [scriptPath], {
      cwd: root,
      env: {
        ...process.env,
        MLB_DATE: operationalDate,
        OPS_MODE: 'full',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    console.log(`[intraday-scheduler] started ${trigger} for ${operationalDate} at ${lastStartedAt}`);

    child.stdout.on('data', (chunk) => {
      process.stdout.write(`[intraday] ${chunk}`);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(`[intraday] ${chunk}`);
    });
    child.on('exit', (code) => {
      running = false;
      lastFinishedAt = new Date().toISOString();
      lastExitCode = code;
      console.log(`[intraday-scheduler] finished ${trigger} with code ${code}`);
      scheduleNext('dynamic_interval');
    });
    child.on('error', (error) => {
      running = false;
      lastFinishedAt = new Date().toISOString();
      lastExitCode = null;
      console.error(`[intraday-scheduler] failed to start ${trigger}: ${error.message}`);
      scheduleNext('start_error');
    });
  }

  if (runOnStartup) {
    setTimeout(() => runOrchestrator('startup'), 1000).unref?.();
  } else {
    scheduleNext('initial');
  }

  return {
    runNow: () => runOrchestrator('manual'),
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
    status: () => ({
      running,
      last_started_at: lastStartedAt,
      last_finished_at: lastFinishedAt,
      last_exit_code: lastExitCode,
      last_trigger: lastTrigger,
      cadence: lastCadence || resolveCadence(),
      run_on_startup: runOnStartup,
    }),
  };
}

module.exports = {
  cadenceForMinutes,
  minutesUntilNextPitch,
  startIntradayScheduler,
};
