const fs = require('fs');
const path = require('path');

const OPS_ROOT = path.resolve(__dirname, '..');
const PROCESSED_DIR = path.join(OPS_ROOT, 'processed');
const REPORTS_DIR = path.join(OPS_ROOT, 'reports');

const DATE = process.env.MLB_DATE || new Date().toISOString().slice(0, 10);
const EDGE_THRESHOLD = Number(process.env.EDGE_THRESHOLD || 0.015);

const CLV_PREP_PATH = path.join(PROCESSED_DIR, 'clv_preparation.json');
const TEMPORAL_STATE_PATH = path.join(PROCESSED_DIR, 'temporal_market_state.json');
const EDGE_PERSISTENCE_PATH = path.join(PROCESSED_DIR, 'edge_persistence.json');
const TIMELINE_PATH = path.join(PROCESSED_DIR, 'market_timeline.json');
const CLV_RESEARCH_PATH = path.join(PROCESSED_DIR, 'clv_research.json');
const EDGE_VALIDATION_PATH = path.join(PROCESSED_DIR, 'edge_validation.json');
const TIMING_REPORT_PATH = path.join(REPORTS_DIR, 'timing_quality_report.md');
const PERSISTENCE_REPORT_PATH = path.join(REPORTS_DIR, 'persistence_validation_report.md');

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

function stdDev(values, digits = 6) {
  const usable = values.filter((value) => value !== null && value !== undefined && Number.isFinite(value));
  if (usable.length < 2) return 0;
  const mean = usable.reduce((sum, value) => sum + value, 0) / usable.length;
  const variance = usable.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / usable.length;
  return round(Math.sqrt(variance), digits);
}

function formatNum(value, digits = 2) {
  if (value === null || value === undefined) return 'n/a';
  return String(round(value, digits));
}

function minutesToStart(snapshotTimestamp, scheduledStart) {
  if (!snapshotTimestamp || !scheduledStart) return null;
  return round((new Date(scheduledStart).getTime() - new Date(snapshotTimestamp).getTime()) / 60000, 2);
}

function firstMatching(points, predicate) {
  for (const point of points) {
    if (predicate(point)) return point;
  }
  return null;
}

function lastMatching(points, predicate) {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (predicate(points[i])) return points[i];
  }
  return null;
}

function classifyValidation(record, marketState) {
  const firstEdge = record.first_edge ?? null;
  const latestEdge = record.latest_edge ?? null;
  const persistenceScore = record.edge_persistence_score ?? 0;
  const avgVol = record.average_volatility_score ?? 0;
  const avgDisagreement = record.average_disagreement_score ?? 0;
  const stateFlags = marketState?.state_flags || [];

  if (firstEdge !== null && firstEdge > EDGE_THRESHOLD && latestEdge !== null && latestEdge <= 0) {
    return 'collapsed';
  }
  if (firstEdge !== null && firstEdge > EDGE_THRESHOLD && latestEdge !== null && latestEdge - firstEdge >= 0.015) {
    return 'strengthened';
  }
  if (firstEdge !== null && firstEdge > EDGE_THRESHOLD && latestEdge !== null && latestEdge > EDGE_THRESHOLD && persistenceScore >= 65) {
    return 'survived';
  }
  if (persistenceScore >= 65 && (stateFlags.includes('information_driven_movement') || stateFlags.includes('disagreement_resolution'))) {
    return 'informative';
  }
  if (avgVol >= 50 || avgDisagreement >= 0.18) {
    return 'noise_prone';
  }
  if (latestEdge !== null && latestEdge <= 0) return 'rejected';
  return 'monitor';
}

function labelTimingBucket(point) {
  if (!point) return 'missing';
  if (point.auto_label === 'close') return 'close';
  if (point.auto_label === '15m_pregame') return '15m_pregame';
  if (point.auto_label === '60m_pregame') return '60m_pregame';
  if (point.auto_label === 'lineup_confirm') return 'lineup_confirm';
  if (point.auto_label === '13:00_lineup_watch') return 'lineup_watch';
  if (point.auto_label === '10:00_market') return 'market';
  if (point.auto_label === '08:00_early') return 'early';
  if (point.auto_label === '06:00_open') return 'open';
  return point.auto_label || 'intraday';
}

function buildValidationSignals(record, marketState, comparisons) {
  const signals = [];
  if ((record.first_edge ?? 0) > EDGE_THRESHOLD && (record.latest_edge ?? 0) > EDGE_THRESHOLD) signals.push('edge_survived');
  if ((record.first_edge ?? 0) > EDGE_THRESHOLD && (record.latest_edge ?? 0) <= 0) signals.push('edge_collapse');
  if ((record.latest_edge ?? 0) - (record.first_edge ?? 0) >= 0.015) signals.push('edge_strengthening');
  if ((record.edge_decay_rate ?? 0) < -0.01) signals.push('fast_decay');
  if ((record.average_disagreement_score ?? 0) >= 0.18) signals.push('market_disagreement');
  if ((record.average_volatility_score ?? 0) >= 50) signals.push('high_volatility');
  if ((marketState?.state_flags || []).includes('late_sharp_movement')) signals.push('late_sharp_movement');
  if ((marketState?.state_flags || []).includes('stable_market')) signals.push('stable_market');
  const favorableEntries = comparisons.filter((row) => row.favorable_to_close === true).length;
  const unfavorableEntries = comparisons.filter((row) => row.favorable_to_close === false).length;
  if (favorableEntries > unfavorableEntries) signals.push('timing_tailwind');
  if (unfavorableEntries > favorableEntries) signals.push('timing_headwind');
  return signals;
}

function buildResearch() {
  const clvPrep = readJson(CLV_PREP_PATH);
  const temporal = readJson(TEMPORAL_STATE_PATH);
  const edgePersistence = readJson(EDGE_PERSISTENCE_PATH);
  const timeline = readJson(TIMELINE_PATH);

  const temporalMap = new Map((temporal.games || []).map((game) => [game.game_id, game]));
  const persistenceMap = new Map((edgePersistence.records || []).map((row) => [`${row.game_id}:${row.side}`, row]));
  const prepMap = new Map((clvPrep.records || []).map((row) => [`${row.game_id}:${row.side}`, row]));

  const researchRecords = [];
  const validationRecords = [];
  const halfLives = [];
  const persistenceScores = [];
  const stabilizationWindows = [];
  const lineupReactionWindows = [];
  const lateMoveWindows = [];
  const clusteringScores = [];

  for (const game of timeline.games || []) {
    const temporalGame = temporalMap.get(game.game_id) || null;
    for (const side of ['away', 'home']) {
      const key = `${game.game_id}:${side}`;
      const record = prepMap.get(key);
      const persistence = persistenceMap.get(key);
      if (!record || !persistence) continue;

      const points = game.snapshots.map((snapshot) => snapshot[side]).filter(Boolean);
      const closePoint = lastMatching(points, (point) => point.auto_label === 'close') || points[points.length - 1] || null;
      const pregamePoint = lastMatching(points, (point) => ['60m_pregame', '15m_pregame', 'close'].includes(point.auto_label)) || null;
      const earlyPoint = firstMatching(points, (point) => ['06:00_open', '08:00_early', '10:00_market', '13:00_lineup_watch'].includes(point.auto_label)) || points[0] || null;
      const lineupPoint = firstMatching(points, (point, index) => {
        const idx = points.indexOf(point);
        if (!idx) return false;
        return point.lineup_status !== points[idx - 1].lineup_status;
      });

      const comparisons = points.map((point) => {
        const closeDeltaImplied = closePoint?.current_implied_probability !== null && closePoint?.current_implied_probability !== undefined
          && point.current_implied_probability !== null && point.current_implied_probability !== undefined
          ? round(closePoint.current_implied_probability - point.current_implied_probability, 4)
          : null;
        const favorableToClose = (persistence.first_edge ?? 0) > EDGE_THRESHOLD
          ? closeDeltaImplied !== null
            ? closeDeltaImplied > 0
              ? true
              : closeDeltaImplied < 0
                ? false
                : null
            : null
          : null;
        return {
          snapshot_label: point.auto_label,
          source_label: point.source_label,
          timestamp: point.timestamp,
          minutes_to_first_pitch: minutesToStart(point.timestamp, game.scheduled_start_utc),
          snapshot_american: point.current_american,
          snapshot_implied_probability: point.current_implied_probability,
          close_proxy_american: closePoint?.current_american ?? null,
          close_proxy_implied_probability: closePoint?.current_implied_probability ?? null,
          implied_delta_to_close: closeDeltaImplied,
          volatility_score: point.volatility_score,
          market_disagreement_score: point.market_disagreement_score,
          favorable_to_close: favorableToClose,
        };
      });

      const timingQualitySignal = average(comparisons
        .filter((row) => row.favorable_to_close !== null)
        .map((row) => row.favorable_to_close ? 1 : 0));

      const validationBucket = classifyValidation(persistence, temporalGame?.market_state || null);
      const signals = buildValidationSignals(persistence, temporalGame?.market_state || null, comparisons);

      researchRecords.push({
        game_id: game.game_id,
        matchup: `${game.matchup.away.team} @ ${game.matchup.home.team}`,
        side,
        team: game.matchup[side].team,
        team_abbreviation: game.matchup[side].abbreviation,
        scheduled_start_utc: game.scheduled_start_utc,
        validation_bucket: validationBucket,
        close_proxy_available: !!closePoint,
        pregame_available: !!pregamePoint,
        early_entry_label: labelTimingBucket(earlyPoint),
        pregame_entry_label: labelTimingBucket(pregamePoint),
        close_label: labelTimingBucket(closePoint),
        early_to_close_delta_implied: earlyPoint && closePoint && earlyPoint.current_implied_probability !== null && closePoint.current_implied_probability !== null
          ? round(closePoint.current_implied_probability - earlyPoint.current_implied_probability, 4)
          : null,
        pregame_to_close_delta_implied: pregamePoint && closePoint && pregamePoint.current_implied_probability !== null && closePoint.current_implied_probability !== null
          ? round(closePoint.current_implied_probability - pregamePoint.current_implied_probability, 4)
          : null,
        first_edge: persistence.first_edge,
        latest_edge: persistence.latest_edge,
        edge_persistence_score: persistence.edge_persistence_score,
        edge_decay_rate: persistence.edge_decay_rate,
        edge_half_life_hours: persistence.edge_half_life_hours,
        edge_stability_score: persistence.edge_stability_score,
        timing_quality_signal: timingQualitySignal !== null ? round(timingQualitySignal * 100, 2) : null,
        market_state_flags: temporalGame?.market_state?.state_flags || [],
        comparisons,
        signals,
      });

      validationRecords.push({
        game_id: game.game_id,
        matchup: `${game.matchup.away.team} @ ${game.matchup.home.team}`,
        side,
        team: game.matchup[side].team,
        team_abbreviation: game.matchup[side].abbreviation,
        validation_bucket: validationBucket,
        first_edge: persistence.first_edge,
        latest_edge: persistence.latest_edge,
        edge_persistence_score: persistence.edge_persistence_score,
        edge_decay_rate: persistence.edge_decay_rate,
        edge_half_life_hours: persistence.edge_half_life_hours,
        average_volatility_score: persistence.average_volatility_score,
        average_disagreement_score: persistence.average_disagreement_score,
        timing_quality_signal: timingQualitySignal !== null ? round(timingQualitySignal * 100, 2) : null,
        early_to_close_delta_implied: researchRecords[researchRecords.length - 1].early_to_close_delta_implied,
        pregame_to_close_delta_implied: researchRecords[researchRecords.length - 1].pregame_to_close_delta_implied,
        market_state_flags: temporalGame?.market_state?.state_flags || [],
        signals,
      });

      if (persistence.edge_half_life_hours !== null) halfLives.push(persistence.edge_half_life_hours);
      if (persistence.edge_persistence_score !== null) persistenceScores.push(persistence.edge_persistence_score);

      const stabilizationPoint = firstMatching(points, (point) => (point.volatility_score ?? 100) <= 25);
      if (stabilizationPoint) stabilizationWindows.push(minutesToStart(stabilizationPoint.timestamp, game.scheduled_start_utc));
      if (lineupPoint) lineupReactionWindows.push(minutesToStart(lineupPoint.timestamp, game.scheduled_start_utc));

      if (points.length >= 2) {
        const last = points[points.length - 1];
        const prev = points[points.length - 2];
        if (last.current_implied_probability !== null && prev.current_implied_probability !== null) {
          lateMoveWindows.push(Math.abs(last.current_implied_probability - prev.current_implied_probability));
        }
      }

      clusteringScores.push(stdDev(points.map((point) => point.volatility_score)));
    }
  }

  const summary = {
    average_edge_half_life_hours: average(halfLives, 3),
    average_edge_persistence_score: average(persistenceScores, 2),
    market_stabilization_timing_minutes_to_first_pitch: average(stabilizationWindows, 2),
    lineup_reaction_timing_minutes_to_first_pitch: average(lineupReactionWindows, 2),
    volatility_clustering_score: average(clusteringScores, 3),
    late_movement_behavior_avg_implied_shift: average(lateMoveWindows, 4),
    validation_bucket_counts: validationRecords.reduce((acc, row) => {
      acc[row.validation_bucket] = (acc[row.validation_bucket] || 0) + 1;
      return acc;
    }, {}),
  };

  return { researchRecords, validationRecords, summary };
}

function buildTimingReport(research) {
  const strongestTiming = [...research.researchRecords]
    .filter((row) => row.timing_quality_signal !== null)
    .sort((a, b) => (b.timing_quality_signal || 0) - (a.timing_quality_signal || 0))
    .slice(0, 8);
  const weakestTiming = [...research.researchRecords]
    .filter((row) => row.timing_quality_signal !== null)
    .sort((a, b) => (a.timing_quality_signal || 0) - (b.timing_quality_signal || 0))
    .slice(0, 8);

  const lines = [
    '# MLB Timing Quality Report',
    '',
    `Date: ${DATE}`,
    `Average edge persistence: ${formatNum(research.summary.average_edge_persistence_score, 1)}`,
    `Average edge half-life (hrs): ${formatNum(research.summary.average_edge_half_life_hours, 2)}`,
    '',
    '## Best Timing Windows',
    '',
  ];

  const section = (rows, formatter) => {
    if (!rows.length) {
      lines.push('No qualifying rows.');
      lines.push('');
      return;
    }
    rows.forEach((row) => lines.push(`- ${formatter(row)}`));
    lines.push('');
  };

  section(strongestTiming, (row) => `${row.team} in ${row.matchup}: timing ${formatNum(row.timing_quality_signal, 1)}, early->close ${formatNum((row.early_to_close_delta_implied || 0) * 100, 2)} pts, bucket ${row.validation_bucket}`);

  lines.push('## Weakest Timing Windows');
  lines.push('');
  section(weakestTiming, (row) => `${row.team} in ${row.matchup}: timing ${formatNum(row.timing_quality_signal, 1)}, pregame->close ${formatNum((row.pregame_to_close_delta_implied || 0) * 100, 2)} pts, flags ${row.market_state_flags.join(', ') || 'none'}`);

  lines.push('## Research Notes');
  lines.push('');
  lines.push(`- Market stabilization timing to first pitch: ${formatNum(research.summary.market_stabilization_timing_minutes_to_first_pitch, 1)} minutes.`);
  lines.push(`- Average late implied shift: ${formatNum((research.summary.late_movement_behavior_avg_implied_shift || 0) * 100, 2)} percentage points.`);
  lines.push(`- Volatility clustering score: ${formatNum(research.summary.volatility_clustering_score, 3)}.`);

  return lines.join('\n');
}

function buildPersistenceReport(research) {
  const survivors = research.validationRecords.filter((row) => row.validation_bucket === 'survived' || row.validation_bucket === 'informative').slice(0, 8);
  const collapses = research.validationRecords.filter((row) => row.validation_bucket === 'collapsed').slice(0, 8);
  const noise = research.validationRecords.filter((row) => row.validation_bucket === 'noise_prone').slice(0, 8);

  const lines = [
    '# MLB Persistence Validation Report',
    '',
    `Date: ${DATE}`,
    '',
    '## Highest Persistent Edges',
    '',
  ];

  const section = (rows, formatter) => {
    if (!rows.length) {
      lines.push('No qualifying rows.');
      lines.push('');
      return;
    }
    rows.forEach((row) => lines.push(`- ${formatter(row)}`));
    lines.push('');
  };

  section(survivors, (row) => `${row.team} in ${row.matchup}: persistence ${formatNum(row.edge_persistence_score, 1)}, latest edge ${formatNum((row.latest_edge || 0) * 100, 2)} pts, signals ${row.signals.join(', ') || 'none'}`);

  lines.push('## Largest Edge Collapse');
  lines.push('');
  section(collapses, (row) => `${row.team} in ${row.matchup}: first ${formatNum((row.first_edge || 0) * 100, 2)} pts, latest ${formatNum((row.latest_edge || 0) * 100, 2)} pts, decay ${formatNum((row.edge_decay_rate || 0) * 100, 3)} pts/hr`);

  lines.push('## Noise-Prone Signals');
  lines.push('');
  section(noise, (row) => `${row.team} in ${row.matchup}: volatility ${formatNum(row.average_volatility_score, 1)}, disagreement ${formatNum(row.average_disagreement_score, 3)}, signals ${row.signals.join(', ') || 'none'}`);

  return lines.join('\n');
}

function main() {
  const research = buildResearch();

  const clvPayload = {
    meta: {
      date: DATE,
      generated_at: new Date().toISOString(),
      engine: 'clv_research_v1',
      notes: 'Research layer for timing quality, close proxy comparison, edge persistence, and edge decay.',
    },
    summary: research.summary,
    records: research.researchRecords,
    database_preparation: {
      sqlite_tables: {
        clv_research: ['date', 'game_id', 'side', 'snapshot_label', 'minutes_to_first_pitch', 'snapshot_implied_probability', 'close_proxy_implied_probability', 'implied_delta_to_close'],
        edge_validation: ['date', 'game_id', 'side', 'validation_bucket', 'first_edge', 'latest_edge', 'edge_persistence_score', 'edge_decay_rate', 'timing_quality_signal'],
      },
      postgres_indexes: ['(date, game_id, side)', '(date, validation_bucket)', '(game_id, side, snapshot_label)'],
    },
  };

  const edgeValidation = {
    meta: {
      date: DATE,
      generated_at: new Date().toISOString(),
      threshold: EDGE_THRESHOLD,
    },
    summary: research.summary,
    records: research.validationRecords,
  };

  writeJson(CLV_RESEARCH_PATH, clvPayload);
  writeJson(EDGE_VALIDATION_PATH, edgeValidation);
  writeText(TIMING_REPORT_PATH, buildTimingReport(research));
  writeText(PERSISTENCE_REPORT_PATH, buildPersistenceReport(research));

  console.log(JSON.stringify({
    outputs: [
      path.relative(process.cwd(), CLV_RESEARCH_PATH),
      path.relative(process.cwd(), EDGE_VALIDATION_PATH),
      path.relative(process.cwd(), TIMING_REPORT_PATH),
      path.relative(process.cwd(), PERSISTENCE_REPORT_PATH),
    ],
    records: research.researchRecords.length,
  }, null, 2));
}

main();
