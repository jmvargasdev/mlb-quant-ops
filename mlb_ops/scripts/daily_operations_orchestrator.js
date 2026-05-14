const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { appendDailyEvent, writeDailyRunRecord } = require('./ops_history');
const { buildOperationalChecklist } = require('./lib/operational-hardening');
const { buildExecutionPlan } = require('./lib/execution-plan');

const OPS_ROOT = path.resolve(__dirname, '..');
const PROCESSED_DIR = path.join(OPS_ROOT, 'processed');
const REPORTS_DIR = path.join(OPS_ROOT, 'reports');
const LOGS_DIR = path.join(OPS_ROOT, 'logs');
const SNAPSHOTS_DIR = path.join(OPS_ROOT, 'snapshots');

const DATE = process.env.MLB_DATE || new Date().toISOString().slice(0, 10);
const OPS_MODE = process.env.OPS_MODE || 'full';
const FORCE_LABEL = process.env.SNAPSHOT_LABEL || null;
const SKIP_COLLECTOR = process.env.SKIP_COLLECTOR === '1' || process.env.SKIP_COLLECTOR === 'true';
const SKIP_SNAPSHOT = process.env.SKIP_SNAPSHOT === '1' || process.env.SKIP_SNAPSHOT === 'true';

const LATEST_PATH = path.join(PROCESSED_DIR, 'latest_matchups.json');
const SCORED_PATH = path.join(PROCESSED_DIR, 'scored_matchups.json');
const TEMPORAL_STATE_PATH = path.join(PROCESSED_DIR, 'temporal_market_state.json');
const EDGE_PERSISTENCE_PATH = path.join(PROCESSED_DIR, 'edge_persistence.json');
const CLV_RESEARCH_PATH = path.join(PROCESSED_DIR, 'clv_research.json');
const EDGE_VALIDATION_PATH = path.join(PROCESSED_DIR, 'edge_validation.json');
const CHECKLIST_PATH = path.join(PROCESSED_DIR, 'operational_checklist.json');
const OPERATIONS_STATUS_PATH = path.join(PROCESSED_DIR, 'daily_operations_status.json');
const DAILY_REPORT_PATH = path.join(REPORTS_DIR, 'daily_operations_report.md');
const OPS_LOG_DIR = path.join(LOGS_DIR, 'daily_operations');
const EXECUTION_PLAN_PATH = path.join(PROCESSED_DIR, 'daily_execution_plan.json');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function writeText(filePath, text) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, text);
}

function round(value, digits = 4) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values, digits = 4) {
  const usable = values.filter((value) => value !== null && value !== undefined && Number.isFinite(value));
  if (!usable.length) return null;
  return round(usable.reduce((sum, value) => sum + value, 0) / usable.length, digits);
}

function formatNum(value, digits = 2) {
  if (value === null || value === undefined) return 'n/a';
  return String(round(value, digits));
}

function loadJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? readJson(filePath) : null;
}

function buildAutoLabel(nowIso, latest) {
  const now = new Date(nowIso);
  const localHour = Number(now.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/New_York' }));
  const gameStarts = (latest?.games || []).map((game) => game.matchup?.game_time_utc).filter(Boolean);
  const firstStart = gameStarts.length ? new Date(Math.min(...gameStarts.map((value) => new Date(value).getTime()))) : null;
  const minutesToFirstPitch = firstStart ? Math.round((firstStart.getTime() - now.getTime()) / 60000) : null;
  const lineupsConfirmed = (latest?.games || []).length
    ? (latest.games || []).every((game) => /confirmed/i.test(game.lineups?.away?.status || '') && /confirmed/i.test(game.lineups?.home?.status || ''))
    : false;

  if (minutesToFirstPitch !== null && minutesToFirstPitch <= 8) return 'close';
  if (minutesToFirstPitch !== null && minutesToFirstPitch <= 20) return '15m_pregame';
  if (minutesToFirstPitch !== null && minutesToFirstPitch <= 75) return '60m_pregame';
  if (lineupsConfirmed && minutesToFirstPitch !== null && minutesToFirstPitch <= 220) return 'lineup_confirm';
  if (minutesToFirstPitch !== null && minutesToFirstPitch <= 330) return '13:00_lineup_watch';
  if (localHour <= 6) return '06:00_open';
  if (localHour <= 8) return '08:00_early';
  if (localHour <= 10) return '10:00_market';
  return 'intraday';
}

function runNodeScript(scriptName, extraEnv = {}) {
  const scriptPath = scriptName.includes(path.sep)
    ? path.resolve(OPS_ROOT, '..', scriptName)
    : path.join(OPS_ROOT, 'scripts', scriptName);
  const startedAt = new Date();
  const result = spawnSync('node', [scriptPath], {
    cwd: path.resolve(OPS_ROOT, '..'),
    env: {
      ...process.env,
      MLB_DATE: DATE,
      ...extraEnv,
    },
    encoding: 'utf8',
  });
  const endedAt = new Date();
  const durationMs = endedAt.getTime() - startedAt.getTime();
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  let parsed = null;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    parsed = null;
  }

  return {
    script: scriptName,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: durationMs,
    duration_seconds: round(durationMs / 1000, 3),
    status: result.status === 0 ? 'ok' : 'failed',
    exit_code: result.status,
    signal: result.signal,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    parsed_output: parsed,
  };
}

function buildStagePlan(snapshotLabel) {
  const skipNetwork = OPS_MODE === 'offline';
  return [
    {
      name: 'collector',
      script: 'collect_mlb_ops.js',
      enabled: !skipNetwork && !SKIP_COLLECTOR,
      env: {},
    },
    {
      name: 'scoring',
      script: 'scoring_engine.js',
      enabled: true,
      env: {},
    },
    {
      name: 'snapshot',
      script: 'intraday_snapshot_engine.js',
      enabled: !skipNetwork && !SKIP_SNAPSHOT,
      env: {
        SNAPSHOT_LABEL: snapshotLabel,
      },
    },
    {
      name: 'temporal',
      script: 'temporal_density_engine.js',
      enabled: true,
      env: {
        RUN_SNAPSHOT: 'false',
      },
    },
    {
      name: 'replay',
      script: 'replay_engine.js',
      enabled: true,
      env: {},
    },
    {
      name: 'clv_research',
      script: 'clv_research_engine.js',
      enabled: true,
      env: {},
    },
    {
      name: 'contract_validation',
      script: 'contracts/validate.js',
      enabled: true,
      env: {},
    },
    {
      name: 'outcome_attribution',
      script: 'outcome_attribution_engine.js',
      enabled: true,
      env: {},
    },
    {
      name: 'close_pending_ledgers',
      script: 'close_pending_ledgers.js',
      enabled: true,
      env: {},
    },
    {
      name: 'policy_feedback',
      script: 'policy_feedback_engine.js',
      enabled: true,
      env: {},
    },
  ];
}

function snapshotDensityMetrics(temporal) {
  const labels = temporal?.temporal_density?.labels_present || [];
  const uniqueLabels = [...new Set(labels)];
  const target = 8;
  const densityScore = round(clamp(((uniqueLabels.length / target) * 70) + (((temporal?.meta?.snapshot_count || 0) / target) * 30), 0, 100), 2);
  const missingLabels = [
    '06:00_open',
    '08:00_early',
    '10:00_market',
    '13:00_lineup_watch',
    'lineup_confirm',
    '60m_pregame',
    '15m_pregame',
    'close',
  ].filter((label) => !uniqueLabels.includes(label));
  return {
    labels_present: uniqueLabels,
    snapshot_count: temporal?.meta?.snapshot_count || 0,
    target_schedule: [
      '06:00_open',
      '08:00_early',
      '10:00_market',
      '13:00_lineup_watch',
      'lineup_confirm',
      '60m_pregame',
      '15m_pregame',
      'close',
    ],
    snapshot_density_score: densityScore,
    timeline_density_assessment: temporal?.temporal_density?.density_assessment || 'unknown',
    missing_labels: missingLabels,
    continuity_ok: missingLabels.length === 0,
  };
}

function loadSourceHealthHistory(days = 7) {
  const historyPath = path.join(LOGS_DIR, 'source_health_history.jsonl');
  if (!fs.existsSync(historyPath)) return [];
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  return fs.readFileSync(historyPath, 'utf8')
    .split('\n').filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter((entry) => entry && entry.run_at >= cutoff);
}

function sourceReliability(latest) {
  const currentRows = latest?.meta?.source_health || [];
  const history = loadSourceHealthHistory(7);

  const perSource = currentRows.map((row) => {
    const total = (row.successes || 0) + (row.failures || 0) + (row.empty || 0);
    const httpRate = total ? (row.successes + (row.empty || 0)) / total : 0;

    // Historical data quality: populated runs / total runs in last 7 days
    const sourceHistory = history.flatMap((entry) =>
      entry.sources.filter((s) => s.source === row.source),
    );
    const totalRuns = sourceHistory.length;
    const populatedRuns = sourceHistory.filter((s) => s.populated).length;
    const dataQualityScore = totalRuns ? round((populatedRuns / totalRuns) * 100, 1) : null;

    return {
      source: row.source,
      status: row.status,
      rows_last_run: row.rows_last_run ?? null,
      successes: row.successes || 0,
      failures: row.failures || 0,
      empty: row.empty || 0,
      http_success_rate: round(httpRate * 100, 1),
      data_quality_score: dataQualityScore,
      populated_runs_7d: populatedRuns,
      total_runs_7d: totalRuns,
      reliability_score: dataQualityScore ?? round(httpRate * 100, 1),
    };
  });

  return {
    score: round(average(perSource.map((row) => row.reliability_score)) || 0, 2),
    rows: perSource,
  };
}

function schemaConsistencyScore(temporal) {
  const rows = temporal?.observability?.snapshot_consistency?.snapshots || [];
  if (!rows.length) return 0;
  return round(average(rows.map((row) => ((row.schema_stable && row.snapshot_consistency) ? 100 : row.schema_stable ? 60 : 0))) || 0, 2);
}

function detectOperationalFlags(stageResults, latest, temporal, edgeValidation) {
  const flags = [];
  if (stageResults.some((stage) => stage.status === 'failed')) flags.push('failed_extractions');
  if ((latest?.meta?.source_health || []).some((row) => (row.failures || 0) > 0 || row.status !== 'ok')) flags.push('source_degradation');
  if (temporal?.observability?.snapshot_consistency?.schema_drift_detected) flags.push('schema_drift');
  if ((temporal?.temporal_density?.density_assessment || 'low') === 'low') flags.push('incomplete_timelines');
  if (temporal?.temporal_density?.stale_timeline_detected) flags.push('stale_timeline');
  if (temporal?.observability?.snapshot_consistency?.duplicate_timestamps_detected) flags.push('duplicate_timestamps');
  if (temporal?.observability?.snapshot_consistency?.orphan_snapshots_detected) flags.push('orphan_snapshots');
  if (temporal?.observability?.snapshot_consistency?.schedule_drift_detected) flags.push('schedule_drift');
  const generatedAt = latest?.meta?.generated_at ? new Date(latest.meta.generated_at).getTime() : null;
  if (generatedAt && (Date.now() - generatedAt) > (3 * 3600000)) flags.push('stale_data');
  if ((edgeValidation?.summary?.validation_bucket_counts?.collapsed || 0) > 0) flags.push('edge_collapse_detected');
  return flags;
}

function buildOperationsHealth(stageResults, latest, temporal, edgeValidation) {
  const attempted = stageResults.filter((stage) => stage.status !== 'skipped').length;
  const succeeded = stageResults.filter((stage) => stage.status === 'ok').length;
  const extractionSuccessRate = attempted ? (succeeded / attempted) * 100 : 0;
  const sourceReliabilityMetrics = sourceReliability(latest);
  const schemaScore = schemaConsistencyScore(temporal);
  const marketDataQualityScore = temporal?.observability?.market_data_quality_score || 0;
  const densityMetrics = snapshotDensityMetrics(temporal);
  const staleTemporalMinutes = temporal?.observability?.staleness?.minutes_since_last_snapshot ?? null;
  const timelineContinuity = densityMetrics.continuity_ok ? 100 : 0;

  const pipelineHealthScore = round(clamp(
    (extractionSuccessRate * 0.35) +
    (sourceReliabilityMetrics.score * 0.2) +
    (schemaScore * 0.15) +
    (marketDataQualityScore * 0.15) +
    (densityMetrics.snapshot_density_score * 0.1) +
    (timelineContinuity * 0.05),
    0,
    100
  ), 2);

  return {
    pipeline_health_score: pipelineHealthScore,
    source_reliability_score: sourceReliabilityMetrics.score,
    extraction_success_rate: round(extractionSuccessRate, 2),
    schema_consistency_score: schemaScore,
    market_data_quality_score: round(marketDataQualityScore, 2),
    snapshot_density_score: densityMetrics.snapshot_density_score,
    source_reliability: sourceReliabilityMetrics.rows,
    snapshot_density: densityMetrics,
    staleness: {
      minutes_since_last_snapshot: staleTemporalMinutes,
      stale_timeline: staleTemporalMinutes !== null ? staleTemporalMinutes > 240 : false,
    },
    operational_flags: detectOperationalFlags(stageResults, latest, temporal, edgeValidation),
  };
}

function buildScheduledPayloads(temporal, snapshotLabel, generatedAtIso) {
  const scheduleWindows = [
    '06:00_open',
    '08:00_early',
    '10:00_market',
    '13:00_lineup_watch',
    'lineup_confirm',
    '60m_pregame',
    '15m_pregame',
    'close',
  ];
  const sourceHistory = temporal?.observability?.source_health_over_time || [];
  const latestByWindow = new Map();

  for (const entry of sourceHistory) {
    const keys = [entry.source_label, entry.auto_label].filter(Boolean);
    for (const key of keys) {
      const current = latestByWindow.get(key);
      if (!current || new Date(entry.timestamp).getTime() >= new Date(current.timestamp).getTime()) {
        latestByWindow.set(key, entry);
      }
    }
  }

  const now = new Date(generatedAtIso).getTime();
  return scheduleWindows.map((label, index) => {
    const entry = latestByWindow.get(label) || null;
    const timestamp = entry?.timestamp || null;
    const ageMinutes = timestamp ? Math.max(0, Math.round((now - new Date(timestamp).getTime()) / 60000)) : null;
    return {
      order: index + 1,
      label,
      status: label === snapshotLabel ? 'current' : entry ? 'captured' : 'pending',
      source_label: entry?.source_label || null,
      auto_label: entry?.auto_label || null,
      timestamp,
      age_minutes: ageMinutes,
      source_confidence: entry?.source_confidence ?? null,
      market_data_quality_score: entry?.market_data_quality_score ?? null,
    };
  });
}

function buildScheduleTiming(latest, temporal, snapshotLabel, scheduledPayloads, generatedAtIso) {
  const latestSnapshot = temporal?.obs?.source_health_over_time?.[temporal.obs.source_health_over_time.length - 1] || null;
  const currentWindow = snapshotLabel || latest?.meta?.snapshot_label || latestSnapshot?.auto_label || 'unknown';
  const currentPayload = scheduledPayloads.find((payload) => payload.label === currentWindow) || null;
  const latestCaptured = [...scheduledPayloads].reverse().find((payload) => payload.status === 'current' || payload.status === 'captured') || null;
  const nextScheduled = scheduledPayloads.find((payload) => payload.status === 'pending') || null;
  const latestSnapshotAt = latestCaptured?.timestamp || latestSnapshot?.timestamp || null;
  const scheduleLagMinutes = latestSnapshotAt ? Math.max(0, Math.round((Date.now() - new Date(latestSnapshotAt).getTime()) / 60000)) : null;
  const scheduleLagWindows = latestCaptured
    ? Math.max(0, scheduledPayloads.findIndex((payload) => payload.label === currentWindow) - scheduledPayloads.findIndex((payload) => payload.label === latestCaptured.label))
    : null;

  return {
    process_updated_at: generatedAtIso,
    last_snapshot_captured_at: latestSnapshotAt,
    last_snapshot_label: latestCaptured?.label || latestSnapshot?.auto_label || null,
    next_scheduled_snapshot: nextScheduled?.label || null,
    current_schedule_window: currentWindow,
    schedule_lag_minutes: scheduleLagMinutes,
    schedule_lag_windows: scheduleLagWindows,
    schedule_state: currentPayload?.status === 'current'
      ? 'on_schedule'
      : currentPayload?.status === 'captured'
        ? 'catching_up'
        : 'idle',
  };
}

function buildReport(status, latest, temporal, edgeValidation, clvResearch) {
  const persistent = (edgeValidation?.records || [])
    .filter((row) => ['survived', 'informative', 'strengthened'].includes(row.validation_bucket))
    .sort((a, b) => (b.edge_persistence_score || 0) - (a.edge_persistence_score || 0))
    .slice(0, 8);
  const collapses = (edgeValidation?.records || [])
    .filter((row) => row.validation_bucket === 'collapsed')
    .slice(0, 8);
  const volatileGames = [...(temporal?.games || [])]
    .sort((a, b) => (b.market_state?.average_volatility_score || 0) - (a.market_state?.average_volatility_score || 0))
    .slice(0, 8);
  const sharpSignals = (temporal?.games || [])
    .filter((game) => (game.market_state?.state_flags || []).some((flag) => ['late_sharp_movement', 'information_driven_movement', 'disagreement_resolution'].includes(flag)))
    .slice(0, 8);

  const lines = [
    '# Daily MLB Operations Report',
    '',
    `Date: ${status.meta.date}`,
    `Mode: ${status.meta.ops_mode}`,
    `Run label: ${status.meta.snapshot_label}`,
    '',
    '## Pipeline Health',
    '',
    `- Pipeline health score: ${formatNum(status.operational_health.pipeline_health_score, 1)}`,
    `- Extraction success rate: ${formatNum(status.operational_health.extraction_success_rate, 1)}%`,
    `- Schema consistency score: ${formatNum(status.operational_health.schema_consistency_score, 1)}`,
    `- Market data quality score: ${formatNum(status.operational_health.market_data_quality_score, 1)}`,
    `- Snapshot density score: ${formatNum(status.operational_health.snapshot_density_score, 1)}`,
    `- Operational flags: ${status.operational_health.operational_flags.join(', ') || 'none'}`,
    '',
    '## Source Reliability',
    '',
  ];

  for (const row of status.operational_health.source_reliability) {
    lines.push(`- ${row.source}: reliability ${formatNum(row.reliability_score, 1)}, successes ${row.successes}, failures ${row.failures}, status ${row.status}`);
  }
  lines.push('');
  lines.push('## Highest Persistent Edges');
  lines.push('');
  if (!persistent.length) {
    lines.push('No persistent edges yet.');
  } else {
    for (const row of persistent) {
      lines.push(`- ${row.team} in ${row.matchup}: persistence ${formatNum(row.edge_persistence_score, 1)}, latest edge ${formatNum((row.latest_edge || 0) * 100, 2)} pts, bucket ${row.validation_bucket}`);
    }
  }
  lines.push('');
  lines.push('## Largest Edge Collapse');
  lines.push('');
  if (!collapses.length) {
    lines.push('No edge collapses detected.');
  } else {
    for (const row of collapses) {
      lines.push(`- ${row.team} in ${row.matchup}: first ${formatNum((row.first_edge || 0) * 100, 2)} pts, latest ${formatNum((row.latest_edge || 0) * 100, 2)} pts`);
    }
  }
  lines.push('');
  lines.push('## Most Volatile Markets');
  lines.push('');
  for (const game of volatileGames) {
    lines.push(`- ${game.matchup.away.team} @ ${game.matchup.home.team}: volatility ${formatNum(game.market_state?.average_volatility_score, 1)}, flags ${(game.market_state?.state_flags || []).join(', ') || 'none'}`);
  }
  lines.push('');
  lines.push('## Potential Sharp Activity');
  lines.push('');
  if (!sharpSignals.length) {
    lines.push('No sharp-activity candidates.');
  } else {
    for (const game of sharpSignals) {
      lines.push(`- ${game.matchup.away.team} @ ${game.matchup.home.team}: ${(game.market_state?.state_flags || []).join(', ')}`);
    }
  }
  lines.push('');
  lines.push('## Timeline Quality');
  lines.push('');
  lines.push(`- Snapshot count: ${status.operational_health.snapshot_density.snapshot_count}`);
  lines.push(`- Labels present: ${(status.operational_health.snapshot_density.labels_present || []).join(', ') || 'none'}`);
  lines.push(`- Density assessment: ${status.operational_health.snapshot_density.timeline_density_assessment}`);
  lines.push('');
  lines.push('## CLV Preparation Status');
  lines.push('');
  lines.push(`- Average edge persistence: ${formatNum(clvResearch?.summary?.average_edge_persistence_score, 1)}`);
  lines.push(`- Average edge half-life (hrs): ${formatNum(clvResearch?.summary?.average_edge_half_life_hours, 2)}`);
  lines.push(`- Market stabilization timing: ${formatNum(clvResearch?.summary?.market_stabilization_timing_minutes_to_first_pitch, 1)} min to first pitch`);
  lines.push(`- Validation buckets: ${JSON.stringify(clvResearch?.summary?.validation_bucket_counts || {})}`);
  lines.push('');
  lines.push('## Stage Durations');
  lines.push('');
  for (const stage of status.stage_results) {
    lines.push(`- ${stage.name}: ${stage.status}, ${formatNum(stage.duration_seconds, 2)}s`);
  }

  return lines.join('\n');
}

function main() {
  const latestBefore = loadJsonIfExists(LATEST_PATH);
  const snapshotLabel = FORCE_LABEL || buildAutoLabel(new Date().toISOString(), latestBefore);
  const plan = buildStagePlan(snapshotLabel);
  const stageResults = [];

  for (const stage of plan) {
    if (!stage.enabled) {
      stageResults.push({
        name: stage.name,
        script: stage.script,
        status: 'skipped',
        reason: `Skipped in ${OPS_MODE} mode.`,
        duration_seconds: 0,
      });
      continue;
    }
    const result = runNodeScript(stage.script, stage.env);
    stageResults.push({
      name: stage.name,
      ...result,
    });
  }

  const latest = loadJsonIfExists(LATEST_PATH);
  const scored = loadJsonIfExists(SCORED_PATH);
  const temporal = loadJsonIfExists(TEMPORAL_STATE_PATH);
  const edgePersistence = loadJsonIfExists(EDGE_PERSISTENCE_PATH);
  const edgeValidation = loadJsonIfExists(EDGE_VALIDATION_PATH);
  const clvResearch = loadJsonIfExists(CLV_RESEARCH_PATH);

  const operationalHealth = buildOperationsHealth(stageResults, latest, temporal, edgeValidation);
  const generatedAt = new Date().toISOString();
  const scheduledPayloads = buildScheduledPayloads(temporal, snapshotLabel, generatedAt);
  const scheduleTiming = buildScheduleTiming(latest, temporal, snapshotLabel, scheduledPayloads, generatedAt);
  const timelineProgress = scheduledPayloads.reduce((acc, payload) => {
    acc.total += 1;
    if (payload.status === 'current') acc.current += 1;
    else if (payload.status === 'captured') acc.completed += 1;
    else acc.pending += 1;
    return acc;
  }, { total: 0, completed: 0, current: 0, pending: 0 });
  timelineProgress.completion_pct = timelineProgress.total
    ? round(((timelineProgress.completed + timelineProgress.current) / timelineProgress.total) * 100, 2)
    : 0;
  const status = {
    meta: {
      date: DATE,
      generated_at: generatedAt,
      ops_mode: OPS_MODE,
      snapshot_label: snapshotLabel,
      schedule_windows: [
        '06:00_open',
        '08:00_early',
        '10:00_market',
        '13:00_lineup_watch',
        'lineup_confirm',
        '60m_pregame',
        '15m_pregame',
      'close',
      ],
      scheduled_payloads: scheduledPayloads,
      current_schedule_window: scheduleTiming.current_schedule_window,
      latest_snapshot_label: scheduleTiming.last_snapshot_label,
      latest_snapshot_time: scheduleTiming.last_snapshot_captured_at,
      schedule_timing: scheduleTiming,
    },
    stage_results: stageResults,
    execution_plan: buildExecutionPlan({
      date: DATE,
      snapshotLabel,
      generatedAt,
      stageResults,
    }),
    operational_health: {
      ...operationalHealth,
      timeline_progress: timelineProgress,
    },
    artifact_status: {
      latest_matchups_ready: !!latest,
      scored_matchups_ready: !!scored,
      temporal_market_state_ready: !!temporal,
      edge_persistence_ready: !!edgePersistence,
      edge_validation_ready: !!edgeValidation,
      clv_research_ready: !!clvResearch,
    },
    database_preparation: {
      sqlite: {
        operations_runs: ['date', 'generated_at', 'ops_mode', 'snapshot_label', 'pipeline_health_score', 'operational_flags_json'],
        pipeline_stages: ['date', 'run_timestamp', 'stage_name', 'status', 'duration_seconds', 'exit_code', 'stderr'],
      },
      postgres_hint: 'Partition operations_runs by date and index pipeline_stages on (date, stage_name, status).',
      timeseries_hint: 'Persist snapshot_density_score and market_data_quality_score as daily operational observability metrics.',
    },
    alerting_foundation: {
      future_alerts: [
        'persistent_edge',
        'edge_collapse',
        'steam_plus_positive_edge',
        'reverse_movement',
        'volatility_spike',
        'stale_line',
        'late_sharp_movement',
      ],
    },
  };
  const checklist = buildOperationalChecklist({
    date: DATE,
    generatedAt,
    scheduleTiming,
    timelineProgress,
    staleness: operationalHealth.staleness,
    operationalFlags: operationalHealth.operational_flags,
    snapshotDensityScore: operationalHealth.snapshot_density_score,
    pipelineHealthScore: operationalHealth.pipeline_health_score,
    sourceReliabilityScore: operationalHealth.source_reliability_score,
  });
  status.meta.operational_checklist = checklist;

  ensureDir(OPS_LOG_DIR);
  const logPath = path.join(OPS_LOG_DIR, `${DATE}_${snapshotLabel}_operations.json`);
  writeJson(OPERATIONS_STATUS_PATH, status);
  writeJson(EXECUTION_PLAN_PATH, status.execution_plan);
  writeJson(logPath, status);
  writeJson(CHECKLIST_PATH, checklist);
  writeText(DAILY_REPORT_PATH, buildReport(status, latest, temporal, edgeValidation, clvResearch));
  writeDailyRunRecord(DATE, {
    generated_at: generatedAt,
    ops_mode: OPS_MODE,
    snapshot_label: snapshotLabel,
    status,
    execution_plan: status.execution_plan,
    stage_results: stageResults,
    operational_health: operationalHealth,
    operational_checklist: checklist,
  });
  appendDailyEvent(DATE, {
    type: 'orchestrator',
    status: stageResults.some((stage) => stage.status === 'failed') ? 'degraded' : 'completed',
    snapshot_label: snapshotLabel,
    pipeline_health_score: status.operational_health.pipeline_health_score,
  });

  console.log(JSON.stringify({
    outputs: [
      path.relative(process.cwd(), OPERATIONS_STATUS_PATH),
      path.relative(process.cwd(), EXECUTION_PLAN_PATH),
      path.relative(process.cwd(), logPath),
      path.relative(process.cwd(), DAILY_REPORT_PATH),
    ],
    pipelineHealth: status.operational_health.pipeline_health_score,
    stageStatuses: stageResults.map((stage) => ({ name: stage.name, status: stage.status })),
  }, null, 2));
}

main();
