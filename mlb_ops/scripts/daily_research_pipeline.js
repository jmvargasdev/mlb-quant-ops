const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getOperationalDate } = require('./lib/operational-date');
const { chat, isAvailable, MODELS } = require('../../config/ollama');

const OPS_ROOT = path.resolve(__dirname, '..');
const PROCESSED_DIR = path.join(OPS_ROOT, 'processed');
const REPORTS_DIR = path.join(OPS_ROOT, 'reports');
const HISTORY_DIR = path.join(OPS_ROOT, 'historical', 'research');

const DATE = process.env.MLB_DATE || getOperationalDate();
const REPLAY_DATA_PATH = path.join(PROCESSED_DIR, 'replay_data', `${DATE}_replay_data.json`);
const TIMELINE_PATH = path.join(PROCESSED_DIR, 'market_timeline.json');
const TEMPORAL_PATH = path.join(PROCESSED_DIR, 'temporal_market_state.json');
const EDGE_PERSISTENCE_PATH = path.join(PROCESSED_DIR, 'edge_persistence.json');
const CLV_PREP_PATH = path.join(PROCESSED_DIR, 'clv_preparation.json');
const CLV_RESEARCH_PATH = path.join(PROCESSED_DIR, 'clv_research.json');
const EDGE_VALIDATION_PATH = path.join(PROCESSED_DIR, 'edge_validation.json');
const PERSISTENCE_RESEARCH_PATH = path.join(PROCESSED_DIR, 'persistence_research.json');
const TIMING_RESEARCH_PATH = path.join(PROCESSED_DIR, 'timing_quality_research.json');
const RESEARCH_REPORT_PATH = path.join(REPORTS_DIR, 'daily_research_report.md');
const HISTORY_INDEX_PATH = path.join(HISTORY_DIR, 'history.jsonl');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? readJson(filePath) : null;
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value);
}

function appendLine(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${value}\n`);
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

function percentile(values, pct) {
  const usable = values.filter((value) => value !== null && value !== undefined && Number.isFinite(value)).sort((a, b) => a - b);
  if (!usable.length) return null;
  const index = Math.min(usable.length - 1, Math.max(0, Math.round((pct / 100) * (usable.length - 1))));
  return usable[index];
}

function buildPersistenceResearch(edgePersistence, temporal, clvPrep) {
  const records = edgePersistence?.records || [];
  const byWindow = records.reduce((acc, row) => {
    const key = row.entry_bucket || 'unknown';
    acc[key] = acc[key] || [];
    acc[key].push(row);
    return acc;
  }, {});
  const byRegime = records.reduce((acc, row) => {
    const key = row.market_state?.volatility_regime || 'unknown';
    acc[key] = acc[key] || [];
    acc[key].push(row);
    return acc;
  }, {});
  const byState = records.reduce((acc, row) => {
    const stateFlags = row.market_state_flags || [];
    const key = stateFlags.includes('stable_market') ? 'stable_market'
      : stateFlags.includes('unstable_market') ? 'unstable_market'
        : stateFlags.includes('late_sharp_movement') ? 'late_sharp_movement'
          : 'mixed';
    acc[key] = acc[key] || [];
    acc[key].push(row);
    return acc;
  }, {});

  const survivalRate = records.length
    ? round(records.filter((row) => (row.latest_edge ?? 0) > 0 && (row.first_edge ?? 0) > 0).length / records.length, 4)
    : null;
  const collapseRate = records.length
    ? round(records.filter((row) => (row.first_edge ?? 0) > 0 && (row.latest_edge ?? 0) <= 0).length / records.length, 4)
    : null;
  const strengtheningRate = records.length
    ? round(records.filter((row) => (row.latest_edge ?? 0) - (row.first_edge ?? 0) >= 0.015).length / records.length, 4)
    : null;
  const decayRate = records.length
    ? round(records.filter((row) => (row.edge_decay_rate ?? 0) < 0).length / records.length, 4)
    : null;

  const summary = {
    edge_survival_rate: survivalRate,
    edge_collapse_rate: collapseRate,
    strengthening_frequency: strengtheningRate,
    decay_frequency: decayRate,
    average_edge_persistence_score: average(records.map((row) => row.edge_persistence_score), 2),
    average_edge_half_life_hours: average(records.map((row) => row.edge_half_life_hours), 3),
    persistence_by_schedule_window: Object.fromEntries(Object.entries(byWindow).map(([key, rows]) => [key, {
      count: rows.length,
      average_persistence: average(rows.map((row) => row.edge_persistence_score), 2),
      survival_rate: rows.length ? round(rows.filter((row) => (row.latest_edge ?? 0) > 0 && (row.first_edge ?? 0) > 0).length / rows.length, 4) : null,
    }])),
    persistence_by_volatility_regime: Object.fromEntries(Object.entries(byRegime).map(([key, rows]) => [key, {
      count: rows.length,
      average_persistence: average(rows.map((row) => row.edge_persistence_score), 2),
    }])),
    persistence_by_market_state: Object.fromEntries(Object.entries(byState).map(([key, rows]) => [key, {
      count: rows.length,
      average_persistence: average(rows.map((row) => row.edge_persistence_score), 2),
    }])),
    market_state_snapshot: temporal?.meta?.date || null,
    clv_preparation_snapshot: clvPrep?.meta?.date || null,
  };

  return {
    meta: {
      date: DATE,
      generated_at: new Date().toISOString(),
      engine: 'persistence_research_v1',
    },
    summary,
    records,
  };
}

function buildTimingResearch(timeline, clvPrep, replay) {
  const timingRows = [];
  const closeComparisons = [];
  const windows = new Set([
    '06:00_open',
    '08:00_early',
    '10:00_market',
    '13:00_lineup_watch',
    'lineup_confirm',
    '60m_pregame',
    '15m_pregame',
    'close',
  ]);

  for (const game of timeline?.games || []) {
    for (const side of ['away', 'home']) {
      const points = game.snapshots.map((snapshot) => snapshot[side]).filter(Boolean);
      if (!points.length) continue;
      const closePoint = [...points].reverse().find((point) => point.auto_label === 'close') || points[points.length - 1];
      const comparisons = points.map((point) => {
        const deltaClose = point.current_implied_probability !== null && closePoint?.current_implied_probability !== null
          ? round(closePoint.current_implied_probability - point.current_implied_probability, 4)
          : null;
        return {
          game_id: game.game_id,
          side,
          team: game.matchup[side].team,
          snapshot_label: point.auto_label,
          timestamp: point.timestamp,
          minutes_to_first_pitch: point.minutes_to_first_pitch ?? null,
          edge_vs_market: point.edge_vs_market,
          close_delta_implied: deltaClose,
          snapshot_implied_probability: point.current_implied_probability,
          close_implied_probability: closePoint?.current_implied_probability ?? null,
          favorable_to_close: deltaClose !== null ? deltaClose > 0 : null,
        };
      });

      const bestWindow = comparisons
        .filter((row) => row.favorable_to_close !== null)
        .sort((a, b) => Math.abs(b.close_delta_implied || 0) - Math.abs(a.close_delta_implied || 0))[0] || null;

      timingRows.push({
        game_id: game.game_id,
        matchup: `${game.matchup.away.team} @ ${game.matchup.home.team}`,
        side,
        team: game.matchup[side].team,
        close_available: !!closePoint,
        close_delta_implied: closePoint?.current_implied_probability ?? null,
        best_window: bestWindow?.snapshot_label || null,
        best_window_minutes_to_first_pitch: bestWindow?.minutes_to_first_pitch ?? null,
        best_window_delta_to_close: bestWindow?.close_delta_implied ?? null,
        timing_quality_score: average(comparisons.filter((row) => row.favorable_to_close !== null).map((row) => row.favorable_to_close ? 100 : 0), 2),
        edge_durability_score: clvPrep?.records?.find((row) => row.game_id === game.game_id && row.side === side)?.edge_persistence_score ?? null,
      });

      closeComparisons.push(...comparisons.filter((row) => windows.has(row.snapshot_label)));
    }
  }

  const summary = {
    best_window_by_average_timing: (() => {
      const buckets = {};
      for (const row of timingRows) {
        if (!row.best_window) continue;
        buckets[row.best_window] = buckets[row.best_window] || [];
        buckets[row.best_window].push(row.timing_quality_score);
      }
      const ranked = Object.entries(buckets).map(([window, scores]) => ({
        window,
        average_timing_quality: average(scores, 2),
        count: scores.length,
      })).sort((a, b) => (b.average_timing_quality || 0) - (a.average_timing_quality || 0));
      return ranked;
    })(),
    average_timing_quality_score: average(timingRows.map((row) => row.timing_quality_score), 2),
    average_best_window_minutes_to_first_pitch: average(timingRows.map((row) => row.best_window_minutes_to_first_pitch), 2),
    close_delta_distribution: {
      p25: percentile(closeComparisons.map((row) => row.close_delta_implied), 25),
      p50: percentile(closeComparisons.map((row) => row.close_delta_implied), 50),
      p75: percentile(closeComparisons.map((row) => row.close_delta_implied), 75),
    },
    timing_window_count: windows.size,
    replay_snapshot_count: replay?.games?.reduce((sum, game) => sum + (game.snapshot_count || 0), 0) || null,
  };

  return {
    meta: {
      date: DATE,
      generated_at: new Date().toISOString(),
      engine: 'timing_quality_research_v1',
    },
    summary,
    records: timingRows,
  };
}

function buildMarketMemory(timeline, temporal) {
  const volatilityRecords = [];
  const disagreementRecords = [];
  const correctionRecords = [];
  const movementRecords = [];

  for (const game of timeline?.games || []) {
    for (const snapshot of game.snapshots || []) {
      volatilityRecords.push({
        game_id: game.game_id,
        matchup: `${game.matchup.away.team} @ ${game.matchup.home.team}`,
        timestamp: snapshot.timestamp,
        auto_label: snapshot.auto_label,
        volatility_score: snapshot.market_state?.average_volatility_score ?? null,
        regime: snapshot.market_state?.volatility_regime ?? null,
      });
      disagreementRecords.push({
        game_id: game.game_id,
        matchup: `${game.matchup.away.team} @ ${game.matchup.home.team}`,
        timestamp: snapshot.timestamp,
        auto_label: snapshot.auto_label,
        disagreement: snapshot.market_disagreement_score ?? null,
      });
      movementRecords.push({
        game_id: game.game_id,
        matchup: `${game.matchup.away.team} @ ${game.matchup.home.team}`,
        timestamp: snapshot.timestamp,
        auto_label: snapshot.auto_label,
        line_acceleration: snapshot.away?.line_acceleration ?? snapshot.home?.line_acceleration ?? null,
        line_velocity: snapshot.away?.line_velocity ?? snapshot.home?.line_velocity ?? null,
        market_pressure: snapshot.market_pressure_score ?? null,
      });
    }
  }

  const correctionBehavior = (temporal?.games || []).map((game) => ({
    game_id: game.game_id,
    matchup: `${game.matchup.away.team} @ ${game.matchup.home.team}`,
    market_state_transition: game.market_state?.market_state_transition || null,
    volatility_regime: game.market_state?.volatility_regime || null,
    sharp_timing: (game.market_state?.state_flags || []).includes('late_sharp_movement'),
    absorbed: (game.market_state?.state_flags || []).includes('volatility_compression'),
    corrected: (game.market_state?.state_flags || []).includes('disagreement_resolution'),
  }));

  const summary = {
    volatility_regimes: volatilityRecords.reduce((acc, row) => {
      const key = row.regime || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    disagreement_regimes: disagreementRecords.reduce((acc, row) => {
      const band = row.disagreement === null ? 'missing'
        : row.disagreement >= 0.18 ? 'high'
          : row.disagreement >= 0.08 ? 'medium'
            : 'low';
      acc[band] = (acc[band] || 0) + 1;
      return acc;
    }, {}),
    stable_markets: correctionBehavior.filter((row) => row.absorbed || row.corrected).length,
    unstable_markets: correctionBehavior.filter((row) => row.sharp_timing).length,
    sharp_movement_timing_count: correctionBehavior.filter((row) => row.sharp_timing).length,
    late_movement_behavior_count: movementRecords.filter((row) => Math.abs(row.line_velocity || 0) > 0.01).length,
    line_acceleration_mean: average(movementRecords.map((row) => row.line_acceleration), 4),
    market_pressure_mean: average(movementRecords.map((row) => row.market_pressure), 4),
  };

  return {
    meta: {
      date: DATE,
      generated_at: new Date().toISOString(),
      engine: 'market_memory_v1',
    },
    summary,
    volatility_history: volatilityRecords,
    disagreement_history: disagreementRecords,
    line_movement_history: movementRecords,
    market_correction_history: correctionBehavior,
  };
}

function buildReport(persistence, timing, clv, memory, validation) {
  const lines = [
    '# Daily Quant Research Report',
    '',
    `Date: ${DATE}`,
    '',
    '## Strongest Persistent Edges',
    '',
  ];

  const persistentEdges = (persistence.records || [])
    .filter((row) => (row.latest_edge ?? 0) > 0 && (row.edge_persistence_score ?? 0) >= 65)
    .sort((a, b) => (b.edge_persistence_score || 0) - (a.edge_persistence_score || 0))
    .slice(0, 8);
  const collapsedEdges = (validation.records || [])
    .filter((row) => row.validation_bucket === 'collapsed')
    .slice(0, 8);
  const bestTiming = (timing.records || [])
    .filter((row) => row.best_window)
    .sort((a, b) => (b.timing_quality_score || 0) - (a.timing_quality_score || 0))
    .slice(0, 8);
  const stableMarkets = (memory.market_correction_history || [])
    .filter((row) => row.absorbed || row.corrected)
    .slice(0, 8);
  const volatilityRegimes = Object.entries(memory.summary.volatility_regimes || {}).sort((a, b) => b[1] - a[1]);
  const sharpActivity = (memory.market_correction_history || [])
    .filter((row) => row.sharp_timing)
    .slice(0, 8);

  const section = (rows, formatter) => {
    if (!rows.length) {
      lines.push('No qualifying rows.');
      lines.push('');
      return;
    }
    rows.forEach((row) => lines.push(`- ${formatter(row)}`));
    lines.push('');
  };

  section(persistentEdges, (row) => `${row.team} in ${row.matchup}: persistence ${round(row.edge_persistence_score, 1)}, latest edge ${(round((row.latest_edge || 0) * 100, 2) || 0)} pts, half-life ${round(row.edge_half_life_hours, 2)} hrs`);

  lines.push('## Largest Edge Collapse');
  lines.push('');
  section(collapsedEdges, (row) => `${row.team} in ${row.matchup}: first ${(round((row.first_edge || 0) * 100, 2) || 0)} pts, latest ${(round((row.latest_edge || 0) * 100, 2) || 0)} pts, decay ${round(row.edge_decay_rate * 100, 3)} pts/hr`);

  lines.push('## Best Timing Windows');
  lines.push('');
  section(bestTiming, (row) => `${row.team} in ${row.matchup}: best ${row.best_window}, timing ${round(row.timing_quality_score, 1)}, edge durability ${round(row.edge_durability_score, 1)}`);

  lines.push('## Most Stable Market Structures');
  lines.push('');
  section(stableMarkets, (row) => `${row.matchup}: transition ${row.market_state_transition}, absorbed ${row.absorbed}, corrected ${row.corrected}`);

  lines.push('## Volatility Regimes');
  lines.push('');
  if (!volatilityRegimes.length) {
    lines.push('No volatility regimes available.');
    lines.push('');
  } else {
    volatilityRegimes.forEach(([regime, count]) => lines.push(`- ${regime}: ${count}`));
    lines.push('');
  }

  lines.push('## Potential Sharp Activity');
  lines.push('');
  section(sharpActivity, (row) => `${row.matchup}: sharp timing ${row.sharp_timing}, regime ${row.volatility_regime}`);

  lines.push('## Market Correction Behavior');
  lines.push('');
  lines.push(`- Average line acceleration: ${round(memory.summary.line_acceleration_mean, 4)}`);
  lines.push(`- Average market pressure: ${round(memory.summary.market_pressure_mean, 4)}`);
  lines.push(`- Stable markets observed: ${memory.summary.stable_markets}`);
  lines.push(`- Unstable markets observed: ${memory.summary.unstable_markets}`);
  lines.push('');

  lines.push('## CLV Preparation Insights');
  lines.push('');
  lines.push(`- Average edge persistence: ${round(clv.summary?.average_edge_persistence_score, 2)}`);
  lines.push(`- Average edge half-life (hrs): ${round(clv.summary?.average_edge_half_life_hours, 3)}`);
  lines.push(`- Snapshot-vs-close windows: ${timing.summary?.timing_window_count || 0}`);
  lines.push(`- Timing quality score: ${round(timing.summary?.average_timing_quality_score, 2)}`);
  lines.push('');

  lines.push('## Research Notes');
  lines.push('');
  lines.push('- This layer is observational. It does not estimate true probabilities or ROI.');
  lines.push('- Signal classification remains calibration-first and persistence-aware.');
  lines.push('- Historical memory is append-only by date and should be used for backtesting, not execution.');

  return lines.join('\n');
}

async function enrichReportWithNarrative(researchBundle, reportText) {
  if (!(await isAvailable())) return reportText;

  const stats = {
    edge_survival_rate: researchBundle.persistence_research?.edge_survival_rate,
    edge_collapse_rate: researchBundle.persistence_research?.edge_collapse_rate,
    avg_persistence_score: researchBundle.persistence_research?.average_edge_persistence_score,
    avg_half_life_hours: researchBundle.persistence_research?.average_edge_half_life_hours,
    best_timing_windows: researchBundle.timing_research?.best_window_by_average_timing?.slice(0, 3),
    avg_timing_quality: researchBundle.timing_research?.average_timing_quality_score,
    volatility_regimes: researchBundle.market_memory?.volatility_regimes,
    stable_markets: researchBundle.market_memory?.stable_markets,
    unstable_markets: researchBundle.market_memory?.unstable_markets,
    sharp_movement_count: researchBundle.market_memory?.sharp_movement_timing_count,
  };

  const systemPrompt = `You are a quantitative research analyst for MLB game-day markets.
Write a 3-4 sentence research narrative interpreting the following summary statistics.
Identify the dominant market pattern, note any significant edge persistence or timing signal, and state what this implies for today's deployment decision.
Respond with the narrative only — no headers, no lists, no markdown formatting.`;

  const raw = await chat(MODELS.reason, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: JSON.stringify(stats, null, 2) },
  ]);

  const narrative = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!narrative) return reportText;
  return `## Research Narrative\n\n${narrative}\n\n---\n\n${reportText}`;
}

function appendHistoricalMemory(bundle) {
  ensureDir(HISTORY_DIR);
  appendLine(HISTORY_INDEX_PATH, JSON.stringify({
    date: DATE,
    generated_at: new Date().toISOString(),
    persistence_file: path.relative(OPS_ROOT, bundle.persistence_path),
    timing_file: path.relative(OPS_ROOT, bundle.timing_path),
    clv_file: path.relative(OPS_ROOT, bundle.clv_path),
    memory_file: path.relative(OPS_ROOT, bundle.memory_path),
  }));
}

async function main() {
  if (process.env.RUN_REPLAY !== 'false' && !fs.existsSync(REPLAY_DATA_PATH)) {
    execFileSync('node', [path.join(OPS_ROOT, 'scripts', 'replay_engine.js')], {
      cwd: path.resolve(OPS_ROOT, '..'),
      env: {
        ...process.env,
        MLB_DATE: DATE,
      },
      stdio: 'inherit',
    });
  }

  const persistence = readJson(EDGE_PERSISTENCE_PATH);
  const timing = readJsonIfExists(path.join(PROCESSED_DIR, 'timing_quality_research.json')) || null;
  const clv = readJsonIfExists(CLV_RESEARCH_PATH);
  const edgeValidation = readJsonIfExists(EDGE_VALIDATION_PATH);
  const timeline = readJson(TIMELINE_PATH);
  const temporal = readJson(TEMPORAL_PATH);
  const replay = readJson(REPLAY_DATA_PATH);

  const persistenceResearch = buildPersistenceResearch(persistence, temporal, clv);
  const timingResearch = buildTimingResearch(timeline, clv, replay);
  const memory = buildMarketMemory(timeline, temporal);

  const clvEnriched = {
    ...(clv || {}),
    meta: {
      ...(clv?.meta || {}),
      research_layer: 'phase_2_operational_validation',
      generated_at: new Date().toISOString(),
    },
    research: {
      persistence: persistenceResearch.summary,
      timing: timingResearch.summary,
      memory: memory.summary,
    },
  };

  writeJson(PERSISTENCE_RESEARCH_PATH, persistenceResearch);
  writeJson(TIMING_RESEARCH_PATH, timingResearch);
  writeJson(CLV_RESEARCH_PATH, clvEnriched);

  const researchBundle = {
    meta: {
      date: DATE,
      generated_at: new Date().toISOString(),
      engine: 'daily_research_pipeline_v1',
    },
    persistence_research: persistenceResearch.summary,
    timing_research: timingResearch.summary,
    clv_research: clvEnriched.research,
    market_memory: memory.summary,
    validation_buckets: edgeValidation?.summary?.validation_bucket_counts || {},
  };

  const researchHistoryDateDir = path.join(HISTORY_DIR, DATE);
  ensureDir(researchHistoryDateDir);
  const researchPath = path.join(researchHistoryDateDir, 'research_bundle.json');
  writeJson(researchPath, researchBundle);
  appendHistoricalMemory({
    persistence_path: PERSISTENCE_RESEARCH_PATH,
    timing_path: TIMING_RESEARCH_PATH,
    clv_path: CLV_RESEARCH_PATH,
    memory_path: researchPath,
  });

  const report = buildReport(persistenceResearch, timingResearch, clvEnriched, memory, edgeValidation || { records: [] });
  const enrichedReport = await enrichReportWithNarrative(researchBundle, report);
  writeText(RESEARCH_REPORT_PATH, enrichedReport);

  console.log(JSON.stringify({
    outputs: [
      path.relative(process.cwd(), PERSISTENCE_RESEARCH_PATH),
      path.relative(process.cwd(), TIMING_RESEARCH_PATH),
      path.relative(process.cwd(), CLV_RESEARCH_PATH),
      path.relative(process.cwd(), researchPath),
      path.relative(process.cwd(), RESEARCH_REPORT_PATH),
      path.relative(process.cwd(), HISTORY_INDEX_PATH),
    ],
    persistence_edge_count: persistenceResearch.records.length,
    timing_edge_count: timingResearch.records.length,
  }, null, 2));
}

main().catch((err) => { console.error(err.message); process.exit(1); });
