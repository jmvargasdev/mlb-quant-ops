const fs = require('fs');
const path = require('path');

const OPS_ROOT = path.resolve(__dirname, '..');
const ROOT = path.resolve(OPS_ROOT, '..');
const RAW_DIR = path.join(OPS_ROOT, 'raw');
const HISTORY_DIR = path.join(OPS_ROOT, 'historical');
const PROCESSED_DIR = path.join(OPS_ROOT, 'processed');
const LEDGER_DIR = path.join(HISTORY_DIR, 'decision_ledger');
const OUTCOME_DIR = path.join(HISTORY_DIR, 'outcome_attribution');

const DATE = process.env.MLB_DATE || new Date().toISOString().slice(0, 10);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeJsonLines(filePath, rows) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

function listSchedulePaths(date) {
  const rawDateDir = path.join(RAW_DIR, date);
  if (!fs.existsSync(rawDateDir)) return [];
  return fs.readdirSync(rawDateDir)
    .map((entry) => path.join(rawDateDir, entry, 'schedule.json'))
    .filter((filePath) => fs.existsSync(filePath))
    .sort();
}

function latestSchedule(date) {
  const paths = listSchedulePaths(date);
  if (!paths.length) return { path: null, games: [] };
  const filePath = paths[paths.length - 1];
  const payload = readJson(filePath);
  return {
    path: filePath,
    games: payload.dates?.flatMap((dateRow) => dateRow.games || []) || [],
  };
}

function parseExposureUnits(exposure) {
  const numeric = Number.parseFloat(exposure);
  return Number.isFinite(numeric) ? numeric : 0;
}

function isFinalStatus(statusCode, detailedState) {
  return ['F', 'O'].includes(statusCode) || ['Final', 'Game Over'].includes(detailedState);
}

function sideResult(game, side) {
  const awayScore = game?.teams?.away?.score;
  const homeScore = game?.teams?.home?.score;
  if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore)) return null;
  if (awayScore === homeScore) return 'push';
  const selectedScore = side === 'away' ? awayScore : homeScore;
  const opponentScore = side === 'away' ? homeScore : awayScore;
  return selectedScore > opponentScore ? 'win' : 'loss';
}

function gameResult(game, side) {
  if (!game) return null;
  const awayScore = game.teams?.away?.score ?? null;
  const homeScore = game.teams?.home?.score ?? null;
  return {
    game_id: game.gamePk,
    status_code: game.status?.statusCode || null,
    detailed_state: game.status?.detailedState || null,
    final: isFinalStatus(game.status?.statusCode, game.status?.detailedState),
    away_team: game.teams?.away?.team?.name || null,
    home_team: game.teams?.home?.team?.name || null,
    away_score: awayScore,
    home_score: homeScore,
    selected_result: sideResult(game, side),
  };
}

function classifyDecisionQuality({ action, selectedResult, exposureUnits }) {
  if (!selectedResult) return 'pending_result';
  if (selectedResult === 'push') return 'neutral_push';

  if (action === 'Pass') {
    return selectedResult === 'loss' ? 'good_pass' : 'missed_winner';
  }

  if (exposureUnits <= 0) {
    return selectedResult === 'loss' ? 'capital_preserved' : 'missed_winner';
  }

  return selectedResult === 'win' ? 'profitable_action' : 'negative_action';
}

function wasActionCorrect({ action, selectedResult, exposureUnits }) {
  if (!selectedResult || selectedResult === 'push') return null;
  if (action === 'Pass' || exposureUnits <= 0) return selectedResult === 'loss';
  return selectedResult === 'win';
}

function profitLossProxy({ selectedResult, exposureUnits }) {
  if (!selectedResult || selectedResult === 'push' || exposureUnits <= 0) return 0;
  return selectedResult === 'win' ? exposureUnits : -exposureUnits;
}

function attributeDecision(decision, result) {
  const exposureUnits = parseExposureUnits(decision.executive_exposure);
  const selectedResult = result?.final ? result.selected_result : null;
  const actionCorrect = wasActionCorrect({
    action: decision.action,
    selectedResult,
    exposureUnits,
  });

  return {
    date: decision.date,
    generated_at: new Date().toISOString(),
    decision_generated_at: decision.generated_at,
    snapshot_label: decision.snapshot_label,
    game_id: decision.game_id,
    team: decision.team,
    side: decision.side,
    action: decision.action,
    signal_classification: decision.signal_classification || null,
    exposure_governance: decision.exposure_governance || null,
    executive_exposure: decision.executive_exposure,
    kelly_exposure: decision.kelly_exposure || null,
    raw_exposure: decision.raw_exposure,
    conviction_tier: decision.conviction_tier,
    fair_probability: decision.fair_probability ?? null,
    market_probability: decision.market_probability ?? null,
    edge_pct_points: decision.edge_pct_points ?? null,
    quant_score: decision.quant_score ?? null,
    timing_quality_score: decision.timing_quality_score ?? null,
    persistence_score: decision.persistence_score ?? null,
    volatility_score: decision.volatility_score ?? null,
    validation_bucket: decision.validation_bucket || null,
    lifecycle: decision.lifecycle || null,
    policy_gates: decision.policy_gates || [],
    result_status: result?.final ? 'final' : result ? 'pending' : 'missing_result',
    game_result: result,
    win_loss: selectedResult,
    profit_loss_proxy: profitLossProxy({ selectedResult, exposureUnits }),
    decision_quality: classifyDecisionQuality({
      action: decision.action,
      selectedResult,
      exposureUnits,
    }),
    was_action_correct: actionCorrect,
    was_sizing_correct: actionCorrect,
    attribution_status: result?.final ? 'complete' : result ? 'pending_result' : 'no_result_found',
    source_signature: decision.source_signature || null,
  };
}

function main() {
  const ledgerPath = path.join(LEDGER_DIR, `${DATE}.jsonl`);
  const decisions = readJsonLinesIfExists(ledgerPath);
  const schedule = latestSchedule(DATE);
  const gameById = new Map(schedule.games.map((game) => [String(game.gamePk), game]));
  const rows = decisions.map((decision) => attributeDecision(
    decision,
    gameResult(gameById.get(String(decision.game_id)), decision.side)
  ));
  const outputPath = path.join(OUTCOME_DIR, `${DATE}.jsonl`);
  const processedPath = path.join(PROCESSED_DIR, 'outcome_attribution.json');
  const summary = {
    date: DATE,
    generated_at: new Date().toISOString(),
    framework_reference: ['Event Sourcing projection', 'ML evaluation / backtesting loop'],
    decision_ledger_path: path.relative(ROOT, ledgerPath),
    latest_schedule_path: schedule.path ? path.relative(ROOT, schedule.path) : null,
    output_path: path.relative(ROOT, outputPath),
    decisions: decisions.length,
    complete: rows.filter((row) => row.attribution_status === 'complete').length,
    pending_result: rows.filter((row) => row.attribution_status === 'pending_result').length,
    no_result_found: rows.filter((row) => row.attribution_status === 'no_result_found').length,
    profit_loss_proxy: rows.reduce((sum, row) => sum + Number(row.profit_loss_proxy || 0), 0),
    rows,
  };

  writeJsonLines(outputPath, rows);
  writeJson(processedPath, summary);

  console.log(JSON.stringify({
    date: DATE,
    output: path.relative(ROOT, outputPath),
    processed: path.relative(ROOT, processedPath),
    decisions: summary.decisions,
    complete: summary.complete,
    pending_result: summary.pending_result,
    no_result_found: summary.no_result_found,
    profit_loss_proxy: summary.profit_loss_proxy,
  }, null, 2));
}

main();
