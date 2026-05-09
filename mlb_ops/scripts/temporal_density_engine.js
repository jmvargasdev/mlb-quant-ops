const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OPS_ROOT = path.resolve(__dirname, '..');
const PROCESSED_DIR = path.join(OPS_ROOT, 'processed');
const REPORTS_DIR = path.join(OPS_ROOT, 'reports');
const SNAPSHOTS_DIR = path.join(OPS_ROOT, 'snapshots');
const SCRIPTS_DIR = path.join(OPS_ROOT, 'scripts');

const DATE = process.env.MLB_DATE || new Date().toISOString().slice(0, 10);
const RUN_SNAPSHOT = process.env.RUN_SNAPSHOT === 'true';
const SNAPSHOT_LABEL = process.env.SNAPSHOT_LABEL || null;

const LATEST_PATH = path.join(PROCESSED_DIR, 'latest_matchups.json');
const SCORED_PATH = path.join(PROCESSED_DIR, 'scored_matchups.json');
const TEMPORAL_STATE_PATH = path.join(PROCESSED_DIR, 'temporal_market_state.json');
const EDGE_PERSISTENCE_PATH = path.join(PROCESSED_DIR, 'edge_persistence.json');
const CLV_PREP_PATH = path.join(PROCESSED_DIR, 'clv_preparation.json');
const MARKET_TIMELINE_PATH = path.join(PROCESSED_DIR, 'market_timeline.json');
const REPORT_PATH = path.join(REPORTS_DIR, 'temporal_evolution_report.md');

const EDGE_THRESHOLD = 0.015;

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

function sum(values) {
  return values.filter((value) => value !== null && value !== undefined && Number.isFinite(value)).reduce((acc, value) => acc + value, 0);
}

function stdDev(values, digits = 6) {
  const usable = values.filter((value) => value !== null && value !== undefined && Number.isFinite(value));
  if (usable.length < 2) return 0;
  const mean = usable.reduce((acc, value) => acc + value, 0) / usable.length;
  const variance = usable.reduce((acc, value) => acc + ((value - mean) ** 2), 0) / usable.length;
  return round(Math.sqrt(variance), digits);
}

function hoursBetween(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const diff = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3600000;
  return diff > 0 ? diff : null;
}

function formatPct(value, digits = 1) {
  if (value === null || value === undefined) return 'n/a';
  return `${round(value * 100, digits)}%`;
}

function formatNum(value, digits = 2) {
  if (value === null || value === undefined) return 'n/a';
  return String(round(value, digits));
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function compressedSequence(values) {
  const usable = values.filter(Boolean);
  const output = [];
  for (const value of usable) {
    if (output[output.length - 1] !== value) output.push(value);
  }
  return output;
}

function classifyVolatilityRegime(score) {
  if (score === null || score === undefined) return 'unknown';
  if (score < 25) return 'low';
  if (score < 45) return 'moderate';
  if (score < 65) return 'high';
  return 'extreme';
}

function classifyEdgeLifecycle(initialEdge, latestEdge, persistenceScore, stabilityScore) {
  if (initialEdge === null || latestEdge === null) return 'unknown';
  if (persistenceScore >= 70 && stabilityScore >= 60 && latestEdge > EDGE_THRESHOLD) return 'persistent';
  if (initialEdge > EDGE_THRESHOLD && latestEdge <= 0) return 'collapsed';
  if (latestEdge - initialEdge >= 0.02) return 'strengthening';
  if (initialEdge - latestEdge >= 0.02) return 'decaying';
  if (stabilityScore < 45) return 'fragile';
  return 'mixed';
}

function buildAutoLabel(nowIso, gameStarts, lineupFullyConfirmed) {
  const now = new Date(nowIso);
  const localHour = Number(now.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/New_York' }));
  const firstStart = gameStarts.length ? new Date(Math.min(...gameStarts.map((value) => new Date(value).getTime()))) : null;
  const minutesToFirstPitch = firstStart ? Math.round((firstStart.getTime() - now.getTime()) / 60000) : null;

  if (minutesToFirstPitch !== null && minutesToFirstPitch <= 8) return 'close';
  if (minutesToFirstPitch !== null && minutesToFirstPitch <= 20) return '15m_pregame';
  if (minutesToFirstPitch !== null && minutesToFirstPitch <= 75) return '60m_pregame';
  if (lineupFullyConfirmed && minutesToFirstPitch !== null && minutesToFirstPitch <= 220) return 'lineup_confirm';
  if (minutesToFirstPitch !== null && minutesToFirstPitch <= 330) return '13:00_lineup_watch';
  if (localHour <= 6) return '06:00_open';
  if (localHour <= 8) return '08:00_early';
  if (localHour <= 10) return '10:00_market';
  return 'intraday';
}

function loadSnapshots(date) {
  const dateDir = path.join(SNAPSHOTS_DIR, date);
  if (!fs.existsSync(dateDir)) return [];
  return fs.readdirSync(dateDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const data = readJson(path.join(dateDir, file));
      const lineupConfirmed = (data.games || []).every((game) => /confirmed/i.test(game.lineup_status?.away || '') && /confirmed/i.test(game.lineup_status?.home || ''));
      const autoLabel = buildAutoLabel(
        data.meta?.snapshot_timestamp,
        (data.games || []).map((game) => game.matchup?.game_time_utc).filter(Boolean),
        lineupConfirmed
      );
      return {
        file_name: file,
        file_path: path.join(dateDir, file),
        payload: data,
        timestamp: data.meta?.snapshot_timestamp,
        source_label: data.meta?.snapshot_label || file.replace(/\.json$/, ''),
        auto_label: autoLabel,
      };
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function maybeRunSnapshot() {
  if (!RUN_SNAPSHOT) return null;
  const latest = readJson(LATEST_PATH);
  const nowIso = new Date().toISOString();
  const gameStarts = (latest.games || []).map((game) => game.matchup?.game_time_utc).filter(Boolean);
  const lineupConfirmed = (latest.games || []).every((game) => /confirmed/i.test(game.lineups?.away?.status || '') && /confirmed/i.test(game.lineups?.home?.status || ''));
  const resolvedLabel = SNAPSHOT_LABEL || buildAutoLabel(nowIso, gameStarts, lineupConfirmed);
  execFileSync('node', [path.join(SCRIPTS_DIR, 'intraday_snapshot_engine.js')], {
    cwd: path.resolve(OPS_ROOT, '..'),
    env: {
      ...process.env,
      MLB_DATE: DATE,
      SNAPSHOT_LABEL: resolvedLabel,
    },
    stdio: 'inherit',
  });
  return resolvedLabel;
}

function extractTimelinePoint(snapshotMeta, game, side) {
  const market = game.market?.[side] || {};
  const sideMetrics = game.side_metrics?.[side] || {};
  const oppositeSide = side === 'away' ? 'home' : 'away';
  const lineupStatus = game.lineup_status?.[side] || null;
  const weather = game.weather?.current || {};
  return {
    timestamp: snapshotMeta.snapshot_timestamp,
    source_label: snapshotMeta.snapshot_label,
    auto_label: snapshotMeta.auto_label,
    current_american: market.current_american ?? null,
    current_implied_probability: market.current_implied_probability ?? null,
    open_american: market.open_american ?? null,
    open_implied_probability: market.open_implied_probability ?? null,
    total_current: game.market?.total?.current ?? null,
    market_disagreement_score: game.market_disagreement_score ?? null,
    directional_consensus: sideMetrics.directional_consensus || null,
    overall_consensus: game.directional_consensus || null,
    line_velocity: sideMetrics.line_velocity ?? null,
    line_acceleration: sideMetrics.line_acceleration ?? null,
    volatility_score: sideMetrics.volatility_score ?? null,
    market_stability_score: sideMetrics.market_stability_score ?? null,
    market_pressure: sideMetrics.market_pressure ?? null,
    edge_vs_market: sideMetrics.edge_vs_market ?? null,
    fair_win_probability: sideMetrics.fair_win_probability ?? null,
    flags: sideMetrics.flags || [],
    lineup_status: lineupStatus,
    lineup_confirmed: /confirmed/i.test(lineupStatus || ''),
    weather: {
      temperature_f: weather.temperature_f ?? null,
      wind_speed_mph: weather.wind_speed_mph ?? null,
      rain_probability_pct: weather.rain_probability_pct ?? null,
      humidity_pct: weather.humidity_pct ?? null,
    },
    opposite_current_implied_probability: game.market?.[oppositeSide]?.current_implied_probability ?? null,
    source_confidence: game.source_confidence ?? snapshotMeta.source_confidence ?? null,
  };
}

function buildTimeline(snapshots, scoredMap) {
  const games = new Map();
  for (const snapshot of snapshots) {
    for (const game of snapshot.payload.games || []) {
      if (!games.has(game.game_id)) {
        const scoredGame = scoredMap.get(game.game_id) || null;
        games.set(game.game_id, {
          game_id: game.game_id,
          matchup: game.matchup,
          scheduled_start_utc: game.matchup?.game_time_utc || null,
          baseline_best_edge: scoredGame?.best_edge || null,
          snapshots: [],
        });
      }
      const target = games.get(game.game_id);
      target.snapshots.push({
        timestamp: snapshot.timestamp,
        source_label: snapshot.source_label,
        auto_label: snapshot.auto_label,
        source_confidence: snapshot.payload.meta?.source_confidence ?? null,
        market_disagreement_score: game.market_disagreement_score ?? null,
        overall_consensus: game.directional_consensus || null,
        total_current: game.market?.total?.current ?? null,
        lineup_status: game.lineup_status,
        weather: game.weather?.current || null,
        away: extractTimelinePoint({
          snapshot_timestamp: snapshot.timestamp,
          snapshot_label: snapshot.source_label,
          auto_label: snapshot.auto_label,
          source_confidence: snapshot.payload.meta?.source_confidence ?? null,
        }, game, 'away'),
        home: extractTimelinePoint({
          snapshot_timestamp: snapshot.timestamp,
          snapshot_label: snapshot.source_label,
          auto_label: snapshot.auto_label,
          source_confidence: snapshot.payload.meta?.source_confidence ?? null,
        }, game, 'home'),
      });
    }
  }
  return [...games.values()].sort((a, b) => new Date(a.scheduled_start_utc).getTime() - new Date(b.scheduled_start_utc).getTime());
}

function countStateFlips(values) {
  return Math.max(0, compressedSequence(values).length - 1);
}

function findEdgeHalfLife(edges, timestamps) {
  if (!edges.length || !timestamps.length) return null;
  const initial = edges[0];
  if (initial === null || initial === undefined || Math.abs(initial) < EDGE_THRESHOLD) return null;
  const initialAbs = Math.abs(initial);
  const initialSign = Math.sign(initial);
  for (let i = 1; i < edges.length; i += 1) {
    const edge = edges[i];
    if (edge === null || edge === undefined) continue;
    if (Math.sign(edge) !== initialSign) return round(hoursBetween(timestamps[0], timestamps[i]), 3);
    if (Math.abs(edge) <= initialAbs / 2) {
      return round(hoursBetween(timestamps[0], timestamps[i]), 3);
    }
  }
  return null;
}

function buildPersistenceMetrics(points) {
  const timestamps = points.map((point) => point.timestamp);
  const edges = points.map((point) => point.edge_vs_market);
  const volatilities = points.map((point) => point.volatility_score);
  const disagreements = points.map((point) => point.market_disagreement_score);
  const velocities = points.map((point) => point.line_velocity);
  const meaningful = edges.filter((value) => value !== null && value !== undefined);
  const observations = meaningful.length;
  const positiveCount = meaningful.filter((value) => value > EDGE_THRESHOLD).length;
  const signConsistency = observations ? Math.max(
    meaningful.filter((value) => value >= 0).length,
    meaningful.filter((value) => value < 0).length
  ) / observations : 0;
  const persistenceRatio = observations ? positiveCount / observations : 0;
  const magnitudeStability = observations
    ? clamp(1 - (stdDev(meaningful) / Math.max(0.02, Math.abs(average(meaningful) || 0) + 0.02)), 0, 1)
    : 0;
  const dataCompleteness = points.length ? observations / points.length : 0;
  const avgVolatility = average(volatilities) || 0;
  const volatilityPenalty = clamp(avgVolatility / 100, 0, 1);
  const disagreementPenalty = clamp((average(disagreements) || 0), 0, 1);

  const score = round(clamp(
    (
      (persistenceRatio * 0.38) +
      (signConsistency * 0.24) +
      (magnitudeStability * 0.2) +
      (dataCompleteness * 0.1) +
      ((1 - volatilityPenalty) * 0.05) +
      ((1 - disagreementPenalty) * 0.03)
    ) * 100,
    0,
    100
  ), 2);

  const firstEdge = meaningful.length ? meaningful[0] : null;
  const latestEdge = meaningful.length ? meaningful[meaningful.length - 1] : null;
  const totalHours = hoursBetween(timestamps[0], timestamps[timestamps.length - 1]) || 0;
  const delta = firstEdge !== null && latestEdge !== null ? latestEdge - firstEdge : null;
  const decayRate = delta !== null && totalHours ? round(delta / totalHours, 5) : null;
  const strengtheningRate = decayRate !== null && decayRate > 0 ? decayRate : 0;
  const halfLife = findEdgeHalfLife(meaningful, timestamps.filter(Boolean));
  const stabilityScore = round(clamp((magnitudeStability * 0.6) + (signConsistency * 0.4), 0, 1) * 100, 2);

  return {
    observations: points.length,
    usable_edge_observations: observations,
    first_edge: firstEdge,
    latest_edge: latestEdge,
    peak_edge: meaningful.length ? Math.max(...meaningful) : null,
    trough_edge: meaningful.length ? Math.min(...meaningful) : null,
    edge_persistence_score: score,
    edge_decay_rate: decayRate,
    edge_strengthening_rate: round(strengtheningRate, 5),
    edge_half_life_hours: halfLife,
    edge_stability_score: stabilityScore,
    persistence_ratio: round(persistenceRatio, 4),
    sign_consistency: round(signConsistency, 4),
    average_volatility_score: round(avgVolatility, 2),
    average_disagreement_score: round(average(disagreements) || 0, 4),
    average_velocity: round(average(velocities) || 0, 5),
    edge_lifecycle: classifyEdgeLifecycle(firstEdge, latestEdge, score, stabilityScore),
  };
}

function buildMarketState(gameTimeline) {
  const snapshots = gameTimeline.snapshots;
  const awayVols = snapshots.map((snapshot) => snapshot.away.volatility_score);
  const homeVols = snapshots.map((snapshot) => snapshot.home.volatility_score);
  const allVols = [...awayVols, ...homeVols];
  const allDisagreement = snapshots.map((snapshot) => snapshot.market_disagreement_score);
  const allConsensus = snapshots.map((snapshot) => snapshot.overall_consensus);
  const allPressure = [
    ...snapshots.map((snapshot) => snapshot.away.market_pressure),
    ...snapshots.map((snapshot) => snapshot.home.market_pressure),
  ];
  const avgVol = average(allVols) || 0;
  const firstRegime = classifyVolatilityRegime(average([awayVols[0], homeVols[0]]) || 0);
  const lastRegime = classifyVolatilityRegime(average([awayVols[awayVols.length - 1], homeVols[homeVols.length - 1]]) || 0);
  const volatilityRegime = classifyVolatilityRegime(avgVol);
  const pressureTrend = round((snapshots[snapshots.length - 1]?.away.market_pressure || 0) + (snapshots[snapshots.length - 1]?.home.market_pressure || 0), 3);
  const lateSnapshot = snapshots[snapshots.length - 1];
  const priorSnapshot = snapshots[snapshots.length - 2] || null;
  const lateMove = priorSnapshot
    ? Math.max(
      Math.abs((lateSnapshot.away.current_implied_probability ?? 0) - (priorSnapshot.away.current_implied_probability ?? 0)),
      Math.abs((lateSnapshot.home.current_implied_probability ?? 0) - (priorSnapshot.home.current_implied_probability ?? 0))
    )
    : 0;
  const lineupTransition = snapshots.some((snapshot, index) => {
    if (!index) return false;
    return snapshot.away.lineup_status !== snapshots[index - 1].away.lineup_status || snapshot.home.lineup_status !== snapshots[index - 1].home.lineup_status;
  });
  const weatherTransition = snapshots.some((snapshot, index) => {
    if (!index) return false;
    const prev = snapshots[index - 1];
    return (
      Math.abs((snapshot.weather?.wind_speed_mph ?? 0) - (prev.weather?.wind_speed_mph ?? 0)) >= 4 ||
      Math.abs((snapshot.weather?.rain_probability_pct ?? 0) - (prev.weather?.rain_probability_pct ?? 0)) >= 20 ||
      Math.abs((snapshot.weather?.temperature_f ?? 0) - (prev.weather?.temperature_f ?? 0)) >= 6
    );
  });

  const stateFlags = [];
  if (avgVol < 25 && (average(allDisagreement) || 0) < 0.08) stateFlags.push('stable_market');
  if (avgVol >= 55 || countStateFlips(allConsensus) >= 2) stateFlags.push('unstable_market');
  if (lateMove >= 0.02) stateFlags.push('late_sharp_movement');
  if ((lineupTransition || weatherTransition) && lateMove >= 0.01) stateFlags.push('information_driven_movement');
  if (!lineupTransition && !weatherTransition && avgVol >= 45) stateFlags.push('noise_driven_movement');
  if ((average(allPressure) || 0) > 3) stateFlags.push('late_money_signal');
  if (stdDev(allVols) <= 8 && avgVol < 30) stateFlags.push('volatility_compression');
  if (stdDev(allVols) >= 15 || lateMove >= 0.025) stateFlags.push('volatility_expansion');
  if ((allDisagreement[0] || 0) >= 0.18 && (allDisagreement[allDisagreement.length - 1] || 0) <= 0.08) stateFlags.push('disagreement_resolution');

  return {
    snapshot_count: snapshots.length,
    market_state_transition: `${firstRegime}_to_${lastRegime}`,
    volatility_regime: volatilityRegime,
    directional_consensus_evolution: compressedSequence(allConsensus),
    market_pressure_evolution: snapshots.map((snapshot) => ({
      timestamp: snapshot.timestamp,
      value: round((snapshot.away.market_pressure || 0) + (snapshot.home.market_pressure || 0), 3),
    })),
    disagreement_evolution: snapshots.map((snapshot) => ({
      timestamp: snapshot.timestamp,
      value: snapshot.market_disagreement_score,
    })),
    average_volatility_score: round(avgVol, 2),
    volatility_stddev: round(stdDev(allVols), 3),
    disagreement_average: round(average(allDisagreement) || 0, 4),
    disagreement_delta: round((allDisagreement[allDisagreement.length - 1] || 0) - (allDisagreement[0] || 0), 4),
    market_pressure_average: round(average(allPressure) || 0, 3),
    market_pressure_peak: round(Math.max(...allPressure.filter((value) => value !== null && value !== undefined), 0), 3),
    state_flags: stateFlags,
  };
}

function buildObservability(snapshots, expectedGameCount) {
  const referenceGameKeys = snapshots[0]?.payload?.games?.[0] ? Object.keys(snapshots[0].payload.games[0]).sort() : [];
  const referenceSideMetricKeys = snapshots[0]?.payload?.games?.[0]?.side_metrics?.away ? Object.keys(snapshots[0].payload.games[0].side_metrics.away).sort() : [];

  const snapshotRows = snapshots.map((snapshot) => {
    const games = snapshot.payload.games || [];
    let missingCriticalFields = 0;
    let criticalChecks = 0;

    for (const game of games) {
      for (const side of ['away', 'home']) {
        const market = game.market?.[side];
        const metrics = game.side_metrics?.[side];
        const weather = game.weather?.current;
        const checks = [
          market?.current_american,
          market?.current_implied_probability,
          game.market?.total?.current,
          metrics?.edge_vs_market,
          metrics?.volatility_score,
          weather?.temperature_f,
          weather?.wind_speed_mph,
          game.lineup_status?.[side],
        ];
        checks.forEach((value) => {
          criticalChecks += 1;
          if (value === null || value === undefined) missingCriticalFields += 1;
        });
      }
    }

    const currentGameKeys = games[0] ? Object.keys(games[0]).sort() : [];
    const currentSideMetricKeys = games[0]?.side_metrics?.away ? Object.keys(games[0].side_metrics.away).sort() : [];
    const schemaStable = JSON.stringify(referenceGameKeys) === JSON.stringify(currentGameKeys)
      && JSON.stringify(referenceSideMetricKeys) === JSON.stringify(currentSideMetricKeys);
    const completeness = criticalChecks ? 1 - (missingCriticalFields / criticalChecks) : 1;
    const gameCountPenalty = expectedGameCount && games.length !== expectedGameCount ? 0.12 : 0;
    const score = round(clamp(
      ((snapshot.payload.meta?.source_confidence ?? 0.75) * 0.55) +
      (completeness * 0.35) +
      ((schemaStable ? 1 : 0) * 0.1) -
      gameCountPenalty,
      0,
      1
    ) * 100, 2);

    return {
      timestamp: snapshot.timestamp,
      source_label: snapshot.source_label,
      auto_label: snapshot.auto_label,
      games_captured: games.length,
      expected_game_count: expectedGameCount,
      source_confidence: snapshot.payload.meta?.source_confidence ?? null,
      snapshot_consistency: games.length === expectedGameCount,
      schema_stable: schemaStable,
      missing_critical_field_rate: round(criticalChecks ? missingCriticalFields / criticalChecks : 0, 4),
      market_data_quality_score: score,
    };
  });

  const timestampCounts = snapshotRows.reduce((acc, row) => {
    acc[row.timestamp] = (acc[row.timestamp] || 0) + 1;
    return acc;
  }, {});
  const duplicateTimestamps = Object.entries(timestampCounts)
    .filter(([, count]) => count > 1)
    .map(([timestamp]) => timestamp);
  const orphanSnapshots = snapshotRows
    .filter((row) => !row.source_label && !row.auto_label)
    .map((row) => row.timestamp);
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
  const presentLabels = new Set(snapshotRows.map((row) => row.auto_label).filter(Boolean));
  const missingWindows = scheduleWindows.filter((label) => !presentLabels.has(label));
  const latestTimestamp = snapshotRows.length ? Math.max(...snapshotRows.map((row) => new Date(row.timestamp).getTime())) : null;
  const minutesSinceLastSnapshot = latestTimestamp ? round((Date.now() - latestTimestamp) / 60000, 2) : null;

  return {
    source_health_over_time: snapshotRows.map((row) => ({
      timestamp: row.timestamp,
      source_label: row.source_label,
      auto_label: row.auto_label,
      source_confidence: row.source_confidence,
      market_data_quality_score: row.market_data_quality_score,
    })),
    snapshot_consistency: {
      expected_game_count: expectedGameCount,
      inconsistent_snapshots: snapshotRows.filter((row) => !row.snapshot_consistency).map((row) => row.source_label),
      schema_drift_detected: snapshotRows.some((row) => !row.schema_stable),
      duplicate_timestamps_detected: duplicateTimestamps.length > 0,
      duplicate_timestamps: duplicateTimestamps,
      orphan_snapshots_detected: orphanSnapshots.length > 0,
      orphan_snapshots: orphanSnapshots,
      schedule_drift_detected: missingWindows.length > 0,
      missing_schedule_windows: missingWindows,
      snapshots: snapshotRows,
    },
    missing_data_tracking: snapshotRows.map((row) => ({
      timestamp: row.timestamp,
      source_label: row.source_label,
      missing_critical_field_rate: row.missing_critical_field_rate,
    })),
    market_data_quality_score: round(average(snapshotRows.map((row) => row.market_data_quality_score)) || 0, 2),
    staleness: {
      minutes_since_last_snapshot: minutesSinceLastSnapshot,
      stale_timeline_detected: minutesSinceLastSnapshot !== null ? minutesSinceLastSnapshot > 240 : false,
    },
  };
}

function buildClvPreparation(gameTimeline, sidePersistence) {
  const timelines = [];
  for (const game of gameTimeline) {
    for (const side of ['away', 'home']) {
      const points = game.snapshots.map((snapshot) => snapshot[side]);
      const first = points[0] || null;
      const latest = points[points.length - 1] || null;
      const latestMeaningful = [...points].reverse().find((point) => point.current_american !== null && point.current_american !== undefined) || latest;
      const scheduledStart = game.scheduled_start_utc ? new Date(game.scheduled_start_utc) : null;
      const pregamePoint = scheduledStart
        ? [...points].reverse().find((point) => {
          const diffMinutes = (scheduledStart.getTime() - new Date(point.timestamp).getTime()) / 60000;
          return diffMinutes >= 0 && diffMinutes <= 75;
        }) || null
        : null;
      const closePoint = [...points].reverse().find((point) => point.auto_label === 'close') || null;
      const persistence = sidePersistence.get(`${game.game_id}:${side}`) || null;

      timelines.push({
        game_id: game.game_id,
        matchup: `${game.matchup.away.team} @ ${game.matchup.home.team}`,
        side,
        team: game.matchup[side].team,
        team_abbreviation: game.matchup[side].abbreviation,
        scheduled_start_utc: game.scheduled_start_utc,
        timeline_density: points.length,
        opening_american: first?.open_american ?? first?.current_american ?? null,
        opening_implied_probability: first?.open_implied_probability ?? first?.current_implied_probability ?? null,
        latest_american: latestMeaningful?.current_american ?? null,
        latest_implied_probability: latestMeaningful?.current_implied_probability ?? null,
        pregame_american: pregamePoint?.current_american ?? null,
        pregame_implied_probability: pregamePoint?.current_implied_probability ?? null,
        close_proxy_american: closePoint?.current_american ?? latestMeaningful?.current_american ?? null,
        close_proxy_implied_probability: closePoint?.current_implied_probability ?? latestMeaningful?.current_implied_probability ?? null,
        first_edge: persistence?.first_edge ?? null,
        latest_edge: persistence?.latest_edge ?? null,
        edge_persistence_score: persistence?.edge_persistence_score ?? null,
        edge_decay_rate: persistence?.edge_decay_rate ?? null,
        timing_quality_score: round(clamp(
          ((points.length >= 4 ? 0.4 : points.length / 10) * 0.5) +
          ((pregamePoint ? 1 : 0) * 0.35) +
          ((closePoint ? 1 : 0.5) * 0.15),
          0,
          1
        ) * 100, 2),
        entry_quality: persistence?.edge_persistence_score >= 65 && (persistence?.latest_edge ?? -1) > EDGE_THRESHOLD ? 'durable_entry' :
          persistence?.edge_persistence_score >= 50 ? 'monitor' : 'fragile_entry',
        clv_ready: points.length >= 2,
        needs_close_snapshot: !closePoint,
        needs_pregame_snapshot: !pregamePoint,
      });
    }
  }

  return {
    meta: {
      date: DATE,
      generated_at: new Date().toISOString(),
      purpose: 'Foundation for opening-vs-close, snapshot-vs-close, and edge-persistence-vs-clv analysis.',
    },
    fields_available: [
      'opening_american',
      'latest_american',
      'pregame_american',
      'close_proxy_american',
      'first_edge',
      'latest_edge',
      'edge_persistence_score',
      'edge_decay_rate',
      'timeline_density',
      'timing_quality_score',
    ],
    records: timelines,
    database_preparation: {
      sqlite_tables: {
        market_snapshots: ['date', 'timestamp', 'game_id', 'side', 'current_american', 'current_implied_probability', 'total_current', 'source_confidence'],
        edge_snapshots: ['date', 'timestamp', 'game_id', 'side', 'fair_win_probability', 'edge_vs_market', 'volatility_score', 'market_pressure', 'flags_json'],
        source_health: ['date', 'timestamp', 'source_label', 'source_confidence', 'market_data_quality_score', 'schema_stable', 'game_count'],
      },
      postgres_hint: 'Partition market_snapshots by date and index (game_id, side, timestamp).',
    },
  };
}

function buildTemporalReport(state, persistenceRows, clvPrep) {
  const strongestPersistent = [...persistenceRows]
    .filter((row) => row.latest_edge !== null && row.latest_edge > EDGE_THRESHOLD)
    .sort((a, b) => b.edge_persistence_score - a.edge_persistence_score)
    .slice(0, 8);
  const fastestDecay = [...persistenceRows]
    .filter((row) => row.first_edge !== null && row.first_edge > EDGE_THRESHOLD && row.edge_decay_rate !== null)
    .sort((a, b) => a.edge_decay_rate - b.edge_decay_rate)
    .slice(0, 8);
  const highestVolatility = [...state.games]
    .sort((a, b) => (b.market_state.average_volatility_score || 0) - (a.market_state.average_volatility_score || 0))
    .slice(0, 8);
  const stableMarkets = state.games
    .filter((game) => game.market_state.state_flags.includes('stable_market'))
    .slice(0, 8);
  const sharpSignals = state.games
    .filter((game) => game.market_state.state_flags.includes('late_sharp_movement') || game.market_state.state_flags.includes('information_driven_movement'))
    .slice(0, 8);

  const lines = [
    '# MLB Temporal Evolution Report',
    '',
    `Date: ${state.meta.date}`,
    `Snapshots analyzed: ${state.meta.snapshot_count}`,
    `Temporal quality score: ${formatNum(state.observability.market_data_quality_score, 1)}`,
    '',
    '## Strongest Persistent Edges',
    '',
  ];

  const section = (rows, formatter) => {
    if (!rows.length) {
      lines.push('No qualifying signals.');
      lines.push('');
      return;
    }
    rows.forEach((row) => lines.push(`- ${formatter(row)}`));
    lines.push('');
  };

  section(
    strongestPersistent,
    (row) => `${row.team} in ${row.matchup}: persistence ${formatNum(row.edge_persistence_score, 1)}, latest edge ${formatNum(row.latest_edge * 100, 2)} pts, lifecycle ${row.edge_lifecycle}`
  );

  lines.push('## Fastest Edge Decay');
  lines.push('');
  section(
    fastestDecay,
    (row) => `${row.team} in ${row.matchup}: decay ${formatNum(row.edge_decay_rate * 100, 3)} pts/hr, first edge ${formatNum(row.first_edge * 100, 2)} pts, latest ${formatNum(row.latest_edge * 100, 2)} pts`
  );

  lines.push('## Highest Market Volatility');
  lines.push('');
  section(
    highestVolatility,
    (row) => `${row.matchup.away.team} @ ${row.matchup.home.team}: avg vol ${formatNum(row.market_state.average_volatility_score, 1)}, transition ${row.market_state.market_state_transition}, flags ${row.market_state.state_flags.join(', ') || 'none'}`
  );

  lines.push('## Stable Market Structures');
  lines.push('');
  section(
    stableMarkets,
    (row) => `${row.matchup.away.team} @ ${row.matchup.home.team}: disagreement ${formatNum(row.market_state.disagreement_average, 3)}, pressure ${formatNum(row.market_state.market_pressure_average, 2)}`
  );

  lines.push('## Potential Sharp Money Activity');
  lines.push('');
  section(
    sharpSignals,
    (row) => `${row.matchup.away.team} @ ${row.matchup.home.team}: flags ${row.market_state.state_flags.join(', ')}, volatility ${formatNum(row.market_state.average_volatility_score, 1)}`
  );

  lines.push('## Edge Persistence vs Market Movement');
  lines.push('');
  section(
    clvPrep.records
      .filter((row) => row.edge_persistence_score !== null)
      .sort((a, b) => (b.edge_persistence_score || 0) - (a.edge_persistence_score || 0))
      .slice(0, 8),
    (row) => `${row.team} in ${row.matchup}: density ${row.timeline_density}, timing ${formatNum(row.timing_quality_score, 1)}, latest ${row.latest_american}, close proxy ${row.close_proxy_american}`
  );

  return lines.join('\n');
}

function main() {
  maybeRunSnapshot();

  if (!fs.existsSync(LATEST_PATH) || !fs.existsSync(SCORED_PATH)) {
    throw new Error('Missing latest_matchups.json or scored_matchups.json.');
  }

  const latest = readJson(LATEST_PATH);
  const scored = readJson(SCORED_PATH);
  const scoredMap = new Map((scored.games || []).map((game) => [game.game_id, game.scoring]));
  const snapshots = loadSnapshots(DATE);

  if (!snapshots.length) {
    throw new Error(`No snapshots found for ${DATE} in ${SNAPSHOTS_DIR}.`);
  }

  const gameTimelines = buildTimeline(snapshots, scoredMap);
  const sidePersistenceMap = new Map();
  const persistenceRows = [];
  const temporalGames = [];

  for (const gameTimeline of gameTimelines) {
    for (const side of ['away', 'home']) {
      const points = gameTimeline.snapshots.map((snapshot) => snapshot[side]);
      const persistence = buildPersistenceMetrics(points);
      const key = `${gameTimeline.game_id}:${side}`;
      sidePersistenceMap.set(key, {
        ...persistence,
        game_id: gameTimeline.game_id,
        matchup: `${gameTimeline.matchup.away.team} @ ${gameTimeline.matchup.home.team}`,
        side,
        team: gameTimeline.matchup[side].team,
        team_abbreviation: gameTimeline.matchup[side].abbreviation,
      });
      persistenceRows.push(sidePersistenceMap.get(key));
    }

    temporalGames.push({
      game_id: gameTimeline.game_id,
      matchup: gameTimeline.matchup,
      scheduled_start_utc: gameTimeline.scheduled_start_utc,
      snapshot_count: gameTimeline.snapshots.length,
      market_state: buildMarketState(gameTimeline),
      sides: {
        away: sidePersistenceMap.get(`${gameTimeline.game_id}:away`),
        home: sidePersistenceMap.get(`${gameTimeline.game_id}:home`),
      },
    });
  }

  const observability = buildObservability(snapshots, latest.games?.length || snapshots[0].payload.games?.length || null);
  const timelinePayload = {
    meta: {
      date: DATE,
      generated_at: new Date().toISOString(),
      snapshot_count: snapshots.length,
      source_labels: snapshots.map((snapshot) => ({
        file_name: snapshot.file_name,
        source_label: snapshot.source_label,
        auto_label: snapshot.auto_label,
        timestamp: snapshot.timestamp,
      })),
    },
    games: gameTimelines,
  };

  const temporalState = {
    meta: {
      date: DATE,
      generated_at: new Date().toISOString(),
      snapshot_count: snapshots.length,
      temporal_density_engine: 'v1',
      coverage: {
        scheduled_games: latest.games?.length || null,
        games_with_timeline: gameTimelines.length,
      },
    },
    temporal_density: {
      current_snapshot_count: snapshots.length,
      labels_present: uniq(snapshots.map((snapshot) => snapshot.auto_label)),
      recommended_capture_windows: [
        '06:00_open',
        '08:00_early',
        '10:00_market',
        '13:00_lineup_watch',
        'lineup_confirm',
        '60m_pregame',
        '15m_pregame',
        'close',
      ],
      density_assessment: snapshots.length >= 6 ? 'high' : snapshots.length >= 4 ? 'medium' : 'low',
    },
    observability,
    games: temporalGames,
    alerting_foundation: {
      future_alerts: [
        'persistent_edge_plus_stable_market',
        'edge_collapse',
        'reverse_movement',
        'volatility_spike',
        'disagreement_resolution',
        'late_steam',
        'suspicious_movement',
      ],
    },
  };

  const clvPreparation = buildClvPreparation(gameTimelines, sidePersistenceMap);
  const edgePersistence = {
    meta: {
      date: DATE,
      generated_at: new Date().toISOString(),
      scoring_thresholds: {
        positive_edge_threshold: EDGE_THRESHOLD,
      },
    },
    records: persistenceRows.sort((a, b) => (b.edge_persistence_score || 0) - (a.edge_persistence_score || 0)),
  };

  writeJson(MARKET_TIMELINE_PATH, timelinePayload);
  writeJson(TEMPORAL_STATE_PATH, temporalState);
  writeJson(EDGE_PERSISTENCE_PATH, edgePersistence);
  writeJson(CLV_PREP_PATH, clvPreparation);
  writeText(REPORT_PATH, buildTemporalReport(temporalState, edgePersistence.records, clvPreparation));

  console.log(JSON.stringify({
    outputs: [
      path.relative(process.cwd(), TEMPORAL_STATE_PATH),
      path.relative(process.cwd(), EDGE_PERSISTENCE_PATH),
      path.relative(process.cwd(), CLV_PREP_PATH),
      path.relative(process.cwd(), MARKET_TIMELINE_PATH),
      path.relative(process.cwd(), REPORT_PATH),
    ],
    snapshotCount: snapshots.length,
    games: gameTimelines.length,
  }, null, 2));
}

main();
