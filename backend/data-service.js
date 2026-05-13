const fs = require('fs');
const path = require('path');
const {
  generateExecutiveAllocation,
} = require('../src/decision-engines/cio-agent');

const ROOT = path.resolve(__dirname, '..');
const OPS_ROOT = path.join(ROOT, 'mlb_ops');
const PROCESSED_DIR = path.join(OPS_ROOT, 'processed');
const REPORTS_DIR = path.join(OPS_ROOT, 'reports');
const SNAPSHOTS_DIR = path.join(OPS_ROOT, 'snapshots');
const LOGS_DIR = path.join(OPS_ROOT, 'logs');
const HISTORY_DIR = path.join(OPS_ROOT, 'historical');
const RESEARCH_HISTORY_DIR = path.join(HISTORY_DIR, 'research');
const RESEARCH_HISTORY_PATH = path.join(RESEARCH_HISTORY_DIR, 'history.jsonl');
const DECISION_LEDGER_DIR = path.join(HISTORY_DIR, 'decision_ledger');
const QUANT_REPORTS_DIR = path.join(REPORTS_DIR, 'quant_reports');
const RESEARCH_WINDOWS = [
  '06:00_open',
  '08:00_early',
  '10:00_market',
  'lineup_confirm',
  '60m_pregame',
  '15m_pregame',
  'close',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? readJson(filePath) : null;
}

function readJsonLinesIfExists(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function appendText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, text, 'utf8');
}

function round(value, digits = 4) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function average(values, digits = 4) {
  const usable = values.filter((value) => value !== null && value !== undefined && Number.isFinite(value));
  if (!usable.length) return null;
  return round(usable.reduce((sum, value) => sum + value, 0) / usable.length, digits);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function latestReplayPath(date) {
  return path.join(PROCESSED_DIR, 'replay_data', `${date}_replay_data.json`);
}

function loadCoreState() {
  const scored = readJsonIfExists(path.join(PROCESSED_DIR, 'scored_matchups.json'));
  const temporal = readJsonIfExists(path.join(PROCESSED_DIR, 'temporal_market_state.json'));
  const persistence = readJsonIfExists(path.join(PROCESSED_DIR, 'edge_persistence.json'));
  const clvPreparation = readJsonIfExists(path.join(PROCESSED_DIR, 'clv_preparation.json'));
  const timeline = readJsonIfExists(path.join(PROCESSED_DIR, 'market_timeline.json'));
  const operations = readJsonIfExists(path.join(PROCESSED_DIR, 'daily_operations_status.json'));
  const edgeValidation = readJsonIfExists(path.join(PROCESSED_DIR, 'edge_validation.json'));
  const clvResearch = readJsonIfExists(path.join(PROCESSED_DIR, 'clv_research.json'));
  const persistenceResearch = readJsonIfExists(path.join(PROCESSED_DIR, 'persistence_research.json'));
  const timingResearch = readJsonIfExists(path.join(PROCESSED_DIR, 'timing_quality_research.json'));
  const researchStatus = readJsonIfExists(path.join(PROCESSED_DIR, 'research_status.json'));
  const checklist = readJsonIfExists(path.join(PROCESSED_DIR, 'operational_checklist.json'));
  const date = operations?.meta?.date || temporal?.meta?.date || scored?.meta?.date || new Date().toISOString().slice(0, 10);
  const bootstrap = readJsonIfExists(path.join(HISTORY_DIR, 'bootstrap', `${date}.json`));
  const researchBundle = readJsonIfExists(path.join(HISTORY_DIR, 'research', date, 'research_bundle.json'));
  const replay = readJsonIfExists(latestReplayPath(date));
  return {
    date,
    scored,
    temporal,
    persistence,
    clvPreparation,
    timeline,
    operations,
    edgeValidation,
    clvResearch,
    persistenceResearch,
    timingResearch,
    researchStatus,
    checklist,
    bootstrap,
    researchBundle,
    replay,
  };
}

function classifyHealthStatus(value) {
  if (value === null || value === undefined) return 'unknown';
  if (value >= 85) return 'healthy';
  if (value >= 65) return 'degraded';
  if (value >= 40) return 'incomplete';
  return 'stale';
}

function refreshPolicy(snapshotLabel) {
  if (['close'].includes(snapshotLabel)) {
    return { interval_ms: 15000, profile: 'close', rationale: 'Immediate close monitoring.' };
  }
  if (['15m_pregame', '60m_pregame', 'lineup_confirm'].includes(snapshotLabel)) {
    return { interval_ms: 75000, profile: 'pregame', rationale: 'Aggressive refresh near lineup lock and first pitch.' };
  }
  if (['10:00_market', '13:00_lineup_watch'].includes(snapshotLabel)) {
    return { interval_ms: 300000, profile: 'market_watch', rationale: 'Medium cadence during market formation.' };
  }
  return { interval_ms: 600000, profile: 'open', rationale: 'Lower cadence during early operational window.' };
}

function buildScheduledPayloads(state, latestSourceLabel, refresh) {
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

  const sourceHistory = state.temporal?.observability?.source_health_over_time || [];
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

  const currentWindow = state.operations?.meta?.snapshot_label || latestSourceLabel?.source_label || latestSourceLabel?.auto_label || 'unknown';
  const now = Date.now();

  return scheduleWindows.map((label, index) => {
    const entry = latestByWindow.get(label) || null;
    const timestamp = entry?.timestamp || null;
    const ageMinutes = timestamp ? Math.max(0, Math.round((now - new Date(timestamp).getTime()) / 60000)) : null;
    const status = entry ? (label === currentWindow ? 'current' : 'captured') : 'pending';
    return {
      order: index + 1,
      label,
      status,
      source_label: entry?.source_label || null,
      auto_label: entry?.auto_label || null,
      timestamp,
      age_minutes: ageMinutes,
      source_confidence: entry?.source_confidence ?? null,
      market_data_quality_score: entry?.market_data_quality_score ?? null,
      refresh_profile: refresh.profile,
    };
  });
}

function buildScheduleTiming(state, latestSourceLabel, scheduledPayloads) {
  const currentWindow = state.operations?.meta?.snapshot_label || latestSourceLabel?.source_label || latestSourceLabel?.auto_label || 'unknown';
  const currentIndex = scheduledPayloads.findIndex((payload) => payload.label === currentWindow);
  const latestCaptured = [...scheduledPayloads].reverse().find((payload) => payload.status === 'current' || payload.status === 'captured') || null;
  const latestCapturedIndex = latestCaptured ? scheduledPayloads.findIndex((payload) => payload.label === latestCaptured.label) : -1;
  const nextSnapshot = currentIndex >= 0
    ? scheduledPayloads.slice(currentIndex + 1).find((payload) => payload.status === 'pending')
    : scheduledPayloads.find((payload) => payload.status === 'pending') || null;
  const processUpdatedAt = state.operations?.meta?.generated_at || new Date().toISOString();
  const latestSnapshotAt = latestSourceLabel?.timestamp || latestCaptured?.timestamp || null;
  const scheduleLagMinutes = latestSnapshotAt ? Math.max(0, Math.round((Date.now() - new Date(latestSnapshotAt).getTime()) / 60000)) : null;
  const scheduleLagWindows = currentIndex >= 0 && latestCapturedIndex >= 0
    ? Math.max(0, currentIndex - latestCapturedIndex)
    : null;

  return {
    process_updated_at: processUpdatedAt,
    last_snapshot_captured_at: latestSnapshotAt,
    last_snapshot_label: latestCaptured?.label || latestSourceLabel?.auto_label || latestSourceLabel?.source_label || null,
    next_scheduled_snapshot: nextSnapshot?.label || null,
    current_schedule_window: currentWindow,
    schedule_lag_minutes: scheduleLagMinutes,
    schedule_lag_windows: scheduleLagWindows,
    schedule_state: scheduleLagWindows === 0 ? 'on_schedule' : scheduleLagWindows > 0 ? 'behind_schedule' : 'idle',
  };
}

function statusPill(value, positive = true) {
  if (value === null || value === undefined) return 'neutral';
  if (positive) {
    if (value >= 80) return 'good';
    if (value >= 60) return 'warn';
    return 'bad';
  }
  if (value <= 25) return 'good';
  if (value <= 50) return 'warn';
  return 'bad';
}

function signedPct(value) {
  if (value === null || value === undefined) return null;
  return round(value * 100, 2);
}

function buildMaps(state) {
  return {
    temporalByGame: new Map((state.temporal?.games || []).map((game) => [game.game_id, game])),
    replayByGame: new Map((state.replay?.games || []).map((game) => [game.game_id, game])),
    validationBySide: new Map((state.edgeValidation?.records || []).map((row) => [`${row.game_id}:${row.side}`, row])),
    clvBySide: new Map((state.clvPreparation?.records || []).map((row) => [`${row.game_id}:${row.side}`, row])),
    timelineByGame: new Map((state.timeline?.games || []).map((game) => [game.game_id, game])),
  };
}

function buildGameCard(scoredGame, maps) {
  const bestEdge = scoredGame.scoring?.best_edge || null;
  if (!bestEdge) return null;
  const key = `${scoredGame.game_id}:${bestEdge.side}`;
  const validation = maps.validationBySide.get(key) || null;
  const clv = maps.clvBySide.get(key) || null;
  const temporal = maps.temporalByGame.get(scoredGame.game_id) || null;
  const timeline = maps.timelineByGame.get(scoredGame.game_id) || null;
  const replay = maps.replayByGame.get(scoredGame.game_id) || null;
  const latestPoint = timeline?.snapshots?.length ? timeline.snapshots[timeline.snapshots.length - 1][bestEdge.side] : null;
  const openImplied = latestPoint?.open_implied_probability ?? null;
  const currentImplied = latestPoint?.current_implied_probability ?? bestEdge.market_implied_probability ?? null;
  const lineMovement = currentImplied !== null && openImplied !== null ? round((currentImplied - openImplied) * 100, 2) : null;
  const persistenceScore = validation?.edge_persistence_score ?? temporal?.sides?.[bestEdge.side]?.edge_persistence_score ?? null;
  const volatilityScore = validation?.average_volatility_score ?? temporal?.market_state?.average_volatility_score ?? bestEdge.volatility_score ?? null;
  const edgeTrend = validation?.validation_bucket === 'collapsed'
    ? 'edge_collapse'
    : (validation?.edge_decay_rate ?? 0) < -0.01
      ? 'edge_decay'
      : (validation?.latest_edge ?? 0) > (validation?.first_edge ?? 0) + 0.015
        ? 'edge_strengthening'
        : persistenceScore >= 70
          ? 'stable_edge'
          : 'mixed';
  const marketStateFlags = temporal?.market_state?.state_flags || [];
  const riskFlags = [...new Set([
    ...(bestEdge.flags || []),
    ...(validation?.signals || []),
    ...marketStateFlags,
  ])];
  const category = bestEdge.preliminary_lean === 'Bettable lean'
    ? 'top_bettable'
    : bestEdge.preliminary_lean === 'Watchlist lean'
      ? 'watchlist'
      : bestEdge.preliminary_lean === 'No action edge'
        ? 'no_action'
        : 'other';

  return {
    game_id: scoredGame.game_id,
    matchup: `${scoredGame.matchup.away.team} @ ${scoredGame.matchup.home.team}`,
    stadium: scoredGame.matchup.stadium,
    game_time_local: scoredGame.matchup.game_time_local,
    selection_side: bestEdge.side,
    selection_team: bestEdge.team,
    opponent: bestEdge.team === scoredGame.matchup.home.team ? scoredGame.matchup.away.team : scoredGame.matchup.home.team,
    category,
    lean: bestEdge.preliminary_lean,
    fair_probability: bestEdge.fair_win_probability,
    market_probability: bestEdge.market_implied_probability,
    edge_pct_points: bestEdge.edge_vs_market_pct_points,
    quant_score: bestEdge.final_edge_score,
    confidence_score: bestEdge.confidence_score,
    persistence_score: persistenceScore,
    volatility_score: volatilityScore,
    edge_trend: edgeTrend,
    risk_flags: riskFlags,
    market_pressure: temporal?.market_state?.market_pressure_average ?? 0,
    line_movement_pct_points: lineMovement,
    line_current_american: latestPoint?.current_american ?? bestEdge.market_american,
    line_open_american: latestPoint?.open_american ?? bestEdge.open_market_american,
    market_state_flags: marketStateFlags,
    validation_bucket: validation?.validation_bucket || null,
    clv_ready: clv?.clv_ready || false,
    close_snapshot_missing: clv?.needs_close_snapshot ?? true,
    timing_quality_score: clv?.timing_quality_score ?? null,
    replay_snapshot_count: replay?.snapshot_count ?? timeline?.snapshots?.length ?? 0,
  };
}

function buildFadeCards(scoredGames) {
  const rows = [];
  for (const game of scoredGames) {
    for (const side of ['away', 'home']) {
      const score = game.scoring?.[side];
      if (!score) continue;
      if (score.preliminary_lean !== 'Fade / avoid price' && !(score.flags || []).includes('overpriced_favorite')) continue;
      rows.push({
        game_id: game.game_id,
        matchup: `${game.matchup.away.team} @ ${game.matchup.home.team}`,
        team: score.team,
        side,
        fair_probability: score.fair_win_probability,
        market_probability: score.market_implied_probability,
        edge_pct_points: score.edge_vs_market_pct_points,
        quant_score: score.final_edge_score,
        volatility_score: score.volatility_score,
        flags: score.flags || [],
        lean: score.preliminary_lean,
      });
    }
  }
  return rows.sort((a, b) => a.edge_pct_points - b.edge_pct_points).slice(0, 10);
}

function keyByGameSide(row) {
  return `${row.game_id}:${row.side}`;
}

function normalizeWindowLabel(value) {
  if (!value) return 'unknown';
  if (value === 'early') return '08:00_early';
  if (value === 'market') return '10:00_market';
  if (value === 'open') return '06:00_open';
  return value;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function countBy(rows, getKey) {
  const counts = new Map();
  for (const row of rows) {
    const key = getKey(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function meanAbs(values, digits = 4) {
  return average(values.map((value) => (value === null || value === undefined ? null : Math.abs(value))), digits);
}

function classifyVolatilityRegime(score) {
  if (score === null || score === undefined || !Number.isFinite(Number(score))) return 'unknown';
  const numeric = Number(score);
  if (numeric <= 4) return 'stable';
  if (numeric <= 9) return 'balanced';
  if (numeric <= 14) return 'elevated';
  return 'turbulent';
}

function classifyResearchLifecycle(record) {
  const strengtheningRate = Number(record.edge_strengthening_rate || 0);
  const decayRate = Number(record.edge_decay_rate || 0);
  const persistenceScore = Number(record.edge_persistence_score || 0);
  const stabilityScore = Number(record.edge_stability_score || 0);
  const validationBucket = record.validation_bucket || null;

  if (strengtheningRate > 0.002 || Number(record.latest_edge || 0) > Number(record.first_edge || 0) + 0.005) {
    return 'strengthening';
  }
  if (validationBucket === 'rejected' || decayRate < -0.002 || persistenceScore < 65) {
    return 'collapsing';
  }
  if (stabilityScore < 85 || Math.abs(decayRate) > 0.001) {
    return 'unstable';
  }
  return 'persistent';
}

function resolveResearchHistoryEntries() {
  const history = readJsonLinesIfExists(RESEARCH_HISTORY_PATH)
    .sort((a, b) => new Date(a.generated_at || a.date || 0).getTime() - new Date(b.generated_at || b.date || 0).getTime());

  return history.map((entry) => {
    const relativeBundlePath = entry.memory_file || `historical/research/${entry.date}/research_bundle.json`;
    const bundlePath = path.join(OPS_ROOT, relativeBundlePath);
    return {
      ...entry,
      bundle: readJsonIfExists(bundlePath),
      bundle_path: relativeBundlePath,
    };
  });
}

function buildResearchWorkspace() {
  const state = loadCoreState();
  const overview = buildOverview();
  const persistenceRecords = safeArray(state.persistenceResearch?.records);
  const timingRecords = safeArray(state.timingResearch?.records);
  const clvRecords = safeArray(state.clvResearch?.records);
  const historyEntries = resolveResearchHistoryEntries();
  const latestSourceLabel = state.timeline?.meta?.source_labels?.length
    ? state.timeline.meta.source_labels[state.timeline.meta.source_labels.length - 1]
    : null;
  const refresh = refreshPolicy(state.operations?.meta?.snapshot_label || latestSourceLabel?.auto_label || null);
  const timingByKey = new Map(timingRecords.map((row) => [keyByGameSide(row), row]));
  const clvByKey = new Map(clvRecords.map((row) => [keyByGameSide(row), row]));

  const fusedRecords = persistenceRecords.map((record) => {
    const timing = timingByKey.get(keyByGameSide(record)) || null;
    const clv = clvByKey.get(keyByGameSide(record)) || null;
    const lifecycle = classifyResearchLifecycle({
      ...record,
      validation_bucket: clv?.validation_bucket || null,
    });
    return {
      ...record,
      best_window: normalizeWindowLabel(timing?.best_window || clv?.early_entry_label || null),
      timing_quality_score: timing?.timing_quality_score ?? clv?.timing_quality_signal ?? null,
      edge_durability_score: timing?.edge_durability_score ?? null,
      close_delta_implied: timing?.best_window_delta_to_close ?? clv?.early_to_close_delta_implied ?? null,
      validation_bucket: clv?.validation_bucket || 'unclassified',
      close_proxy_available: clv?.close_proxy_available ?? false,
      pregame_available: clv?.pregame_available ?? false,
      market_state_flags: clv?.market_state_flags || [],
      signals: clv?.signals || [],
      lifecycle,
      volatility_regime: classifyVolatilityRegime(record.average_volatility_score),
      market_regime: clv?.market_state_flags?.includes('stable_market')
        ? 'stable_market'
        : clv?.market_state_flags?.includes('volatile_market')
          ? 'volatile_market'
          : 'mixed',
    };
  });

  const strongestEdges = [...fusedRecords]
    .sort((a, b) => (b.edge_persistence_score || 0) - (a.edge_persistence_score || 0))
    .slice(0, 6);
  const weakestEdges = [...fusedRecords]
    .sort((a, b) => (a.edge_persistence_score || 0) - (b.edge_persistence_score || 0))
    .slice(0, 6);

  const lifecycleCounts = ['persistent', 'unstable', 'collapsing', 'strengthening'].map((label) => ({
    label,
    count: fusedRecords.filter((record) => record.lifecycle === label).length,
  }));

  const totalStrengthening = fusedRecords.filter((record) => record.lifecycle === 'strengthening').length;
  const totalDecay = fusedRecords.filter((record) => record.lifecycle === 'collapsing').length;

  const survivalCurve = [50, 60, 70, 80, 90, 95].map((threshold) => ({
    threshold,
    survival_rate: fusedRecords.length
      ? round((fusedRecords.filter((record) => Number(record.edge_persistence_score || 0) >= threshold).length / fusedRecords.length) * 100, 2)
      : 0,
  }));

  const comparisons = clvRecords.flatMap((record) => safeArray(record.comparisons).map((comparison) => ({
    game_id: record.game_id,
    matchup: record.matchup,
    side: record.side,
    team: record.team,
    validation_bucket: record.validation_bucket,
    edge_persistence_score: record.edge_persistence_score,
    edge_stability_score: record.edge_stability_score,
    timing_quality_signal: record.timing_quality_signal,
    market_state_flags: record.market_state_flags || [],
    volatility_regime: classifyVolatilityRegime(comparison.volatility_score),
    snapshot_label: normalizeWindowLabel(comparison.snapshot_label || comparison.source_label),
    source_label: comparison.source_label || comparison.snapshot_label || 'unknown',
    timestamp: comparison.timestamp,
    minutes_to_first_pitch: comparison.minutes_to_first_pitch ?? null,
    implied_delta_to_close: comparison.implied_delta_to_close ?? null,
    volatility_score: comparison.volatility_score ?? null,
    market_disagreement_score: comparison.market_disagreement_score ?? null,
    favorable_to_close: comparison.favorable_to_close ?? null,
    stabilized: comparison.implied_delta_to_close === null ? null : Math.abs(comparison.implied_delta_to_close) <= 0.005,
    correction_velocity: comparison.implied_delta_to_close === null || comparison.minutes_to_first_pitch === null
      ? null
      : Math.abs(comparison.implied_delta_to_close) / Math.max(comparison.minutes_to_first_pitch / 60, 0.25),
  })));

  const windowRows = [...new Set([...RESEARCH_WINDOWS, ...comparisons.map((row) => row.snapshot_label).filter(Boolean)])]
    .map((window) => {
      const byWindow = comparisons.filter((row) => row.snapshot_label === window);
      const persisted = fusedRecords.filter((record) => record.best_window === window);
      return {
        window,
        sample_count: byWindow.length,
        average_abs_close_delta: meanAbs(byWindow.map((row) => row.implied_delta_to_close), 4),
        average_timing_quality: average(persisted.map((row) => row.timing_quality_score), 2),
        average_persistence: average(persisted.map((row) => row.edge_persistence_score), 2),
        average_durability: average(persisted.map((row) => row.edge_durability_score), 2),
        average_correction_speed: average(byWindow.map((row) => row.correction_velocity), 5),
        average_minutes_to_first_pitch: average(byWindow.map((row) => row.minutes_to_first_pitch), 2),
        average_disagreement: average(byWindow.map((row) => row.market_disagreement_score), 4),
        stabilized_rate: byWindow.length
          ? round((byWindow.filter((row) => row.stabilized === true).length / byWindow.length) * 100, 2)
          : null,
        favorable_rate: byWindow.length
          ? round((byWindow.filter((row) => row.favorable_to_close === true).length / byWindow.length) * 100, 2)
          : null,
      };
    });

  const windowLeaders = [...windowRows]
    .filter((row) => row.sample_count > 0)
    .sort((a, b) => (b.average_timing_quality || -Infinity) - (a.average_timing_quality || -Infinity));

  const survivedRejected = ['survived', 'rejected', 'unclassified'].map((label) => ({
    label,
    count: fusedRecords.filter((record) => record.validation_bucket === label).length,
    average_persistence: average(fusedRecords.filter((record) => record.validation_bucket === label).map((record) => record.edge_persistence_score), 2),
  }));

  const correctionByWindow = windowRows.map((row) => ({
    window: row.window,
    correction_velocity: row.average_correction_speed,
    absorption_speed: row.stabilized_rate,
    disagreement_resolution: row.average_disagreement,
    market_stabilization_minutes: row.average_minutes_to_first_pitch,
    volatility_expansion: average(comparisons.filter((item) => item.snapshot_label === row.window).map((item) => item.volatility_score), 2),
  }));

  const regimeRows = ['stable', 'balanced', 'elevated', 'turbulent', 'unknown'].map((regime) => {
    const matchingComparisons = comparisons.filter((row) => row.volatility_regime === regime);
    const matchingEdges = fusedRecords.filter((record) => record.volatility_regime === regime);
    return {
      regime,
      count: matchingComparisons.length || matchingEdges.length,
      average_persistence: average(matchingEdges.map((row) => row.edge_persistence_score), 2),
      average_timing_quality: average(matchingEdges.map((row) => row.timing_quality_score), 2),
      average_abs_close_delta: meanAbs(matchingComparisons.map((row) => row.implied_delta_to_close), 4),
      average_volatility_score: average(matchingComparisons.map((row) => row.volatility_score), 2),
    };
  });

  const regimeHeatmap = ['stable', 'balanced', 'elevated', 'turbulent', 'unknown'].flatMap((regime) => RESEARCH_WINDOWS.map((window) => {
    const bucket = comparisons.filter((row) => row.volatility_regime === regime && row.snapshot_label === window);
    return {
      regime,
      window,
      count: bucket.length,
      average_abs_close_delta: meanAbs(bucket.map((row) => row.implied_delta_to_close), 4),
      average_disagreement: average(bucket.map((row) => row.market_disagreement_score), 4),
    };
  }));

  const historyRuns = historyEntries.map((entry, index) => ({
    index: index + 1,
    date: entry.date,
    generated_at: entry.generated_at,
    label: `${entry.date} ${new Date(entry.generated_at || entry.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    edge_survival_rate: round((entry.bundle?.persistence_research?.edge_survival_rate || 0) * 100, 2),
    average_persistence: entry.bundle?.persistence_research?.average_edge_persistence_score ?? null,
    timing_quality: entry.bundle?.timing_research?.average_timing_quality_score ?? null,
    stable_markets: entry.bundle?.market_memory?.stable_markets ?? null,
    unstable_markets: entry.bundle?.market_memory?.unstable_markets ?? null,
    line_acceleration_mean: entry.bundle?.market_memory?.line_acceleration_mean ?? null,
    survived: entry.bundle?.validation_buckets?.survived ?? 0,
    rejected: entry.bundle?.validation_buckets?.rejected ?? 0,
    bundle_path: entry.bundle_path,
  }));

  const uniqueByDate = new Map();
  for (const entry of historyEntries) {
    uniqueByDate.set(entry.date, entry);
  }
  const uniqueDayBundles = [...uniqueByDate.values()];
  const totalEdgesStudied = uniqueDayBundles.reduce((sum, entry) => {
    const buckets = entry.bundle?.validation_buckets || {};
    return sum + Object.values(buckets).reduce((bucketSum, value) => bucketSum + Number(value || 0), 0);
  }, 0);

  const memorySnapshot = state.researchBundle?.market_memory || {};
  const disagreementRegimes = Object.entries(memorySnapshot.disagreement_regimes || {}).map(([label, count]) => ({ label, count }));
  const volatilityMemory = Object.entries(memorySnapshot.volatility_regimes || {}).map(([label, count]) => ({ label, count }));
  const rankingExplainability = explainRankingDivergence(overview.sections.top_bettable || [], fusedRecords, state.checklist || {});

  return {
    meta: {
      date: state.date,
      generated_at: new Date().toISOString(),
      refresh_policy: refresh,
      research_status: state.researchStatus || null,
      history_runs: historyEntries.length,
      accumulated_research_days: uniqueByDate.size,
      total_edges_studied: totalEdgesStudied,
      latest_research_bundle: historyEntries[historyEntries.length - 1]?.bundle_path || null,
    },
    persistence: {
      summary: {
        edge_survival_rate: round((state.persistenceResearch?.summary?.edge_survival_rate || 0) * 100, 2),
        average_edge_persistence_score: state.persistenceResearch?.summary?.average_edge_persistence_score ?? null,
        strengthening_vs_decay_ratio: totalDecay ? round(totalStrengthening / totalDecay, 2) : totalStrengthening > 0 ? totalStrengthening : null,
        persistence_stability: average(fusedRecords.map((record) => record.edge_stability_score), 2),
        edge_durability: average(timingRecords.map((record) => record.edge_durability_score), 2),
      },
      strongest_edges: strongestEdges,
      weakest_edges: weakestEdges,
      lifecycle_counts: lifecycleCounts,
      by_schedule_window: windowRows,
      by_volatility_regime: regimeRows,
      survival_curve: survivalCurve,
      records: fusedRecords,
    },
    timing_quality: {
      best_window: windowLeaders[0] || null,
      windows: windowRows,
      summary: state.timingResearch?.summary || null,
    },
    survived_vs_rejected: {
      buckets: survivedRejected,
      rows: fusedRecords
        .sort((a, b) => (b.edge_persistence_score || 0) - (a.edge_persistence_score || 0))
        .slice(0, 16),
      collapse_rate: round((state.persistenceResearch?.summary?.edge_collapse_rate || 0) * 100, 2),
      strengthening_rate: round((state.persistenceResearch?.summary?.strengthening_frequency || 0) * 100, 2),
    },
    market_correction: {
      summary: {
        market_stabilization_timing_minutes_to_first_pitch: state.clvResearch?.summary?.market_stabilization_timing_minutes_to_first_pitch ?? null,
        late_movement_behavior_avg_implied_shift: state.clvResearch?.summary?.late_movement_behavior_avg_implied_shift ?? null,
      },
      windows: correctionByWindow,
      comparisons: comparisons.slice(0, 120),
    },
    volatility: {
      summary: {
        volatility_clustering_score: state.clvResearch?.summary?.volatility_clustering_score ?? null,
        stable_markets: memorySnapshot.stable_markets ?? 0,
        unstable_markets: memorySnapshot.unstable_markets ?? 0,
        high_turbulence_periods: regimeRows.find((row) => row.regime === 'turbulent')?.count || 0,
        low_turbulence_periods: regimeRows.find((row) => row.regime === 'stable')?.count || 0,
      },
      regimes: regimeRows,
      heatmap: regimeHeatmap,
      disagreement_regimes: disagreementRegimes,
      volatility_memory: volatilityMemory,
    },
    persistence_evolution: {
      history: historyRuns,
      survival_curve: survivalCurve,
    },
    clv_preparation: {
      summary: {
        average_edge_persistence_score: state.clvResearch?.summary?.average_edge_persistence_score ?? null,
        average_edge_half_life_hours: state.clvResearch?.summary?.average_edge_half_life_hours ?? null,
        validation_bucket_counts: state.clvResearch?.summary?.validation_bucket_counts || {},
      },
      window_close_deltas: windowRows.map((row) => ({
        window: row.window,
        average_abs_close_delta: row.average_abs_close_delta,
        average_persistence: row.average_persistence,
        average_timing_quality: row.average_timing_quality,
      })),
      stability_outcomes: [
        {
          label: 'stable_market',
          survived: fusedRecords.filter((record) => record.market_regime === 'stable_market' && record.validation_bucket === 'survived').length,
          rejected: fusedRecords.filter((record) => record.market_regime === 'stable_market' && record.validation_bucket === 'rejected').length,
        },
        {
          label: 'mixed',
          survived: fusedRecords.filter((record) => record.market_regime === 'mixed' && record.validation_bucket === 'survived').length,
          rejected: fusedRecords.filter((record) => record.market_regime === 'mixed' && record.validation_bucket === 'rejected').length,
        },
        {
          label: 'volatile_market',
          survived: fusedRecords.filter((record) => record.market_regime === 'volatile_market' && record.validation_bucket === 'survived').length,
          rejected: fusedRecords.filter((record) => record.market_regime === 'volatile_market' && record.validation_bucket === 'rejected').length,
        },
      ],
      records: fusedRecords.slice(0, 24),
    },
    historical_memory: {
      accumulated_research_days: uniqueByDate.size,
      research_runs: historyEntries.length,
      total_edges_studied: totalEdgesStudied,
      persistence_history: historyRuns,
      timing_history: historyRuns.map((row) => ({
        label: row.label,
        timing_quality: row.timing_quality,
        survived: row.survived,
        rejected: row.rejected,
      })),
      market_structure_history: historyRuns.map((row) => ({
        label: row.label,
        stable_markets: row.stable_markets,
        unstable_markets: row.unstable_markets,
        line_acceleration_mean: row.line_acceleration_mean,
      })),
      bundles: historyRuns,
    },
    ranking_explainability: rankingExplainability,
  };
}

function pctTextFromRatio(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'n/a';
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

function pctText(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'n/a';
  return `${Number(value).toFixed(digits)}%`;
}

function pointsTextFromProbability(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'n/a';
  const numeric = Number(value) * 100;
  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${numeric.toFixed(digits)} pts`;
}

function numText(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'n/a';
  return Number(value).toFixed(digits);
}

function bulletList(items) {
  return items.map((item) => `- ${item}`);
}

function titleCaseLabel(value) {
  return String(value || 'unknown').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function approxMinutesText(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'n/a';
  const minutes = Number(value);
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60);
    return `~${hours}h before first pitch`;
  }
  return `~${Math.round(minutes)}m before first pitch`;
}

function qualitativeVelocity(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'n/a';
  const numeric = Number(value);
  if (numeric < 0.00025) return 'low correction velocity';
  if (numeric < 0.0006) return 'moderate correction velocity';
  return 'fast correction velocity';
}

function qualitativeDisagreement(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'n/a';
  const numeric = Number(value);
  if (numeric < 0.02) return 'low disagreement';
  if (numeric < 0.05) return 'moderate disagreement';
  return 'elevated disagreement';
}

function classifyOperationalPosture({
  survivalRate,
  stableMarkets,
  unstableMarkets,
  bestWindow,
  worstWindow,
  checklist,
  topBettableCount,
}) {
  const timingSpread = bestWindow && worstWindow
    ? (bestWindow.average_timing_quality || 0) - (worstWindow.average_timing_quality || 0)
    : null;

  const marketRegime = survivalRate >= 58
    ? 'Inefficient'
    : survivalRate >= 42
      ? 'Moderately Efficient'
      : 'Highly Efficient';
  const recommendedStyle = survivalRate >= 58
    ? 'Assertive but filtered'
    : survivalRate >= 42
      ? 'Selective'
      : 'Highly selective';
  const edgeEnvironment = topBettableCount >= 5
    ? 'Broad'
    : topBettableCount >= 3
      ? 'Moderate'
      : 'Narrow';
  const timingSensitivity = timingSpread !== null && timingSpread >= 8
    ? 'High'
    : timingSpread !== null && timingSpread >= 4
      ? 'Moderate'
      : 'Low';
  const volatilityContext = unstableMarkets > stableMarkets
    ? 'Unstable expansion'
    : unstableMarkets > 0
      ? 'Controlled expansion'
      : 'Contained';
  const operationalBias = checklist.timeline_completeness?.complete
    ? 'Execute on confirmed structure'
    : 'Wait for later confirmation';
  const confirmationRequirements = checklist.timeline_completeness?.pending >= 3
    ? 'Require later-window confirmation'
    : 'Current structure is closer to actionable';

  return {
    marketRegime,
    recommendedStyle,
    edgeEnvironment,
    timingSensitivity,
    volatilityContext,
    operationalBias,
    confirmationRequirements,
  };
}

function classifyMarketEnvironment({
  survivalRate,
  bestWindow,
  stableRegime,
  turbulentRegime,
  stableMarkets,
  unstableMarkets,
  strongestDisagreement,
  topBettableCount,
}) {
  const correctionEfficiency = survivalRate >= 58
    ? 'Loose correction'
    : survivalRate >= 42
      ? 'Moderate correction'
      : 'Tight correction';
  const disagreementEnvironment = strongestDisagreement?.market_state?.average_disagreement_score === undefined
    ? 'Unclear'
    : qualitativeDisagreement(strongestDisagreement.market_state.average_disagreement_score);
  const stabilityRegime = stableMarkets > unstableMarkets ? 'Mostly stable' : unstableMarkets > 0 ? 'Mixed stability' : 'Unclear';
  const volatilityRegime = (turbulentRegime?.count || 0) > (stableRegime?.count || 0) ? 'Expansion pockets' : 'Controlled volatility';
  const persistenceBreadth = topBettableCount >= 5 ? 'Broad enough to scan' : topBettableCount >= 3 ? 'Selective breadth' : 'Thin breadth';
  const marketConvergenceQuality = bestWindow?.stabilized_rate >= 60
    ? 'Clean convergence'
    : bestWindow?.stabilized_rate >= 35
      ? 'Mixed convergence'
      : 'Slow convergence';

  return {
    correctionEfficiency,
    disagreementEnvironment,
    stabilityRegime,
    volatilityRegime,
    persistenceBreadth,
    marketConvergenceQuality,
  };
}

function buildSlateQualityDistribution(cards, researchRows) {
  const researchByGameSide = new Map(researchRows.map((row) => [`${row.game_id}:${row.side}`, row]));
  const counts = {
    'High Conviction': 0,
    Moderate: 0,
    Weak: 0,
    Unstable: 0,
  };

  for (const card of cards) {
    const row = researchByGameSide.get(`${card.game_id}:${card.selection_side}`) || null;
    if ((card.volatility_score || 0) >= 60 || (row?.lifecycle === 'collapsing') || (card.persistence_score || 0) < 65) {
      counts.Unstable += 1;
    } else if ((card.quant_score || 0) >= 20 && (card.persistence_score || 0) >= 85 && row?.validation_bucket === 'survived') {
      counts['High Conviction'] += 1;
    } else if ((card.quant_score || 0) >= 14 && (card.persistence_score || 0) >= 72) {
      counts.Moderate += 1;
    } else {
      counts.Weak += 1;
    }
  }

  return counts;
}

function buildResearchConfidence(historyRuns, checklist) {
  return [
    ['Persistence', historyRuns >= 5 ? 'Moderate' : 'Early'],
    ['Timing Quality', checklist.timeline_completeness?.completed >= 3 ? 'Moderate' : 'Early'],
    ['CLV Research', checklist.timeline_completeness?.pending >= 3 ? 'Preliminary' : 'Developing'],
    ['Volatility Research', historyRuns >= 5 ? 'Developing' : 'Early'],
  ];
}

function buildStructureNarrative(card, research) {
  if (!card) return 'No narrative available.';
  if (research?.lifecycle === 'strengthening') {
    return 'Persistence is still firm and the structure is improving rather than merely holding, so this is one of the cleaner temporal shapes on the board.';
  }
  if ((card.risk_flags || []).includes('undervalued_underdog') && (card.persistence_score || 0) >= 90) {
    return 'This is one of the clearer underdog structures because price inefficiency is still present without obvious persistence damage.';
  }
  if ((card.risk_flags || []).includes('bullpen_exhaustion')) {
    return 'The edge is being helped by a tangible structural stressor rather than by model noise alone, which makes the setup easier to defend operationally.';
  }
  if (research?.validation_bucket === 'survived' && (research?.timing_quality_score || 0) >= 20) {
    return 'The market has not invalidated the edge and timing quality is supportive, which makes this a cleaner structure than a raw model outlier.';
  }
  if ((card.volatility_score || 0) >= 55) {
    return 'There is clear edge value, but the surrounding market is noisy enough that execution discipline matters more than conviction size.';
  }
  if (research?.validation_bucket === 'rejected') {
    return 'The raw edge exists, but the market has been efficient enough to keep this in observation territory rather than promote it into a primary structure.';
  }
  return 'The structure is usable, but it still depends on later confirmation more than on immediate market follow-through.';
}

function determineConvictionTier(card, research, conviction) {
  if ((research?.lifecycle === 'collapsing') || (research?.validation_bucket === 'rejected')) return 'Decaying';
  if ((card?.volatility_score || 0) >= 16 || (card?.persistence_score || 0) < 65) return 'Unstable';
  if (conviction >= 62 && (research?.timing_quality_score || 0) >= 20 && research?.validation_bucket === 'survived') return 'Elite Conviction';
  if (conviction >= 54 && (card?.persistence_score || 0) >= 85) return 'High Conviction';
  if (conviction >= 46) return 'Supportive';
  if ((research?.timing_quality_score || 0) <= 0 || (research?.validation_bucket === 'unclassified')) return 'Watchlist';
  return 'Speculative';
}

function exposureForTier(tier) {
  return {
    'Elite Conviction': '1.0u',
    'High Conviction': '0.5u',
    Supportive: '0.25u',
    Speculative: '0.10u',
    Watchlist: 'Pass',
    Unstable: 'Pass',
    Decaying: 'Pass',
  }[tier] || 'Pass';
}

function decisionTone(tier) {
  return {
    'Elite Conviction': 'positive',
    'High Conviction': 'positive',
    Supportive: 'info',
    Speculative: 'warning',
    Watchlist: 'neutral',
    Unstable: 'danger',
    Decaying: 'danger',
  }[tier] || 'neutral';
}

function buildDecisionNarrative(row, posture) {
  if (row.conviction_tier === 'Elite Conviction') {
    return 'This is the clearest portfolio-quality structure on the slate because persistence, validation and timing are aligned rather than merely promising.';
  }
  if (row.conviction_tier === 'High Conviction') {
    return 'This structure justifies exposure, but the operator should still respect the selective posture of the slate rather than treat it as a free expansion candidate.';
  }
  if (row.conviction_tier === 'Supportive') {
    return 'Usable as secondary exposure, but not strong enough to anchor portfolio construction on its own.';
  }
  if (row.conviction_tier === 'Watchlist') {
    return `Raw edge is present, but ${posture.operationalBias.toLowerCase()} remains the better posture until timing improves.`;
  }
  if (row.conviction_tier === 'Decaying') {
    return 'The market is actively correcting this structure, so preserving optionality is more rational than forcing exposure.';
  }
  return 'The structure carries too much temporal or volatility uncertainty to justify active exposure right now.';
}

function exposureUnits(exposure) {
  const numeric = Number.parseFloat(exposure);
  return Number.isFinite(numeric) ? numeric : 0;
}

function aggregateRiskReading(value, thresholds, labels) {
  if (!Number.isFinite(Number(value))) return labels[labels.length - 1];
  const numeric = Number(value);
  for (let index = 0; index < thresholds.length; index += 1) {
    if (numeric >= thresholds[index]) return labels[index];
  }
  return labels[labels.length - 1];
}

function classifySlateStability({ stableMarkets, unstableMarkets, disagreementShare, strengtheningShare, collapsingShare }) {
  if (collapsingShare >= 0.35 || unstableMarkets > stableMarkets) {
    return {
      state: 'unstable',
      narrative: 'Instability is broad enough that portfolio deployment should stay defensive and highly filtered.',
    };
  }
  if (disagreementShare >= 0.35) {
    return {
      state: 'disagreement-led',
      narrative: 'Disagreement is a defining trait of the slate, so correlation through noisy price discovery is a bigger risk than isolated edge misses.',
    };
  }
  if (strengtheningShare >= 0.4 && stableMarkets >= unstableMarkets) {
    return {
      state: 'persistence-led',
      narrative: 'A meaningful share of structures is surviving with support, so the slate rewards selectivity more than blanket caution.',
    };
  }
  if (unstableMarkets > 0 || collapsingShare >= 0.2) {
    return {
      state: 'mixed',
      narrative: 'The slate has usable structures, but instability is present often enough that aggregate exposure should stay measured.',
    };
  }
  return {
    state: 'stable',
    narrative: 'The slate is relatively orderly, so portfolio risk is more about concentration than about broad market fragmentation.',
  };
}

function buildPortfolioGovernance({
  structures,
  posture,
  environment,
  stableMarkets,
  unstableMarkets,
  checklist,
}) {
  const activeStructures = structures.filter((row) => exposureUnits(row.exposure) > 0);
  const rawTotalExposure = round(activeStructures.reduce((sum, row) => sum + exposureUnits(row.exposure), 0), 2);
  const averageConviction = activeStructures.length
    ? round(activeStructures.reduce((sum, row) => sum + Number(row.operational_conviction || 0), 0) / activeStructures.length, 2)
    : 0;
  const averageTiming = activeStructures.length
    ? round(activeStructures.reduce((sum, row) => sum + Number(row.timing_quality_score || 0), 0) / activeStructures.length, 2)
    : 0;
  const averageVolatility = activeStructures.length
    ? round(activeStructures.reduce((sum, row) => sum + Number(row.volatility_score || 0), 0) / activeStructures.length, 2)
    : 0;
  const averageDisagreement = activeStructures.length
    ? round(activeStructures.reduce((sum, row) => sum + Number(row.disagreement_score || 0), 0) / activeStructures.length, 4)
    : 0;
  const lowTimingStructures = activeStructures.filter((row) => (row.timing_quality_score || 0) < 20);
  const volatileStructures = activeStructures.filter((row) => (row.volatility_score || 0) >= 12);
  const disagreementStructures = activeStructures.filter((row) => (row.disagreement_score || 0) >= 0.05);
  const underdogStructures = activeStructures.filter((row) => (row.risk_flags || []).includes('undervalued_underdog'));
  const unstableStructures = activeStructures.filter((row) => ['Unstable', 'Decaying', 'Speculative'].includes(row.conviction_tier));
  const persistentStructures = activeStructures.filter((row) => (row.persistence_score || 0) >= 85);
  const lateConfirmationStructures = activeStructures.filter((row) => (row.reason_codes || []).includes('LATE_CONFIRMATION_REQUIRED'));
  const strengtheningShare = activeStructures.length
    ? activeStructures.filter((row) => row.lifecycle === 'strengthening').length / activeStructures.length
    : 0;
  const collapsingShare = activeStructures.length
    ? activeStructures.filter((row) => row.lifecycle === 'collapsing').length / activeStructures.length
    : 0;
  const disagreementShare = activeStructures.length ? disagreementStructures.length / activeStructures.length : 0;

  const clusters = [
    {
      key: 'underdog-cluster',
      label: 'Underdog clustering',
      count: underdogStructures.length,
      exposure: round(underdogStructures.reduce((sum, row) => sum + exposureUnits(row.exposure), 0), 2),
      severity: underdogStructures.length >= 3 ? 'Elevated' : underdogStructures.length >= 2 ? 'Moderate' : 'Low',
      narrative: underdogStructures.length >= 2
        ? 'A meaningful share of active exposure is leaning into the same underdog-style mispricing profile.'
        : 'Underdog exposure is not materially clustered.',
    },
    {
      key: 'volatility-cluster',
      label: 'Volatility clustering',
      count: volatileStructures.length,
      exposure: round(volatileStructures.reduce((sum, row) => sum + exposureUnits(row.exposure), 0), 2),
      severity: volatileStructures.length >= 2 ? 'Elevated' : volatileStructures.length === 1 ? 'Moderate' : 'Low',
      narrative: volatileStructures.length >= 2
        ? 'Volatility is clustering across multiple active structures, so independent-looking signals are sharing execution risk.'
        : 'Volatility exposure is contained.',
    },
    {
      key: 'disagreement-cluster',
      label: 'Disagreement clustering',
      count: disagreementStructures.length,
      exposure: round(disagreementStructures.reduce((sum, row) => sum + exposureUnits(row.exposure), 0), 2),
      severity: disagreementStructures.length >= 2 ? 'Elevated' : disagreementStructures.length === 1 ? 'Moderate' : 'Low',
      narrative: disagreementStructures.length >= 2
        ? 'Several active structures are living in elevated disagreement, which raises the chance of correlated late repricing.'
        : 'Disagreement is not dominating active exposure.',
    },
    {
      key: 'timing-cluster',
      label: 'Timing clustering',
      count: Math.max(lowTimingStructures.length, lateConfirmationStructures.length),
      exposure: round(lowTimingStructures.reduce((sum, row) => sum + exposureUnits(row.exposure), 0), 2),
      severity: lowTimingStructures.length >= 2 || lateConfirmationStructures.length >= 2 ? 'Elevated' : lowTimingStructures.length === 1 ? 'Moderate' : 'Low',
      narrative: lowTimingStructures.length >= 2 || lateConfirmationStructures.length >= 2
        ? 'Too much of the active portfolio still depends on later confirmation, so timing risk is concentrated rather than isolated.'
        : 'Timing dependence is not materially clustered.',
    },
    {
      key: 'persistence-cluster',
      label: 'Persistence concentration',
      count: persistentStructures.length,
      exposure: round(persistentStructures.reduce((sum, row) => sum + exposureUnits(row.exposure), 0), 2),
      severity: persistentStructures.length >= 3 ? 'Moderate' : persistentStructures.length >= 2 ? 'Low' : 'Low',
      narrative: persistentStructures.length >= 2
        ? 'The active portfolio is leaning on a small set of persistence-led structures, which is attractive but still creates thematic concentration.'
        : 'Persistence leadership is not overly concentrated.',
    },
    {
      key: 'unstable-cluster',
      label: 'Unstable structure clustering',
      count: unstableStructures.length,
      exposure: round(unstableStructures.reduce((sum, row) => sum + exposureUnits(row.exposure), 0), 2),
      severity: unstableStructures.length >= 1 ? 'Moderate' : 'Low',
      narrative: unstableStructures.length >= 1
        ? 'At least one active structure is carrying unstable or speculative traits, which deserves explicit portfolio caution.'
        : 'Active exposure is not being driven by unstable structures.',
    },
  ];

  const correlatedClusters = clusters.filter((cluster) => cluster.count >= 2 && cluster.exposure > 0);
  const correlatedExposure = correlatedClusters.length
    ? round(Math.max(...correlatedClusters.map((cluster) => cluster.exposure)), 2)
    : 0;
  const concentrationScore = round(
    correlatedClusters.reduce((sum, cluster) => (
      sum
      + (cluster.severity === 'Elevated' ? 2 : cluster.severity === 'Moderate' ? 1 : 0)
    ), 0)
      + (rawTotalExposure >= 2 ? 2 : rawTotalExposure >= 1.25 ? 1 : 0)
      + (averageDisagreement >= 0.05 ? 1 : 0)
      + (averageVolatility >= 12 ? 1 : 0),
    2,
  );
  const concentrationLevel = concentrationScore >= 7
    ? 'dangerous concentration'
    : concentrationScore >= 5
      ? 'elevated concentration'
      : concentrationScore >= 3
        ? 'moderate concentration'
        : 'low concentration';
  const slateStability = classifySlateStability({
    stableMarkets,
    unstableMarkets,
    disagreementShare,
    strengtheningShare,
    collapsingShare,
  });
  const timingScale = posture.timingSensitivity === 'High' ? 0.85 : posture.timingSensitivity === 'Moderate' ? 0.93 : 1;
  const volatilityScale = environment.volatilityRegime === 'Expansion pockets' ? 0.85 : 1;
  const concentrationScale = concentrationLevel === 'dangerous concentration'
    ? 0.7
    : concentrationLevel === 'elevated concentration'
      ? 0.82
      : concentrationLevel === 'moderate concentration'
        ? 0.92
        : 1;
  const slateScale = slateStability.state === 'unstable'
    ? 0.8
    : slateStability.state === 'mixed' || slateStability.state === 'disagreement-led'
      ? 0.9
      : 1;
  const governanceScale = round(timingScale * volatilityScale * concentrationScale * slateScale, 2);
  const governedTotalExposure = round(rawTotalExposure * governanceScale, 2);
  const recommendedAggression = governanceScale <= 0.7
    ? 'Restricted'
    : governanceScale <= 0.82
      ? 'Defensive'
      : posture.recommendedStyle === 'Highly selective'
        ? 'Selective'
        : governanceScale >= 0.95 && concentrationLevel === 'low concentration' && slateStability.state !== 'unstable'
          ? 'Opportunistic'
          : 'Moderate';
  const riskConcentration = concentrationLevel.startsWith('dangerous')
    ? 'Narrow'
    : concentrationLevel.startsWith('elevated')
      ? 'Moderate'
      : 'Broad';
  const portfolioRisk = aggregateRiskReading(concentrationScore, [7, 5, 3], ['High', 'Elevated', 'Moderate', 'Contained']);
  const maxSingleExposure = posture.marketRegime === 'Highly Efficient' ? '0.5u' : '1.0u';
  const baseTotalCap = posture.recommendedStyle === 'Highly selective' ? 1.5 : posture.recommendedStyle === 'Selective' ? 2 : 2.5;
  const maxTotalDailyExposure = `${round(baseTotalCap * governanceScale, 2)}u`;
  const maxCorrelatedExposure = `${round(Math.min(baseTotalCap * 0.6, governedTotalExposure || baseTotalCap * 0.5), 2)}u`;
  const primaryDrivers = correlatedClusters.slice(0, 3).map((cluster) => cluster.label);

  return {
    portfolio_summary: {
      total_suggested_exposure: `${governedTotalExposure.toFixed(2)}u`,
      raw_total_exposure: `${rawTotalExposure.toFixed(2)}u`,
      average_conviction: averageConviction,
      slate_stability: slateStability.state,
      portfolio_risk: portfolioRisk,
      correlated_exposure: `${correlatedExposure.toFixed(2)}u`,
      recommended_aggression: recommendedAggression,
      risk_concentration: riskConcentration,
    },
    correlation_awareness: {
      clusters,
      warnings: correlatedClusters.map((cluster) => ({
        label: cluster.label,
        severity: cluster.severity,
        exposure: `${cluster.exposure.toFixed(2)}u`,
        narrative: cluster.narrative,
      })),
    },
    exposure_governance: {
      max_single_exposure: maxSingleExposure,
      max_total_daily_exposure: maxTotalDailyExposure,
      max_correlated_exposure: maxCorrelatedExposure,
      unstable_market_exposure_reduction: slateStability.state === 'unstable' ? 'Reduce one exposure tier across the portfolio' : 'No structural downgrade required',
      volatility_regime_scaling: volatilityScale < 1 ? `${Math.round(volatilityScale * 100)}% of raw exposure` : 'No volatility scaling',
      timing_penalty_scaling: timingScale < 1 ? `${Math.round(timingScale * 100)}% until later confirmation` : 'No timing scaling',
    },
    concentration_risk: {
      level: concentrationLevel,
      drivers: primaryDrivers,
      narrative: primaryDrivers.length
        ? `Portfolio concentration is being driven by ${primaryDrivers.join(', ').toLowerCase()}, so aggregate deployment should stay below raw structure-by-structure sizing.`
        : 'Portfolio concentration is contained enough that diversification risk is not the dominant problem today.',
    },
    slate_stability: slateStability,
    portfolio_aggression_control: {
      state: recommendedAggression,
      governance_scale: governanceScale,
      suggested_total_exposure: `${governedTotalExposure.toFixed(2)}u`,
      rationale: recommendedAggression === 'Restricted'
        ? 'Multiple portfolio-level penalties are active, so the slate should be treated as capital preservation first.'
        : recommendedAggression === 'Defensive'
          ? 'Portfolio quality is usable, but concentration and timing still justify a measured footprint.'
          : recommendedAggression === 'Selective'
            ? 'The market allows some participation, but only after filtering out structurally redundant exposure.'
            : recommendedAggression === 'Opportunistic'
              ? 'Portfolio conditions are orderly enough to allow normal deployment without stretching beyond governance limits.'
              : 'Normal participation is acceptable, but not with unchecked correlation or late-window crowding.',
    },
    aggregate_exposure_intelligence: {
      active_structures: activeStructures.length,
      passed_structures: structures.length - activeStructures.length,
      aggregate_timing_risk: aggregateRiskReading(100 - averageTiming, [85, 70, 55], ['High', 'Elevated', 'Moderate', 'Contained']),
      aggregate_volatility_risk: aggregateRiskReading(averageVolatility, [14, 11, 8], ['High', 'Elevated', 'Moderate', 'Contained']),
      aggregate_disagreement_risk: aggregateRiskReading(averageDisagreement, [0.055, 0.04, 0.02], ['High', 'Elevated', 'Moderate', 'Contained']),
      reduction_amount: `${Math.max(0, round(rawTotalExposure - governedTotalExposure, 2)).toFixed(2)}u`,
      narrative: governedTotalExposure < rawTotalExposure
        ? `Raw structure-level sizing reaches ${rawTotalExposure.toFixed(2)}u, but portfolio governance cuts that to ${governedTotalExposure.toFixed(2)}u because timing, concentration and regime overlap are sharing risk.`
        : `Raw and governed exposure are aligned at ${rawTotalExposure.toFixed(2)}u because portfolio-level concentration remains contained.`,
    },
  };
}

function decisionLedgerPath(date) {
  return path.join(DECISION_LEDGER_DIR, `${date}.jsonl`);
}

function decisionLedgerKey(row) {
  return [
    row.date,
    row.snapshot_label,
    row.source_signature,
    row.game_id,
    row.side,
  ].map((value) => value || 'unknown').join(':');
}

function readDecisionLedger(date) {
  return readJsonLinesIfExists(decisionLedgerPath(date));
}

function buildDecisionLedgerRows({
  date,
  generatedAt,
  snapshotLabel,
  sourceSignature,
  executiveAllocation,
  structures,
  posture,
  portfolioSummary,
}) {
  const evidenceByKey = new Map((structures || []).map((row) => [`${row.game_id}:${row.side}`, row]));
  return (executiveAllocation?.allocation_rows || []).map((row) => {
    const evidence = evidenceByKey.get(`${row.game_id}:${row.side}`) || {};
    return {
      date,
      snapshot_label: snapshotLabel || null,
      generated_at: generatedAt,
      game_id: row.game_id,
      team: row.team,
      side: row.side,
      action: row.action,
      executive_exposure: row.executive_exposure,
      raw_exposure: row.raw_exposure,
      conviction_tier: row.conviction_tier,
      reason: row.reason,
      reason_codes: evidence.reason_codes || [],
      timing_quality_score: row.timing_quality_score ?? evidence.timing_quality_score ?? null,
      persistence_score: evidence.persistence_score ?? null,
      volatility_score: evidence.volatility_score ?? null,
      operational_conviction: row.operational_conviction ?? evidence.operational_conviction ?? null,
      market_regime: posture?.marketRegime || null,
      portfolio_risk: portfolioSummary?.portfolio_risk || null,
      source_signature: sourceSignature || null,
      result_status: 'pending',
    };
  });
}

function writeDecisionLedger({ date, rows }) {
  const filePath = decisionLedgerPath(date);
  const existingRows = readDecisionLedger(date);
  const existingKeys = new Set(existingRows.map(decisionLedgerKey));
  const newRows = rows.filter((row) => !existingKeys.has(decisionLedgerKey(row)));

  if (newRows.length) {
    appendText(filePath, `${newRows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  }

  const totalRecords = existingRows.length + newRows.length;
  const currentKeys = new Set(rows.map(decisionLedgerKey));
  const recordedCurrentRecords = [...existingKeys, ...newRows.map(decisionLedgerKey)]
    .filter((key) => currentKeys.has(key)).length;
  const lastRecord = newRows[newRows.length - 1] || existingRows[existingRows.length - 1] || null;
  return {
    status: 'active',
    path: path.relative(ROOT, filePath),
    expected_records: rows.length,
    recorded_current_records: recordedCurrentRecords,
    appended_records: newRows.length,
    total_records: totalRecords,
    coverage: rows.length ? round((recordedCurrentRecords / rows.length) * 100, 2) : 0,
    last_write_at: newRows.length ? newRows[newRows.length - 1].generated_at : null,
    last_record_at: lastRecord?.generated_at || null,
  };
}

function buildDecisionLedgerStatus(date = loadCoreState().date) {
  const rows = readDecisionLedger(date);
  const filePath = decisionLedgerPath(date);
  return {
    date,
    status: rows.length ? 'active' : 'empty',
    path: path.relative(ROOT, filePath),
    total_records: rows.length,
    last_record_at: rows[rows.length - 1]?.generated_at || null,
  };
}

function buildDecisionPanel() {
  const state = loadCoreState();
  const overview = buildOverview();
  const generatedAt = new Date().toISOString();
  const research = buildResearchWorkspace();
  const checklist = state.checklist || {};
  const topBettable = overview.sections.top_bettable || [];
  const allCards = [
    ...(overview.sections.top_bettable || []),
    ...(overview.sections.watchlist || []),
    ...(overview.sections.no_action || []),
  ];
  const memoRanked = topCardsByConviction(topBettable, research.persistence?.records || [], topBettable.length);
  const rankingMap = new Map((research.ranking_explainability?.rows || []).map((row) => [`${row.game_id}:${row.side}`, row]));
  const temporalGameMap = new Map((state.temporal?.games || []).map((game) => [game.game_id, game]));
  const stableRegime = (research.volatility?.regimes || []).find((row) => row.regime === 'stable') || null;
  const turbulentRegime = (research.volatility?.regimes || []).find((row) => row.regime === 'turbulent') || null;
  const bestWindow = research.timing_quality?.best_window || null;
  const worstWindow = [...(research.timing_quality?.windows || [])]
    .filter((row) => row.sample_count > 0)
    .sort((a, b) => (a.average_timing_quality || Infinity) - (b.average_timing_quality || Infinity))[0] || null;
  const posture = classifyOperationalPosture({
    survivalRate: Number(research.persistence?.summary?.edge_survival_rate || 0),
    stableMarkets: Number(research.volatility?.summary?.stable_markets || 0),
    unstableMarkets: Number(research.volatility?.summary?.unstable_markets || 0),
    bestWindow,
    worstWindow,
    checklist,
    topBettableCount: topBettable.length,
  });
  const environment = classifyMarketEnvironment({
    survivalRate: Number(research.persistence?.summary?.edge_survival_rate || 0),
    bestWindow,
    stableRegime,
    turbulentRegime,
    stableMarkets: Number(research.volatility?.summary?.stable_markets || 0),
    unstableMarkets: Number(research.volatility?.summary?.unstable_markets || 0),
    strongestDisagreement: [...(state.temporal?.games || [])].sort((a, b) => (b.market_state?.average_disagreement_score || 0) - (a.market_state?.average_disagreement_score || 0))[0] || null,
    topBettableCount: topBettable.length,
  });
  const slateDistribution = buildSlateQualityDistribution(allCards, research.persistence?.records || []);

  const structures = memoRanked.map((row) => {
    const explainability = rankingMap.get(`${row.card.game_id}:${row.card.selection_side}`) || null;
    const convictionTier = determineConvictionTier(row.card, row.research, row.conviction);
    return {
      game_id: row.card.game_id,
      side: row.card.selection_side,
      matchup: row.card.matchup,
      team: row.card.selection_team,
      quant_score: row.card.quant_score,
      edge_pct_points: row.card.edge_pct_points,
      persistence_score: row.card.persistence_score,
      timing_quality_score: row.research?.timing_quality_score ?? null,
      operational_conviction: round(row.conviction, 2),
      conviction_tier: convictionTier,
      exposure: exposureForTier(convictionTier),
      tone: decisionTone(convictionTier),
      volatility_score: row.card.volatility_score,
      risk_flags: row.card.risk_flags || [],
      lifecycle: row.research?.lifecycle || null,
      validation_bucket: row.research?.validation_bucket || null,
      disagreement_score: temporalGameMap.get(row.card.game_id)?.market_state?.average_disagreement_score ?? null,
      dashboard_rank: explainability?.dashboard_rank ?? null,
      memo_rank: explainability?.memo_rank ?? null,
      rank_difference: explainability?.rank_difference ?? null,
      reason_codes: explainability?.reason_codes || [],
      narrative: buildDecisionNarrative({ ...row, conviction_tier: convictionTier }, posture),
      timing_view: buildTimingInterpretation(row.research, bestWindow, worstWindow),
      structure_quality: buildStructureQuality(row.card, row.research),
    };
  });

  const exposureRows = structures.map((row) => ({
    team: row.team,
    matchup: row.matchup,
    tier: row.conviction_tier,
    exposure: row.exposure,
    operational_conviction: row.operational_conviction,
  }));

  const riskRows = [
    ...(checklist.operational_warnings || []).map((label) => ({
      label,
      severity: riskSeverity(label),
      context: label === 'incomplete_timelines'
        ? 'Later windows are still missing, so aggressive exposure would overstate current certainty.'
        : 'Operational schedule quality is still incomplete relative to the ideal timeline.',
    })),
    ...((research.ranking_explainability?.divergences || []).filter((row) => row.reason_codes.includes('HIGH_VOLATILITY_PENALTY')).slice(0, 2).map((row) => ({
      label: `${row.team} volatility penalty`,
      severity: 'Moderate',
      context: 'The structure has usable edge, but volatility is absorbing part of its operational clarity.',
    }))),
  ];

  const portfolioGovernance = buildPortfolioGovernance({
    structures,
    posture,
    environment,
    stableMarkets: Number(research.volatility?.summary?.stable_markets || 0),
    unstableMarkets: Number(research.volatility?.summary?.unstable_markets || 0),
    checklist,
  });
  const executiveAllocation = generateExecutiveAllocation({
    structures,
    operationalPosture: posture,
    portfolioSummary: portfolioGovernance.portfolio_summary,
    correlationAwareness: portfolioGovernance.correlation_awareness,
    exposureGovernance: portfolioGovernance.exposure_governance,
    concentrationRisk: portfolioGovernance.concentration_risk,
    slateStability: portfolioGovernance.slate_stability,
    aggregateExposureIntelligence: portfolioGovernance.aggregate_exposure_intelligence,
  });
  const ledgerRows = buildDecisionLedgerRows({
    date: state.date,
    generatedAt,
    snapshotLabel: overview.meta?.latest_snapshot_label || state.operations?.meta?.snapshot_label || null,
    sourceSignature: overview.meta?.latest_snapshot_signature || null,
    executiveAllocation,
    structures,
    posture,
    portfolioSummary: portfolioGovernance.portfolio_summary,
  });
  const decisionLedger = writeDecisionLedger({
    date: state.date,
    rows: ledgerRows,
  });
  const overallExposure = structures.reduce((sum, row) => sum + exposureUnits(row.exposure), 0);
  const operationalConclusion = {
    recommended_behavior: posture.recommendedStyle,
    exposure_posture: executiveAllocation.aggression_state,
    confirmation_need: posture.confirmationRequirements,
    general_conviction: slateDistribution['High Conviction'] > 1 ? 'Moderate' : 'Selective',
    summary: executiveAllocation.executive_memo.executive_summary,
  };

  return {
    meta: {
      date: state.date,
      generated_at: generatedAt,
      refresh_policy: overview.meta?.refresh_policy || null,
      latest_snapshot_signature: overview.meta?.latest_snapshot_signature || null,
      latest_snapshot_label: overview.meta?.latest_snapshot_label || null,
    },
    operational_posture: posture,
    market_environment: environment,
    slate_quality_distribution: slateDistribution,
    portfolio_summary: portfolioGovernance.portfolio_summary,
    correlation_awareness: portfolioGovernance.correlation_awareness,
    exposure_governance: portfolioGovernance.exposure_governance,
    concentration_risk: portfolioGovernance.concentration_risk,
    slate_stability: portfolioGovernance.slate_stability,
    portfolio_aggression_control: portfolioGovernance.portfolio_aggression_control,
    aggregate_exposure_intelligence: portfolioGovernance.aggregate_exposure_intelligence,
    executive_allocation: executiveAllocation,
    decision_ledger: decisionLedger,
    best_structures: structures,
    timing_persistence: {
      best_window: bestWindow,
      worst_window: worstWindow,
      market_stabilization: research.market_correction?.summary?.market_stabilization_timing_minutes_to_first_pitch ?? null,
      change_log: buildChangeLog({
        strengtheningSignals: research.persistence?.records?.filter((record) => record.lifecycle === 'strengthening').slice(0, 5) || [],
        decaySignals: research.persistence?.records?.filter((record) => record.lifecycle === 'collapsing').slice(0, 5) || [],
        bestWindow,
        strongestDisagreement: [...(state.temporal?.games || [])].sort((a, b) => (b.market_state?.average_disagreement_score || 0) - (a.market_state?.average_disagreement_score || 0))[0] || null,
        stableMarkets: Number(research.volatility?.summary?.stable_markets || 0),
        unstableMarkets: Number(research.volatility?.summary?.unstable_markets || 0),
      }),
    },
    exposure_recommendations: exposureRows,
    risk_layer: [
      ...riskRows,
      ...portfolioGovernance.correlation_awareness.warnings.slice(0, 2).map((warning) => ({
        label: warning.label,
        severity: warning.severity,
        context: warning.narrative,
      })),
    ],
    research_insights: [
      `The market is ${posture.marketRegime.toLowerCase()}, so raw edge alone is not enough to justify automatic deployment.`,
      `Timing sensitivity is ${posture.timingSensitivity.toLowerCase()}, which means entry quality is still a major part of conviction rather than a secondary detail.`,
      `Persistence breadth is ${environment.persistenceBreadth.toLowerCase()}, so the slate should be treated as a filtered portfolio problem rather than a broad action slate.`,
      portfolioGovernance.aggregate_exposure_intelligence.narrative,
      executiveAllocation.executive_memo.recommended_deployment,
    ],
    operational_conclusion: operationalConclusion,
  };
}

function buildTimingInterpretation(research, bestWindow, worstWindow) {
  if (research?.lifecycle === 'strengthening') {
    return `Improving through the ${bestWindow?.window || 'best'} window rather than fading with time.`;
  }
  if (research?.validation_bucket === 'rejected') {
    return `More vulnerable when price discovery moves away from the ${worstWindow?.window || 'weaker'} windows.`;
  }
  return `Most coherent when entered closer to ${research?.best_window || bestWindow?.window || 'the current best window'}.`;
}

function buildStructureQuality(card, research) {
  if ((card.persistence_score || 0) >= 90 && research?.validation_bucket === 'survived') return 'High';
  if ((card.persistence_score || 0) >= 75) return 'Moderate';
  return 'Fragile';
}

function buildChangeLog({ strengtheningSignals, decaySignals, bestWindow, strongestDisagreement, stableMarkets, unstableMarkets }) {
  return [
    {
      change: strengtheningSignals[0]
        ? `${strengtheningSignals[0].team} persistence strengthened`
        : 'No clear strengthening leader',
      status: strengtheningSignals[0] ? 'OK' : 'Watch',
    },
    {
      change: decaySignals[0]
        ? `${decaySignals[0].team} edge deteriorated`
        : 'No meaningful collapse leader',
      status: decaySignals[0] ? 'OK' : 'Stable',
    },
    {
      change: bestWindow ? `Best structure quality is clustering around ${bestWindow.window}` : 'Best timing window still unclear',
      status: bestWindow ? 'OK' : 'Watch',
    },
    {
      change: strongestDisagreement && strongestDisagreement.market_state?.average_disagreement_score !== null && strongestDisagreement.market_state?.average_disagreement_score !== undefined
        ? `${qualitativeDisagreement(strongestDisagreement.market_state?.average_disagreement_score)} remains in the market`
        : 'Disagreement regime unclear',
      status: strongestDisagreement && strongestDisagreement.market_state?.average_disagreement_score !== null && strongestDisagreement.market_state?.average_disagreement_score !== undefined ? 'OK' : 'Watch',
    },
    {
      change: stableMarkets >= unstableMarkets ? 'Stable structures still outnumber unstable ones' : 'Unstable structures are expanding',
      status: stableMarkets >= unstableMarkets ? 'OK' : 'Risk',
    },
  ];
}

function riskSeverity(label) {
  const normalized = String(label);
  if (['incomplete_timelines', 'schedule_drift', 'late_sharp_movement', 'unstable_market'].includes(normalized)) return 'Elevated';
  if (['timing_headwind', 'volatility_expansion'].includes(normalized)) return 'Moderate';
  return 'Monitor';
}

function freshnessText(minutes) {
  if (minutes === null || minutes === undefined || !Number.isFinite(Number(minutes))) return 'n/a';
  if (Number(minutes) < 1) return 'just now';
  return `~${Math.round(Number(minutes))}m ago`;
}

function strengthLabel(value, thresholds, labels) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'Unclear';
  const numeric = Number(value);
  for (let index = 0; index < thresholds.length; index += 1) {
    if (numeric >= thresholds[index]) return labels[index];
  }
  return labels[labels.length - 1];
}

function topCardsByConviction(cards, researchRows, limit = 5) {
  const researchByGameSide = new Map(researchRows.map((row) => [`${row.game_id}:${row.side}`, row]));
  return cards
    .map((card) => {
      const research = researchByGameSide.get(`${card.game_id}:${card.selection_side}`) || null;
      const conviction = (
        (card.quant_score || 0) * 0.35
        + (card.persistence_score || 0) * 0.35
        + (research?.timing_quality_score || 0) * 0.15
        + Math.max(0, 100 - (card.volatility_score || 0)) * 0.05
        + (research?.validation_bucket === 'survived' ? 10 : 0)
        + (research?.lifecycle === 'strengthening' ? 5 : 0)
      );
      return {
        card,
        research,
        conviction,
        timing_penalty: Math.max(0, 25 - Number(research?.timing_quality_score || 0)),
        volatility_penalty: round((Number(card.volatility_score || 0) * 0.05), 2),
        persistence_bonus: round((Number(card.persistence_score || 0) * 0.35), 2),
        lifecycle_bonus: (research?.validation_bucket === 'survived' ? 10 : 0) + (research?.lifecycle === 'strengthening' ? 5 : 0),
      };
    })
    .sort((a, b) => b.conviction - a.conviction)
    .slice(0, limit);
}

function explainRankingDivergence(cards, researchRows, checklist) {
  const memoRanked = topCardsByConviction(cards, researchRows, cards.length);
  const memoRankMap = new Map(memoRanked.map((row, index) => [`${row.card.game_id}:${row.card.selection_side}`, { ...row, memo_rank: index + 1 }]));
  const dashboardRankMap = new Map(cards.map((card, index) => [`${card.game_id}:${card.selection_side}`, index + 1]));

  const rows = cards.map((card) => {
    const key = `${card.game_id}:${card.selection_side}`;
    const memo = memoRankMap.get(key) || null;
    const research = memo?.research || null;
    const dashboardRank = dashboardRankMap.get(key) || null;
    const memoRank = memo?.memo_rank || null;
    const rankDifference = dashboardRank !== null && memoRank !== null ? memoRank - dashboardRank : null;
    const convictionDelta = memo ? round(memo.conviction - Number(card.quant_score || 0), 2) : null;
    const reasonCodes = [];

    if ((card.quant_score || 0) >= 20) reasonCodes.push('STRONG_RAW_EDGE');
    if ((research?.timing_quality_score || 0) < 20) reasonCodes.push('LOW_TIMING_QUALITY');
    if ((card.volatility_score || 0) >= 12) reasonCodes.push('HIGH_VOLATILITY_PENALTY');
    if ((card.persistence_score || 0) < 75) reasonCodes.push('LOW_PERSISTENCE');
    if (research?.lifecycle === 'collapsing' || research?.validation_bucket === 'rejected') reasonCodes.push('EDGE_DECAY');
    if (checklist?.timeline_completeness?.pending >= 3 && (research?.timing_quality_score || 0) < 20) reasonCodes.push('LATE_CONFIRMATION_REQUIRED');
    if ((research?.validation_bucket === 'survived' || research?.lifecycle === 'strengthening') && (research?.timing_quality_score || 0) >= 20) {
      reasonCodes.push('STRONG_OPERATIONAL_ALIGNMENT');
    }

    let interpretation = `${card.selection_team} still ranks highly on raw quantitative strength`;
    if (memoRank !== null && dashboardRank !== null && memoRank > dashboardRank) {
      interpretation += `, but its operational rank drops from #${dashboardRank} to #${memoRank}`;
    } else if (memoRank !== null && dashboardRank !== null && memoRank < dashboardRank) {
      interpretation += ` and its operational rank improves from #${dashboardRank} to #${memoRank}`;
    } else {
      interpretation += ' with limited rank divergence between layers';
    }

    if ((research?.timing_quality_score || 0) < 20) {
      interpretation += ' because timing quality is weak relative to the persistence-led structures currently sitting above it.';
    } else if ((card.volatility_score || 0) >= 12) {
      interpretation += ' because volatility is converting part of the edge into execution risk rather than clean conviction.';
    } else if (research?.lifecycle === 'strengthening') {
      interpretation += ' because lifecycle alignment is improving and temporal confirmation is adding to conviction instead of subtracting from it.';
    } else {
      interpretation += ' because timing, persistence and validation are aligned closely enough to keep the structure operationally attractive.';
    }

    return {
      game_id: card.game_id,
      side: card.selection_side,
      team: card.selection_team,
      matchup: card.matchup,
      quant_score: card.quant_score,
      persistence_score: card.persistence_score,
      timing_quality_score: research?.timing_quality_score ?? null,
      volatility_score: card.volatility_score,
      operational_conviction: memo?.conviction ?? null,
      dashboard_rank: dashboardRank,
      memo_rank: memoRank,
      rank_difference: rankDifference,
      conviction_delta: convictionDelta,
      timing_penalty: memo?.timing_penalty ?? null,
      volatility_penalty: memo?.volatility_penalty ?? null,
      persistence_bonus: memo?.persistence_bonus ?? null,
      lifecycle_bonus: memo?.lifecycle_bonus ?? null,
      reason_codes: reasonCodes,
      quant_reading: strengthLabel(card.quant_score, [22, 18, 14], ['Extremely Strong', 'Strong', 'Moderate', 'Weak']),
      persistence_reading: strengthLabel(card.persistence_score, [90, 80, 70], ['Strong', 'Supportive', 'Moderate', 'Weak']),
      timing_reading: strengthLabel(research?.timing_quality_score ?? null, [40, 20, 1], ['Strong', 'Moderate', 'Weak', 'Absent']),
      volatility_reading: strengthLabel(100 - Number(card.volatility_score || 0), [92, 88, 84], ['Contained', 'Moderate', 'Elevated', 'High']),
      operational_reading: strengthLabel(memo?.conviction ?? null, [60, 52, 45], ['High', 'Supportive', 'Reduced', 'Weak']),
      interpretation,
    };
  });

  const divergences = [...rows]
    .filter((row) => row.rank_difference !== null)
    .sort((a, b) => Math.abs(b.rank_difference) - Math.abs(a.rank_difference) || (b.quant_score || 0) - (a.quant_score || 0))
    .slice(0, 6);

  return {
    rows,
    divergences,
    memo_ranked: memoRanked,
  };
}

function deriveOperationalInterpretation(card, research) {
  if (!card) return 'No actionable context available.';
  if (research?.validation_bucket === 'survived' && research?.lifecycle === 'strengthening') {
    return 'Structure is surviving while still improving, which makes the setup operationally attractive if timing remains aligned.';
  }
  if ((card.persistence_score || 0) >= 85 && (research?.timing_quality_score || 0) >= 20) {
    return 'Persistence and timing are both supportive, so this setup carries cleaner temporal confirmation than the slate median.';
  }
  if ((card.volatility_score || 0) >= 55) {
    return 'Edge quality is present, but elevated volatility means execution quality matters more than raw model signal.';
  }
  if (research?.validation_bucket === 'rejected' || research?.lifecycle === 'collapsing') {
    return 'The market is leaning against the edge, so this behaves more like an observation candidate than a high-conviction entry.';
  }
  return 'The setup is structurally interesting, but still needs confirmation from later timing windows before becoming cleaner operationally.';
}

function buildQuantReportMarkdown() {
  const state = loadCoreState();
  const overview = buildOverview();
  const research = buildResearchWorkspace();
  const checklist = state.checklist || {};
  const operations = state.operations?.operational_health || {};
  const topCards = topCardsByConviction(overview.sections.top_bettable || [], research.persistence?.records || []);
  const unstableMarketLeaders = [...(state.temporal?.games || [])]
    .sort((a, b) => (b.market_state?.average_volatility_score || 0) - (a.market_state?.average_volatility_score || 0))
    .slice(0, 5);
  const strongestDisagreement = [...(state.temporal?.games || [])]
    .sort((a, b) => (b.market_state?.average_disagreement_score || 0) - (a.market_state?.average_disagreement_score || 0))
    .slice(0, 5);
  const strengtheningSignals = research.persistence?.records?.filter((row) => row.lifecycle === 'strengthening').slice(0, 5) || [];
  const decaySignals = research.persistence?.records?.filter((row) => row.lifecycle === 'collapsing').slice(0, 5) || [];
  const strongestPersistent = research.persistence?.strongest_edges || [];
  const weakestPersistent = research.persistence?.weakest_edges || [];
  const bestWindow = research.timing_quality?.best_window || null;
  const worstWindow = [...(research.timing_quality?.windows || [])]
    .filter((row) => row.sample_count > 0)
    .sort((a, b) => (a.average_timing_quality || Infinity) - (b.average_timing_quality || Infinity))[0] || null;
  const fastCorrection = [...(research.market_correction?.windows || [])]
    .filter((row) => row.correction_velocity !== null && row.correction_velocity !== undefined)
    .sort((a, b) => (b.correction_velocity || -Infinity) - (a.correction_velocity || -Infinity))[0] || null;
  const slowCorrection = [...(research.market_correction?.windows || [])]
    .filter((row) => row.correction_velocity !== null && row.correction_velocity !== undefined)
    .sort((a, b) => (a.correction_velocity || Infinity) - (b.correction_velocity || Infinity))[0] || null;
  const stableRegime = (research.volatility?.regimes || []).find((row) => row.regime === 'stable') || null;
  const turbulentRegime = (research.volatility?.regimes || []).find((row) => row.regime === 'turbulent') || null;
  const riskItems = new Set([
    ...(checklist.operational_warnings || []),
    ...(overview.operational_health?.operational_flags || []),
    ...((research.persistence?.records || []).flatMap((row) => row.signals || [])).filter((signal) => (
      ['late_sharp_movement', 'timing_headwind', 'volatility_expansion', 'unstable_market'].includes(signal)
    )),
  ]);
  const survivalRate = Number(research.persistence?.summary?.edge_survival_rate || 0);
  const stableMarkets = Number(research.volatility?.summary?.stable_markets || 0);
  const unstableMarkets = Number(research.volatility?.summary?.unstable_markets || 0);
  const posture = classifyOperationalPosture({
    survivalRate,
    stableMarkets,
    unstableMarkets,
    bestWindow,
    worstWindow,
    checklist,
    topBettableCount: (overview.sections.top_bettable || []).length,
  });
  const environment = classifyMarketEnvironment({
    survivalRate,
    bestWindow,
    stableRegime,
    turbulentRegime,
    stableMarkets,
    unstableMarkets,
    strongestDisagreement: strongestDisagreement[0],
    topBettableCount: (overview.sections.top_bettable || []).length,
  });
  const allOperationalCards = [
    ...(overview.sections.top_bettable || []),
    ...(overview.sections.watchlist || []),
    ...(overview.sections.no_action || []),
  ];
  const slateDistribution = buildSlateQualityDistribution(allOperationalCards, research.persistence?.records || []);
  const researchConfidence = buildResearchConfidence(research.historical_memory?.research_runs || 0, checklist);
  const changeLog = buildChangeLog({
    strengtheningSignals,
    decaySignals,
    bestWindow,
    strongestDisagreement: strongestDisagreement[0],
    stableMarkets,
    unstableMarkets,
  });
  const rankingExplainability = research.ranking_explainability || { divergences: [] };

  const reportDate = state.date;
  const generatedAt = new Date().toISOString();
  const currentReportPath = path.join(REPORTS_DIR, 'downloadable_quant_report.md');
  const datedReportPath = path.join(QUANT_REPORTS_DIR, `${reportDate}_downloadable_quant_report.md`);

  const lines = [
    '# Downloadable Quant Report',
    '',
    `Date: ${reportDate}`,
    `Generated at: ${generatedAt}`,
    `Current operational window: ${checklist.current_operational_phase || overview.meta?.current_schedule_window || 'n/a'}`,
    '',
    '## Operational Posture',
    '',
    '| Category | Interpretation |',
    '| --- | --- |',
    `| Market Regime | ${posture.marketRegime} |`,
    `| Recommended Style | ${posture.recommendedStyle} |`,
    `| Edge Environment | ${posture.edgeEnvironment} |`,
    `| Timing Sensitivity | ${posture.timingSensitivity} |`,
    `| Volatility Context | ${posture.volatilityContext} |`,
    `| Operational Bias | ${posture.operationalBias} |`,
    `| Confirmation Requirements | ${posture.confirmationRequirements} |`,
    '',
    ...bulletList([
      `${checklist.classification?.description || 'No operational posture summary is available.'}`,
      `The operator should remain ${posture.recommendedStyle.toLowerCase()} because edge breadth is ${posture.edgeEnvironment.toLowerCase()} and the market is still correcting efficiently enough to punish loose entries.`,
    ]),
    '',
    '## Market Environment',
    '',
    '| Dimension | Reading |',
    '| --- | --- |',
    `| Correction Efficiency | ${environment.correctionEfficiency} |`,
    `| Disagreement Environment | ${environment.disagreementEnvironment} |`,
    `| Stability Regime | ${environment.stabilityRegime} |`,
    `| Volatility Regime | ${environment.volatilityRegime} |`,
    `| Persistence Breadth | ${environment.persistenceBreadth} |`,
    `| Market Convergence Quality | ${environment.marketConvergenceQuality} |`,
    '',
    ...bulletList([
      strongestPersistent[0]
        ? `The strongest persistence anchor remains ${strongestPersistent[0].team} in ${strongestPersistent[0].matchup}, which gives the slate at least one clearly durable structure.`
        : 'No strong persistence anchor is visible.',
      unstableMarketLeaders[0]
        ? `The least stable market is ${unstableMarketLeaders[0].matchup.away.team} @ ${unstableMarketLeaders[0].matchup.home.team}, so volatility risk is localized rather than uniformly spread across the board.`
        : 'No clear unstable market cohort is visible.',
      strongestDisagreement[0]
        ? `The main disagreement pocket is ${strongestDisagreement[0].matchup.away.team} @ ${strongestDisagreement[0].matchup.home.team}, which is where price discovery still looks least settled.`
        : 'No major disagreement pocket is dominating the slate.',
    ]),
    '',
    '### Slate Quality Distribution',
    '',
    '| Tier | Count |',
    '| --- | ---: |',
    `| High Conviction | ${slateDistribution['High Conviction']} |`,
    `| Moderate | ${slateDistribution.Moderate} |`,
    `| Weak | ${slateDistribution.Weak} |`,
    `| Unstable | ${slateDistribution.Unstable} |`,
    '',
    '## Best Opportunities',
    '',
    '| Matchup | Edge | Persistence | Structure Quality | Timing View | Operational Reading |',
    '| --- | ---: | ---: | --- | --- | --- |',
    ...topCards.map(({ card, research: row }) => `| ${card.matchup} · ${card.selection_team} | ${numText(card.edge_pct_points, 1)} pts | ${numText(card.persistence_score, 0)} | ${buildStructureQuality(card, row)} | ${buildTimingInterpretation(row, bestWindow, worstWindow)} | ${buildStructureNarrative(card, row)} |`),
    '',
    '## Ranking Explainability',
    '',
    ...bulletList([
      'Daily Ops ranks raw quantitative opportunity, while the memo ranks operational conviction after timing, validation, volatility and lifecycle are applied.',
      'A strong raw edge can therefore remain prominent in the dashboard while falling in the memo if temporal confirmation is weak or volatility-adjusted conviction is lower.',
    ]),
    '',
    ...rankingExplainability.divergences.map((row) => [
      `### ${row.team}`,
      '',
      '| Layer | Reading |',
      '| --- | --- |',
      `| Quant Score | ${row.quant_reading} |`,
      `| Persistence | ${row.persistence_reading} |`,
      `| Timing Quality | ${row.timing_reading} |`,
      `| Volatility Penalty | ${row.volatility_reading} |`,
      `| Operational Conviction | ${row.operational_reading} |`,
      `| Dashboard Rank | #${row.dashboard_rank ?? 'n/a'} |`,
      `| Memo Rank | #${row.memo_rank ?? 'n/a'} |`,
      `| Rank Difference | ${row.rank_difference === null ? 'n/a' : row.rank_difference > 0 ? `down ${row.rank_difference}` : row.rank_difference < 0 ? `up ${Math.abs(row.rank_difference)}` : 'flat'} |`,
      `| Reason Codes | ${row.reason_codes.join(', ') || 'none'} |`,
      '',
      '#### Interpretation',
      '',
      `${row.interpretation}`,
      '',
    ].join('\n')),
    rankingExplainability.divergences.length ? '' : 'No material divergence between dashboard and memo rankings was detected.',
    '',
    '## Timing & Persistence',
    '',
    ...bulletList([
      bestWindow
        ? `The best structural window is ${bestWindow.window}, where timing quality and persistence line up better than the rest of the schedule.`
        : 'The best timing window is still unclear.',
      worstWindow
        ? `The weakest window is ${worstWindow.window}, where structures are less stable and price discovery is less helpful.`
        : 'The weakest timing window is still unclear.',
      `Market stabilization is happening ${approxMinutesText(research.market_correction?.summary?.market_stabilization_timing_minutes_to_first_pitch)}, which means the cleaner read still comes well before final pregame resolution.`,
      fastCorrection
        ? `${titleCaseLabel(fastCorrection.window)} is currently a ${qualitativeVelocity(fastCorrection.correction_velocity)} regime, so visible dislocations there tend to close quickly rather than linger.`
        : 'Correction velocity is not yet clear.',
      decaySignals[0]
        ? `${decaySignals[0].team} is the clearest example of a structure that the market is fading rather than validating.`
        : 'There is no dominant collapse pattern yet.',
    ]),
    '',
    '### What Changed Since Last Window',
    '',
    '| Change | Status |',
    '| --- | --- |',
    ...changeLog.map((row) => `| ${row.change} | ${row.status} |`),
    '',
    '## Research Insights',
    '',
    ...bulletList([
      `The market is rejecting roughly half of the detected edges, which is consistent with a moderately efficient correction regime rather than a loose mispricing environment.`,
      `Persistence breadth is ${posture.edgeEnvironment.toLowerCase()}, so the system is learning more about filtration quality than about raw signal abundance.`,
      `Timing remains a real variable: the best window is producing cleaner survival behavior than weaker windows, which suggests structure quality is temporally dependent.`,
      `Volatility is not uniformly hostile; it is clustering in pockets, which means research value comes from regime discrimination more than from global slate averages.`,
      `Historical memory is still early at ${research.historical_memory?.accumulated_research_days || 0} day(s) and ${research.historical_memory?.research_runs || 0} run(s), so conclusions should stay operational rather than statistical.`,
    ]),
    '',
    '### Research Confidence',
    '',
    '| Area | Confidence |',
    '| --- | --- |',
    ...researchConfidence.map(([area, confidence]) => `| ${area} | ${confidence} |`),
    '',
    '## Risk Layer',
    '',
    '| Risk | Severity | Context |',
    '| --- | --- | --- |',
    ...(riskItems.size
      ? [...riskItems].map((item) => `| ${titleCaseLabel(item)} | ${riskSeverity(item)} | ${item === 'incomplete_timelines' ? 'Confirmation remains incomplete across the schedule.' : item === 'schedule_drift' ? 'The schedule is on time now, but several expected windows are still missing.' : item === 'late_sharp_movement' ? 'Late price acceleration can still distort clean entry quality.' : item === 'timing_headwind' ? 'Good structures may still need a better entry window.' : item === 'volatility_expansion' ? 'Volatility is expanding in localized areas rather than across the whole slate.' : 'Monitor for localized instability.'} |`)
      : ['| No major risk flags | Low | Market noise remains manageable. |']),
    '',
    '## Technical Diagnostics',
    '',
    ...bulletList([
      `Freshness is ${checklist.freshness_status?.stale_state ? 'stale' : 'live'} and the last snapshot landed ${freshnessText(checklist.freshness_status?.minutes_since_last_snapshot)}.`,
      `Pipeline health is ${numText(operations.pipeline_health_score, 0)}, source reliability is ${numText(operations.source_reliability_score, 0)} and snapshot density is ${numText(operations.snapshot_density_score, 0)}.`,
      `Timeline completeness is ${pctText(checklist.timeline_completeness?.completion_pct, 0)} with ${checklist.timeline_completeness?.pending || 0} windows still pending.`,
      `Current schedule state is ${titleCaseLabel(overview.meta?.schedule_timing?.schedule_state || 'n/a')} in ${overview.meta?.current_schedule_window || 'n/a'}.`,
    ]),
    '',
  ];

  const markdown = lines.join('\n');
  writeText(currentReportPath, markdown);
  writeText(datedReportPath, markdown);

  return {
    meta: {
      date: reportDate,
      generated_at: generatedAt,
      current_path: currentReportPath,
      dated_path: datedReportPath,
      current_relative_path: path.relative(ROOT, currentReportPath),
      dated_relative_path: path.relative(ROOT, datedReportPath),
      current_schedule_window: checklist.current_operational_phase || overview.meta?.current_schedule_window || null,
    },
    markdown,
    preview: lines.slice(0, 48).join('\n'),
  };
}

function buildOverview() {
  const state = loadCoreState();
  const maps = buildMaps(state);
  const scoredGames = state.scored?.games || [];
  const cards = scoredGames.map((game) => buildGameCard(game, maps)).filter(Boolean);
  const topBettable = cards.filter((card) => card.category === 'top_bettable').sort((a, b) => b.quant_score - a.quant_score);
  const watchlist = cards.filter((card) => card.category === 'watchlist').sort((a, b) => b.edge_pct_points - a.edge_pct_points);
  const noAction = cards.filter((card) => card.category === 'no_action').sort((a, b) => b.persistence_score - a.persistence_score);
  const fades = buildFadeCards(scoredGames);
  const volatilityLeaders = [...(state.temporal?.games || [])]
    .sort((a, b) => (b.market_state?.average_volatility_score || 0) - (a.market_state?.average_volatility_score || 0))
    .slice(0, 8)
    .map((game) => ({
      game_id: game.game_id,
      matchup: `${game.matchup.away.team} @ ${game.matchup.home.team}`,
      volatility_score: game.market_state?.average_volatility_score,
      volatility_regime: game.market_state?.volatility_regime,
      state_flags: game.market_state?.state_flags || [],
    }));
  const persistenceLeaders = (state.edgeValidation?.records || [])
    .filter((row) => ['survived', 'informative', 'strengthened'].includes(row.validation_bucket))
    .sort((a, b) => (b.edge_persistence_score || 0) - (a.edge_persistence_score || 0))
    .slice(0, 8);
  const latestSourceLabel = state.timeline?.meta?.source_labels?.length
    ? state.timeline.meta.source_labels[state.timeline.meta.source_labels.length - 1]
    : null;
  const refresh = refreshPolicy(state.operations?.meta?.snapshot_label || latestSourceLabel?.auto_label || null);
  const scheduledPayloads = buildScheduledPayloads(state, latestSourceLabel, refresh);
  const scheduleTiming = buildScheduleTiming(state, latestSourceLabel, scheduledPayloads);
  const operations = state.operations?.operational_health || {};
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
  const metricTiles = [
    {
      label: 'Pipeline Health',
      value: operations.pipeline_health_score,
      display: round(operations.pipeline_health_score, 1),
      status: classifyHealthStatus(operations.pipeline_health_score),
    },
    {
      label: 'Source Reliability',
      value: operations.source_reliability_score,
      display: round(operations.source_reliability_score, 1),
      status: classifyHealthStatus(operations.source_reliability_score),
    },
    {
      label: 'Market Data Quality',
      value: operations.market_data_quality_score,
      display: round(operations.market_data_quality_score, 1),
      status: classifyHealthStatus(operations.market_data_quality_score),
    },
    {
      label: 'Snapshot Density',
      value: operations.snapshot_density_score,
      display: round(operations.snapshot_density_score, 1),
      status: classifyHealthStatus(operations.snapshot_density_score),
    },
  ];

  return {
    meta: {
      date: state.date,
      generated_at: new Date().toISOString(),
      latest_snapshot_signature: `${state.temporal?.meta?.snapshot_count || 0}:${latestSourceLabel?.source_label || 'none'}:${latestSourceLabel?.timestamp || 'none'}`,
      latest_snapshot_label: latestSourceLabel?.auto_label || state.operations?.meta?.snapshot_label || 'unknown',
      latest_snapshot_time: scheduleTiming.last_snapshot_captured_at,
      source_generated_at: state.scored?.meta?.generated_at || null,
      refresh_policy: refresh,
      scheduled_payloads: scheduledPayloads,
      current_schedule_window: scheduleTiming.current_schedule_window,
      schedule_timing: scheduleTiming,
      bootstrap_status: state.bootstrap
        ? {
            status: state.bootstrap.status || null,
            started_at: state.bootstrap.started_at || null,
            finished_at: state.bootstrap.finished_at || null,
            active_window: state.bootstrap.active_window || null,
            ready_for_today: state.bootstrap.validation?.checks?.ready_for_today ?? null,
          }
        : null,
      operational_checklist: state.checklist || null,
      research_status: state.researchStatus || null,
      research_summary: {
        persistence: state.persistenceResearch?.summary || null,
        timing: state.timingResearch?.summary || null,
        clv: state.clvResearch?.research || null,
        memory: state.researchBundle?.market_memory || null,
      },
    },
    metrics: metricTiles,
    operational_health: {
      pipeline_health_score: operations.pipeline_health_score,
      source_reliability_score: operations.source_reliability_score,
      extraction_success_rate: operations.extraction_success_rate,
      schema_consistency_score: operations.schema_consistency_score,
      market_data_quality_score: operations.market_data_quality_score,
      snapshot_density_score: operations.snapshot_density_score,
      operational_flags: operations.operational_flags || [],
      statuses: {
        pipeline: classifyHealthStatus(operations.pipeline_health_score),
        source: classifyHealthStatus(operations.source_reliability_score),
        schema: classifyHealthStatus(operations.schema_consistency_score),
        market_data: classifyHealthStatus(operations.market_data_quality_score),
        density: classifyHealthStatus(operations.snapshot_density_score),
      },
      source_rows: operations.source_reliability || [],
      timeline_density: operations.snapshot_density || {},
      timeline_progress: timelineProgress,
    },
    sections: {
      top_bettable: topBettable,
      watchlist,
      no_action: noAction,
      fades,
    },
    volatility_leaders: volatilityLeaders,
    persistence_leaders: persistenceLeaders,
    clv_preparation: {
      ready_records: (state.clvPreparation?.records || []).filter((row) => row.clv_ready).length,
      missing_close: (state.clvPreparation?.records || []).filter((row) => row.needs_close_snapshot).length,
      missing_pregame: (state.clvPreparation?.records || []).filter((row) => row.needs_pregame_snapshot).length,
      average_timing_quality: average((state.clvPreparation?.records || []).map((row) => row.timing_quality_score)),
      validation_buckets: state.clvResearch?.summary?.validation_bucket_counts || {},
    },
    research: {
      persistence: state.persistenceResearch?.summary || null,
      timing: state.timingResearch?.summary || null,
      clv: state.clvResearch?.research || null,
      memory: state.researchBundle?.market_memory || null,
    },
    replay_index: (state.replay?.games || []).map((game) => ({
      game_id: game.game_id,
      matchup: `${game.matchup.away.team} @ ${game.matchup.home.team}`,
      snapshot_count: game.snapshot_count,
      state_flags: game.market_state?.state_flags || [],
    })),
    game_index: cards.map((card) => ({
      game_id: card.game_id,
      matchup: card.matchup,
      selection_team: card.selection_team,
      category: card.category,
      quant_score: card.quant_score,
      persistence_score: card.persistence_score,
    })),
  };
}

function gameDetail(gameId) {
  const state = loadCoreState();
  const maps = buildMaps(state);
  const scoredGame = (state.scored?.games || []).find((game) => Number(game.game_id) === Number(gameId));
  if (!scoredGame) return null;
  const card = buildGameCard(scoredGame, maps);
  const timeline = maps.timelineByGame.get(Number(gameId));
  const replay = maps.replayByGame.get(Number(gameId));
  const temporal = maps.temporalByGame.get(Number(gameId));
  const snapshots = (timeline?.snapshots || []).map((snapshot) => ({
    label: snapshot.auto_label,
    source_label: snapshot.source_label,
    timestamp: snapshot.timestamp,
    away_team: timeline.matchup.away.team,
    home_team: timeline.matchup.home.team,
    away_implied: signedPct(snapshot.away.current_implied_probability),
    home_implied: signedPct(snapshot.home.current_implied_probability),
    away_edge: signedPct(snapshot.away.edge_vs_market),
    home_edge: signedPct(snapshot.home.edge_vs_market),
    away_volatility: snapshot.away.volatility_score,
    home_volatility: snapshot.home.volatility_score,
    disagreement: round(snapshot.market_disagreement_score, 4),
    market_pressure: round((snapshot.away.market_pressure || 0) + (snapshot.home.market_pressure || 0), 3),
  }));

  return {
    meta: {
      date: state.date,
      game_id: Number(gameId),
    },
    card,
    scored: scoredGame,
    temporal,
    timeline,
    replay,
    charts: {
      snapshots,
      pressure: temporal?.market_state?.market_pressure_evolution || [],
      disagreement: temporal?.market_state?.disagreement_evolution || [],
    },
  };
}

function listSnapshots(date) {
  const dir = path.join(SNAPSHOTS_DIR, date);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const data = readJson(path.join(dir, file));
      return {
        file,
        snapshot_label: data.meta?.snapshot_label,
        snapshot_timestamp: data.meta?.snapshot_timestamp,
        game_count: data.games?.length || 0,
      };
    });
}

function rawArtifact(name) {
  const allowed = new Map([
    ['scored_matchups', path.join(PROCESSED_DIR, 'scored_matchups.json')],
    ['temporal_market_state', path.join(PROCESSED_DIR, 'temporal_market_state.json')],
    ['edge_persistence', path.join(PROCESSED_DIR, 'edge_persistence.json')],
    ['clv_preparation', path.join(PROCESSED_DIR, 'clv_preparation.json')],
    ['market_timeline', path.join(PROCESSED_DIR, 'market_timeline.json')],
    ['daily_operations_status', path.join(PROCESSED_DIR, 'daily_operations_status.json')],
    ['daily_execution_plan', path.join(PROCESSED_DIR, 'daily_execution_plan.json')],
    ['edge_validation', path.join(PROCESSED_DIR, 'edge_validation.json')],
    ['clv_research', path.join(PROCESSED_DIR, 'clv_research.json')],
    ['outcome_attribution', path.join(PROCESSED_DIR, 'outcome_attribution.json')],
    ['persistence_research', path.join(PROCESSED_DIR, 'persistence_research.json')],
    ['timing_quality_research', path.join(PROCESSED_DIR, 'timing_quality_research.json')],
    ['research_status', path.join(PROCESSED_DIR, 'research_status.json')],
  ]);
  const target = allowed.get(name);
  if (!target || !fs.existsSync(target)) return null;
  return readJson(target);
}

module.exports = {
  buildDecisionPanel,
  buildDecisionLedgerStatus,
  buildOverview,
  buildResearchWorkspace,
  buildQuantReportMarkdown,
  gameDetail,
  listSnapshots,
  rawArtifact,
  loadCoreState,
  ROOT,
  OPS_ROOT,
  LOGS_DIR,
  REPORTS_DIR,
};
