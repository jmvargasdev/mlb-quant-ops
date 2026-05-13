const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { appendDailyEvent, loadBootstrapRecord, writeBootstrapRecord, writeDailyRunRecord } = require('./ops_history');
const { getOperationalDateTimeParts } = require('./lib/operational-date');
const { buildOperationalChecklist } = require('./lib/operational-hardening');

const OPS_ROOT = path.resolve(__dirname, '..');
const PROCESSED_DIR = path.join(OPS_ROOT, 'processed');

const DATE = process.env.MLB_DATE || getOperationalDateTimeParts(new Date()).date;
const FORCE = process.env.FORCE_BOOTSTRAP === '1' || process.env.FORCE_BOOTSTRAP === 'true';
const BOOTSTRAP_REPORT_PATH = path.join(PROCESSED_DIR, 'startup_status.json');
const CHECKLIST_PATH = path.join(PROCESSED_DIR, 'operational_checklist.json');
const RESEARCH_STATUS_PATH = path.join(PROCESSED_DIR, 'research_status.json');

const WINDOW_ORDER = [
  '06:00_open',
  '08:00_early',
  '10:00_market',
  '13:00_lineup_watch',
  'lineup_confirm',
  '60m_pregame',
  '15m_pregame',
  'close',
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function round(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function runScript(scriptName, extraEnv = {}) {
  const startedAt = new Date();
  const result = spawnSync('node', [path.join(OPS_ROOT, 'scripts', scriptName)], {
    cwd: path.join(OPS_ROOT, '..'),
    env: {
      ...process.env,
      MLB_DATE: DATE,
      ...extraEnv,
    },
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const endedAt = new Date();
  const durationMs = endedAt.getTime() - startedAt.getTime();

  return {
    script: scriptName,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_seconds: round(durationMs / 1000, 3),
    exit_code: result.status,
    status: result.status === 0 ? 'ok' : 'failed',
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function getScheduledWindow(latestMatchups) {
  const games = latestMatchups?.games || [];
  const gameStarts = games.map((game) => game.matchup?.game_time_utc).filter(Boolean);
  const firstStart = gameStarts.length ? new Date(Math.min(...gameStarts.map((value) => new Date(value).getTime()))) : null;
  const now = new Date();
  const nowEtParts = getOperationalDateTimeParts(now);
  const minutesToFirstPitch = firstStart ? Math.round((firstStart.getTime() - now.getTime()) / 60000) : null;
  const lineupsConfirmed = games.length
    ? games.every((game) => /confirmed/i.test(game.lineups?.away?.status || '') && /confirmed/i.test(game.lineups?.home?.status || ''))
    : false;

  if (minutesToFirstPitch !== null && minutesToFirstPitch <= 8) return 'close';
  if (minutesToFirstPitch !== null && minutesToFirstPitch <= 20) return '15m_pregame';
  if (minutesToFirstPitch !== null && minutesToFirstPitch <= 75) return '60m_pregame';
  if (lineupsConfirmed && minutesToFirstPitch !== null && minutesToFirstPitch <= 220) return 'lineup_confirm';
  if (minutesToFirstPitch !== null && minutesToFirstPitch <= 330) return '13:00_lineup_watch';
  if (nowEtParts.hour <= 6) return '06:00_open';
  if (nowEtParts.hour <= 8) return '08:00_early';
  if (nowEtParts.hour <= 10) return '10:00_market';
  return 'intraday';
}

function validationFromStatus(status) {
  const timelineProgress = status?.operational_health?.timeline_progress || {};
  const scheduleTiming = status?.meta?.schedule_timing || {};
  const hasFreshProcess = !!scheduleTiming.process_updated_at;
  const hasSnapshot = !!scheduleTiming.last_snapshot_captured_at;
  const hasScheduleWindow = !!scheduleTiming.current_schedule_window && scheduleTiming.current_schedule_window !== 'unknown';
  const timelineComplete = Number(timelineProgress.total || 0) > 0
    && Number(timelineProgress.completed || 0) + Number(timelineProgress.current || 0) > 0;

  return {
    has_fresh_process: hasFreshProcess,
    has_snapshot: hasSnapshot,
    has_current_schedule_window: hasScheduleWindow,
    timeline_progress_present: timelineComplete,
    schedule_state: scheduleTiming.schedule_state || 'unknown',
    ready_for_today: hasFreshProcess && hasSnapshot && hasScheduleWindow && timelineComplete,
  };
}

function main() {
  const existing = loadBootstrapRecord(DATE);
  if (existing?.status === 'completed' && !FORCE) {
    const output = {
      date: DATE,
      status: 'skipped',
      reason: 'bootstrap already completed for date',
      bootstrap: existing,
    };
    appendDailyEvent(DATE, { type: 'bootstrap', status: 'skipped', reason: output.reason });
    writeJson(BOOTSTRAP_REPORT_PATH, output);
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const startedAt = new Date().toISOString();
  const record = {
    date: DATE,
    status: 'running',
    started_at: startedAt,
    mode: 'online',
    steps: [],
    validation: null,
  };
  writeBootstrapRecord(DATE, record);
  appendDailyEvent(DATE, { type: 'bootstrap', status: 'started', started_at: startedAt });

  const collect = runScript('collect_mlb_ops.js', { OPS_MODE: 'full' });
  record.steps.push(collect);
  appendDailyEvent(DATE, { type: 'stage', name: 'collect', ...collect });

  const latestMatchups = readJsonIfExists(path.join(PROCESSED_DIR, 'latest_matchups.json'));
  const activeWindow = getScheduledWindow(latestMatchups);

  const snapshot = runScript('intraday_snapshot_engine.js', {
    SNAPSHOT_LABEL: activeWindow,
  });
  record.steps.push(snapshot);
  appendDailyEvent(DATE, { type: 'stage', name: 'snapshot', active_window: activeWindow, ...snapshot });

  const orchestrator = runScript('daily_operations_orchestrator.js', {
    OPS_MODE: 'full',
    SNAPSHOT_LABEL: activeWindow,
    SKIP_COLLECTOR: '1',
    SKIP_SNAPSHOT: '1',
  });
  record.steps.push(orchestrator);
  appendDailyEvent(DATE, { type: 'stage', name: 'orchestrator', active_window: activeWindow, ...orchestrator });

  const research = runScript('daily_research_pipeline.js', {
    RUN_REPLAY: 'false',
  });
  record.steps.push(research);
  appendDailyEvent(DATE, { type: 'stage', name: 'research', active_window: activeWindow, ...research });

  const journalSync = process.env.JOURNAL_API_KEY
    ? runScript('journal_sync.js', {
      JOURNAL_API_URL: process.env.JOURNAL_API_URL || '',
      JOURNAL_API_KEY: process.env.JOURNAL_API_KEY || '',
    })
    : {
        script: 'journal_sync.js',
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        duration_seconds: 0,
        exit_code: 0,
        status: 'skipped',
        reason: 'JOURNAL_API_KEY not configured.',
        stdout: '',
        stderr: '',
      };
  record.steps.push(journalSync);
  appendDailyEvent(DATE, { type: 'stage', name: 'journal_sync', active_window: activeWindow, ...journalSync });

  const status = readJsonIfExists(path.join(PROCESSED_DIR, 'daily_operations_status.json'));
  const scheduleTiming = status?.meta?.schedule_timing || {};
  const timelineProgress = status?.operational_health?.timeline_progress || null;
  const checklist = buildOperationalChecklist({
    date: DATE,
    generatedAt: status?.meta?.generated_at || new Date().toISOString(),
    scheduleTiming,
    timelineProgress,
    staleness: status?.operational_health?.staleness || null,
    operationalFlags: status?.operational_health?.operational_flags || [],
    snapshotDensityScore: status?.operational_health?.snapshot_density_score ?? null,
    pipelineHealthScore: status?.operational_health?.pipeline_health_score ?? null,
    sourceReliabilityScore: status?.operational_health?.source_reliability_score ?? null,
  });
  const validation = {
    expected_date: DATE,
    status_date: status?.meta?.date || null,
    generated_at: status?.meta?.generated_at || null,
    current_schedule_window: status?.meta?.current_schedule_window || null,
    latest_snapshot_label: status?.meta?.latest_snapshot_label || null,
    latest_snapshot_time: status?.meta?.latest_snapshot_time || null,
    snapshot_density_score: status?.operational_health?.snapshot_density_score ?? null,
    timeline_progress: timelineProgress,
    research_ready: research.status === 'ok',
    checks: {
      ...validationFromStatus(status),
      ready_for_today: checklist.ready_for_today,
    },
  };

  record.status = checklist.ready_for_today ? 'completed' : 'degraded';
  record.finished_at = new Date().toISOString();
  record.active_window = activeWindow;
  record.validation = validation;
  record.checklist = checklist;
  record.outputs = {
    daily_operations_status: path.join('mlb_ops', 'processed', 'daily_operations_status.json'),
    startup_status: path.join('mlb_ops', 'processed', 'startup_status.json'),
    operational_checklist: path.join('mlb_ops', 'processed', 'operational_checklist.json'),
    research_status: path.join('mlb_ops', 'processed', 'research_status.json'),
    history_events: path.join('mlb_ops', 'historical', 'daily_events', `${DATE}.json`),
    history_bootstrap: path.join('mlb_ops', 'historical', 'bootstrap', `${DATE}.json`),
  };

  writeBootstrapRecord(DATE, record);
  writeJson(CHECKLIST_PATH, checklist);
  writeJson(RESEARCH_STATUS_PATH, {
    date: DATE,
    generated_at: new Date().toISOString(),
    status: research.status,
    active_window: activeWindow,
    step: research,
  });
  writeDailyRunRecord(DATE, {
    bootstrap: record,
    status,
    active_window: activeWindow,
    validation,
    checklist,
    research,
    schedule_windows: WINDOW_ORDER,
  });
  appendDailyEvent(DATE, {
    type: 'bootstrap',
    status: record.status,
    active_window: activeWindow,
    validation,
    checklist,
    research,
    finished_at: record.finished_at,
  });

  const output = {
    date: DATE,
    status: record.status,
    active_window: activeWindow,
    validation,
    checklist,
    research,
    steps: record.steps,
    outputs: record.outputs,
  };
  writeJson(BOOTSTRAP_REPORT_PATH, output);
  console.log(JSON.stringify(output, null, 2));
}

main();
