const fs = require('fs');
const path = require('path');

const OPS_ROOT = path.resolve(__dirname, '..');
const ROOT = path.resolve(OPS_ROOT, '..');
const PROCESSED_DIR = path.join(OPS_ROOT, 'processed');
const HISTORY_DIR = path.join(OPS_ROOT, 'historical');
const REPORTS_DIR = path.join(OPS_ROOT, 'reports');
const OUTCOME_DIR = path.join(HISTORY_DIR, 'outcome_attribution');

const DATE = process.env.MLB_DATE || new Date().toISOString().slice(0, 10);
const PROCESSED_OUTPUT = path.join(PROCESSED_DIR, 'policy_feedback.json');
const REPORT_OUTPUT = path.join(REPORTS_DIR, 'policy_feedback_report.md');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
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

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value, 'utf8');
}

function loadHistoricalRows() {
  if (!fs.existsSync(OUTCOME_DIR)) return [];
  return fs.readdirSync(OUTCOME_DIR)
    .filter((entry) => entry.endsWith('.jsonl'))
    .sort()
    .flatMap((entry) => readJsonLinesIfExists(path.join(OUTCOME_DIR, entry)));
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const groupKey = row[key] || 'unknown';
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(row);
  }
  return groups;
}

function summarizeGroup(rows) {
  const complete = rows.filter((row) => row.attribution_status === 'complete');
  const correct = complete.filter((row) => row.was_action_correct === true).length;
  const incorrect = complete.filter((row) => row.was_action_correct === false).length;
  const profitLossProxy = complete.reduce((sum, row) => sum + Number(row.profit_loss_proxy || 0), 0);
  return {
    decisions: rows.length,
    complete: complete.length,
    pending: rows.filter((row) => row.attribution_status !== 'complete').length,
    correct,
    incorrect,
    accuracy: complete.length ? Number(((correct / complete.length) * 100).toFixed(2)) : null,
    profit_loss_proxy: Number(profitLossProxy.toFixed(2)),
    decision_quality_counts: rows.reduce((acc, row) => {
      const quality = row.decision_quality || 'unknown';
      acc[quality] = (acc[quality] || 0) + 1;
      return acc;
    }, {}),
  };
}

function summarizeBy(rows, key) {
  return [...groupBy(rows, key).entries()]
    .map(([value, groupRows]) => ({
      [key]: value,
      ...summarizeGroup(groupRows),
    }))
    .sort((a, b) => b.decisions - a.decisions);
}

function recommendationFor(summary, label) {
  if (summary.complete < 5) {
    return {
      label,
      status: 'observe',
      rationale: 'Insufficient final outcomes for policy adjustment.',
    };
  }
  if (summary.accuracy !== null && summary.accuracy < 45) {
    return {
      label,
      status: 'candidate_adjustment',
      rationale: 'Completed decisions are underperforming enough to justify threshold review.',
    };
  }
  if (summary.profit_loss_proxy < 0) {
    return {
      label,
      status: 'review',
      rationale: 'Profit/loss proxy is negative; inspect policy gates before changing thresholds.',
    };
  }
  return {
    label,
    status: 'observe',
    rationale: 'No adjustment signal strong enough for policy review.',
  };
}

function buildRecommendations({ byAction, byConvictionTier }) {
  return [
    ...byAction.map((row) => recommendationFor(row, `action:${row.action}`)),
    ...byConvictionTier.map((row) => recommendationFor(row, `conviction_tier:${row.conviction_tier}`)),
  ];
}

function renderTable(rows, columns) {
  const header = `| ${columns.join(' |')} |`;
  const divider = `| ${columns.map(() => '---').join(' |')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => row[column] ?? 'n/a').join(' |')} |`);
  return [header, divider, ...body].join('\n');
}

function buildReport(feedback) {
  const lines = [
    '# Policy Feedback Report',
    '',
    `Date: ${feedback.date}`,
    `Generated: ${feedback.generated_at}`,
    '',
    '## Summary',
    '',
    `- Decisions: ${feedback.summary.decisions}`,
    `- Complete outcomes: ${feedback.summary.complete}`,
    `- Pending outcomes: ${feedback.summary.pending}`,
    `- Profit/loss proxy: ${feedback.summary.profit_loss_proxy}`,
    '',
    '## By Action',
    '',
    renderTable(feedback.by_action, ['action', 'decisions', 'complete', 'pending', 'accuracy', 'profit_loss_proxy']),
    '',
    '## By Conviction Tier',
    '',
    renderTable(feedback.by_conviction_tier, ['conviction_tier', 'decisions', 'complete', 'pending', 'accuracy', 'profit_loss_proxy']),
    '',
    '## Recommendations',
    '',
    renderTable(feedback.recommendations, ['label', 'status', 'rationale']),
    '',
    '## Governance Note',
    '',
    'This report does not auto-adjust thresholds. It identifies candidates for human review before policy changes.',
  ];
  return lines.join('\n');
}

function main() {
  const current = readJsonIfExists(path.join(PROCESSED_DIR, 'outcome_attribution.json'));
  const historicalRows = loadHistoricalRows();
  const currentRows = current?.rows || [];
  const rowsBySignature = new Map();

  for (const row of [...historicalRows, ...currentRows]) {
    const key = `${row.date}:${row.game_id}:${row.side}:${row.source_signature || row.decision_generated_at || 'unknown'}`;
    rowsBySignature.set(key, row);
  }

  const rows = [...rowsBySignature.values()];
  const summary = summarizeGroup(rows);
  const byAction = summarizeBy(rows, 'action');
  const byConvictionTier = summarizeBy(rows, 'conviction_tier');
  const feedback = {
    date: DATE,
    generated_at: new Date().toISOString(),
    framework_reference: ['OPA policy review loop', 'ReAct verify step', 'Human-in-the-loop governance'],
    source_artifacts: {
      processed_outcome_attribution: path.relative(ROOT, path.join(PROCESSED_DIR, 'outcome_attribution.json')),
      historical_outcome_attribution: path.relative(ROOT, OUTCOME_DIR),
    },
    summary,
    by_action: byAction,
    by_conviction_tier: byConvictionTier,
    recommendations: buildRecommendations({
      byAction,
      byConvictionTier,
    }),
  };

  writeJson(PROCESSED_OUTPUT, feedback);
  writeText(REPORT_OUTPUT, buildReport(feedback));

  console.log(JSON.stringify({
    date: DATE,
    processed: path.relative(ROOT, PROCESSED_OUTPUT),
    report: path.relative(ROOT, REPORT_OUTPUT),
    decisions: summary.decisions,
    complete: summary.complete,
    recommendations: feedback.recommendations.length,
  }, null, 2));
}

main();
