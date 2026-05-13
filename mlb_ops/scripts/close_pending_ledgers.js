const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const OPS_ROOT = path.resolve(__dirname, '..');
const ROOT = path.resolve(OPS_ROOT, '..');
const LEDGER_DIR = path.join(OPS_ROOT, 'historical', 'decision_ledger');
const OUTCOME_DIR = path.join(OPS_ROOT, 'historical', 'outcome_attribution');
const PROCESSED_DIR = path.join(OPS_ROOT, 'processed');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
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

function ledgerDates() {
  if (!fs.existsSync(LEDGER_DIR)) return [];
  return fs.readdirSync(LEDGER_DIR)
    .filter((file) => file.endsWith('.jsonl'))
    .map((file) => file.replace(/\.jsonl$/, ''))
    .sort();
}

function outcomeStatus(date) {
  const rows = readJsonLinesIfExists(path.join(OUTCOME_DIR, `${date}.jsonl`));
  return {
    rows,
    complete: rows.filter((row) => row.attribution_status === 'complete').length,
    pending: rows.filter((row) => row.attribution_status !== 'complete').length,
  };
}

function shouldCloseDate(date) {
  const decisions = readJsonLinesIfExists(path.join(LEDGER_DIR, `${date}.jsonl`));
  if (!decisions.length) return false;
  const status = outcomeStatus(date);
  if (!status.rows.length) return true;
  return status.complete < decisions.length;
}

function runScript(scriptName, date) {
  const startedAt = new Date().toISOString();
  const result = spawnSync('node', [path.join(OPS_ROOT, 'scripts', scriptName)], {
    cwd: ROOT,
    env: {
      ...process.env,
      MLB_DATE: date,
    },
    encoding: 'utf8',
  });
  return {
    script: scriptName,
    date,
    started_at: startedAt,
    ended_at: new Date().toISOString(),
    status: result.status === 0 ? 'ok' : 'failed',
    exit_code: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function main() {
  const dates = ledgerDates().filter(shouldCloseDate);
  const runs = dates.map((date) => runScript('outcome_attribution_engine.js', date));
  const feedbackDate = dates[dates.length - 1] || new Date().toISOString().slice(0, 10);
  const feedback = runScript('policy_feedback_engine.js', feedbackDate);
  const summary = {
    generated_at: new Date().toISOString(),
    framework_reference: ['Event Sourcing projection', 'Temporal history model', 'Human-in-the-loop governance'],
    scanned_ledgers: ledgerDates().length,
    attempted_dates: dates,
    outcome_runs: runs,
    policy_feedback_run: feedback,
    status: runs.some((run) => run.status === 'failed') || feedback.status === 'failed' ? 'degraded' : 'completed',
  };
  const outputPath = path.join(PROCESSED_DIR, 'pending_ledger_closure.json');
  writeJson(outputPath, summary);

  console.log(JSON.stringify({
    status: summary.status,
    output: path.relative(ROOT, outputPath),
    scanned_ledgers: summary.scanned_ledgers,
    attempted_dates: summary.attempted_dates,
    outcome_runs: summary.outcome_runs.map((run) => ({ date: run.date, status: run.status })),
    policy_feedback_status: summary.policy_feedback_run.status,
  }, null, 2));

  if (summary.status === 'degraded') {
    process.exit(1);
  }
}

main();
