const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OPS_ROOT = path.resolve(__dirname, '..');
const PROCESSED_DIR = path.join(OPS_ROOT, 'processed');
const REPORTS_DIR = path.join(OPS_ROOT, 'reports');

const DATE = process.env.MLB_DATE || new Date().toISOString().slice(0, 10);
const GAME_ID_FILTER = process.env.GAME_ID ? Number(process.env.GAME_ID) : null;

const TIMELINE_PATH = path.join(PROCESSED_DIR, 'market_timeline.json');
const TEMPORAL_STATE_PATH = path.join(PROCESSED_DIR, 'temporal_market_state.json');
const EDGE_PERSISTENCE_PATH = path.join(PROCESSED_DIR, 'edge_persistence.json');
const REPLAY_DATA_DIR = path.join(PROCESSED_DIR, 'replay_data');
const REPLAY_REPORTS_DIR = path.join(REPORTS_DIR, 'replay_reports');
const REPLAY_DATA_PATH = path.join(REPLAY_DATA_DIR, `${DATE}_replay_data.json`);
const REPLAY_REPORT_PATH = path.join(REPORTS_DIR, 'replay_report.md');
const DATED_REPLAY_REPORT_PATH = path.join(REPLAY_REPORTS_DIR, `${DATE}_replay_report.md`);

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

function formatNum(value, digits = 2) {
  if (value === null || value === undefined) return 'n/a';
  return String(round(value, digits));
}

function sideEventFlags(points) {
  const flags = [];
  for (const point of points) {
    for (const flag of point.flags || []) {
      if (!flags.includes(flag)) flags.push(flag);
    }
  }
  return flags;
}

function timelineDelta(points, field) {
  const first = points[0]?.[field];
  const last = points[points.length - 1]?.[field];
  if (first === null || first === undefined || last === null || last === undefined) return null;
  return round(last - first, 4);
}

function buildSideReplay(points, persistence) {
  return {
    first_price: points[0]?.current_american ?? null,
    latest_price: points[points.length - 1]?.current_american ?? null,
    first_edge: points[0]?.edge_vs_market ?? null,
    latest_edge: points[points.length - 1]?.edge_vs_market ?? null,
    price_delta_implied: timelineDelta(points, 'current_implied_probability'),
    edge_delta: timelineDelta(points, 'edge_vs_market'),
    volatility_delta: timelineDelta(points, 'volatility_score'),
    max_volatility: Math.max(...points.map((point) => point.volatility_score || 0), 0),
    flags_seen: sideEventFlags(points),
    persistence,
    snapshots: points.map((point) => ({
      timestamp: point.timestamp,
      source_label: point.source_label,
      auto_label: point.auto_label,
      current_american: point.current_american,
      current_implied_probability: point.current_implied_probability,
      total_current: point.total_current,
      edge_vs_market: point.edge_vs_market,
      fair_win_probability: point.fair_win_probability,
      volatility_score: point.volatility_score,
      market_stability_score: point.market_stability_score,
      line_velocity: point.line_velocity,
      line_acceleration: point.line_acceleration,
      market_pressure: point.market_pressure,
      market_disagreement_score: point.market_disagreement_score,
      lineup_status: point.lineup_status,
      weather: point.weather,
      flags: point.flags,
    })),
  };
}

function buildReplayGames(timeline, temporalState, edgePersistence) {
  const temporalMap = new Map((temporalState.games || []).map((game) => [game.game_id, game]));
  const persistenceMap = new Map((edgePersistence.records || []).map((row) => [`${row.game_id}:${row.side}`, row]));
  const games = [];

  for (const game of timeline.games || []) {
    if (GAME_ID_FILTER && game.game_id !== GAME_ID_FILTER) continue;
    const temporal = temporalMap.get(game.game_id) || null;
    const awayPoints = game.snapshots.map((snapshot) => snapshot.away);
    const homePoints = game.snapshots.map((snapshot) => snapshot.home);
    const awayPersistence = persistenceMap.get(`${game.game_id}:away`) || null;
    const homePersistence = persistenceMap.get(`${game.game_id}:home`) || null;

    games.push({
      game_id: game.game_id,
      matchup: game.matchup,
      scheduled_start_utc: game.scheduled_start_utc,
      snapshot_count: game.snapshots.length,
      market_state: temporal?.market_state || null,
      replay_summary: {
        overall_disagreement_delta: round((game.snapshots[game.snapshots.length - 1]?.market_disagreement_score || 0) - (game.snapshots[0]?.market_disagreement_score || 0), 4),
        labels_seen: game.snapshots.map((snapshot) => snapshot.auto_label),
        source_labels_seen: game.snapshots.map((snapshot) => snapshot.source_label),
      },
      away: buildSideReplay(awayPoints, awayPersistence),
      home: buildSideReplay(homePoints, homePersistence),
    });
  }

  return games;
}

function buildReport(games) {
  const persistent = [];
  const decays = [];
  const volatile = [];

  for (const game of games) {
    for (const side of ['away', 'home']) {
      const sideData = game[side];
      const entry = {
        matchup: `${game.matchup.away.team} @ ${game.matchup.home.team}`,
        team: game.matchup[side].team,
        side,
        persistence_score: sideData.persistence?.edge_persistence_score ?? null,
        latest_edge: sideData.latest_edge,
        edge_decay_rate: sideData.persistence?.edge_decay_rate ?? null,
        max_volatility: sideData.max_volatility,
        flags_seen: sideData.flags_seen,
        state_flags: game.market_state?.state_flags || [],
      };
      if ((entry.persistence_score || 0) >= 65 && (entry.latest_edge || 0) > 0.015) persistent.push(entry);
      if ((entry.edge_decay_rate || 0) < -0.01) decays.push(entry);
      volatile.push(entry);
    }
  }

  volatile.sort((a, b) => (b.max_volatility || 0) - (a.max_volatility || 0));
  persistent.sort((a, b) => (b.persistence_score || 0) - (a.persistence_score || 0));
  decays.sort((a, b) => (a.edge_decay_rate || 0) - (b.edge_decay_rate || 0));

  const lines = [
    '# MLB Replay Report',
    '',
    `Date: ${DATE}`,
    `Games reconstructed: ${games.length}`,
    '',
    '## Strongest Persistent Replays',
    '',
  ];

  const section = (rows, formatter) => {
    if (!rows.length) {
      lines.push('No qualifying entries.');
      lines.push('');
      return;
    }
    rows.forEach((row) => lines.push(`- ${formatter(row)}`));
    lines.push('');
  };

  section(persistent.slice(0, 8), (row) => `${row.team} in ${row.matchup}: persistence ${formatNum(row.persistence_score, 1)}, latest edge ${formatNum((row.latest_edge || 0) * 100, 2)} pts, flags ${row.flags_seen.join(', ') || 'none'}`);

  lines.push('## Fastest Replay Decay');
  lines.push('');
  section(decays.slice(0, 8), (row) => `${row.team} in ${row.matchup}: decay ${formatNum((row.edge_decay_rate || 0) * 100, 3)} pts/hr, state ${row.state_flags.join(', ') || 'none'}`);

  lines.push('## Highest Replay Volatility');
  lines.push('');
  section(volatile.slice(0, 8), (row) => `${row.team} in ${row.matchup}: max volatility ${formatNum(row.max_volatility, 1)}, state ${row.state_flags.join(', ') || 'none'}`);

  lines.push('## Reconstruction Notes');
  lines.push('');
  lines.push('- Replay reconstructs price path, edge path, volatility path, and observed flags from persisted snapshots.');
  lines.push('- Current close is a close proxy until a true near-first-pitch or closing snapshot exists.');
  lines.push('- Replay becomes materially stronger once 4-8 intraday checkpoints exist for the same slate.');

  return lines.join('\n');
}

function main() {
  if (!fs.existsSync(TIMELINE_PATH) || !fs.existsSync(TEMPORAL_STATE_PATH) || !fs.existsSync(EDGE_PERSISTENCE_PATH)) {
    execFileSync('node', [path.join(OPS_ROOT, 'scripts', 'temporal_density_engine.js')], {
      cwd: path.resolve(OPS_ROOT, '..'),
      env: {
        ...process.env,
        MLB_DATE: DATE,
      },
      stdio: 'inherit',
    });
  }

  if (!fs.existsSync(TIMELINE_PATH) || !fs.existsSync(TEMPORAL_STATE_PATH) || !fs.existsSync(EDGE_PERSISTENCE_PATH)) {
    throw new Error('Temporal inputs are still missing after rebuilding dependencies.');
  }

  const timeline = readJson(TIMELINE_PATH);
  const temporalState = readJson(TEMPORAL_STATE_PATH);
  const edgePersistence = readJson(EDGE_PERSISTENCE_PATH);
  const replayGames = buildReplayGames(timeline, temporalState, edgePersistence);

  const payload = {
    meta: {
      date: DATE,
      generated_at: new Date().toISOString(),
      replay_engine: 'v1',
      game_filter: GAME_ID_FILTER,
    },
    games: replayGames,
  };

  const report = buildReport(replayGames);
  writeJson(REPLAY_DATA_PATH, payload);
  writeText(REPLAY_REPORT_PATH, report);
  writeText(DATED_REPLAY_REPORT_PATH, report);

  console.log(JSON.stringify({
    outputs: [
      path.relative(process.cwd(), REPLAY_DATA_PATH),
      path.relative(process.cwd(), REPLAY_REPORT_PATH),
      path.relative(process.cwd(), DATED_REPLAY_REPORT_PATH),
    ],
    games: replayGames.length,
  }, null, 2));
}

main();
