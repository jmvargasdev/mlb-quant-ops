const fs = require('fs');
const path = require('path');

const OPS_ROOT = path.resolve(__dirname, '..');
const PROCESSED_DIR = path.join(OPS_ROOT, 'processed');
const REPORTS_DIR = path.join(OPS_ROOT, 'reports');

const DATE = process.env.MLB_DATE || new Date().toISOString().slice(0, 10);

const OPERATIONS_STATUS_PATH = path.join(PROCESSED_DIR, 'daily_operations_status.json');
const CRON_STATUS_PATH = path.join(PROCESSED_DIR, 'cron_status.json');
const CRON_REPORT_PATH = path.join(REPORTS_DIR, 'cron_schedule_report.md');
const CRON_STATUS_REPORT_PATH = path.join(REPORTS_DIR, 'cron_status_report.md');

const SCHEDULE_WINDOWS = [
  '06:00_open',
  '08:00_early',
  '10:00_market',
  '13:00_lineup_watch',
  'lineup_confirm',
  '60m_pregame',
  '15m_pregame',
  'close',
];

const JOB_LIBRARY = [
  {
    name: 'collector',
    script: 'collect_mlb_ops.js',
    cadence: 'daily / on-demand',
    window: '06:00_open',
    purpose: 'Acquire MLB schedule, market, lineup, weather and raw source artifacts.',
  },
  {
    name: 'scoring',
    script: 'scoring_engine.js',
    cadence: 'after collector / on-demand',
    window: '06:00_open',
    purpose: 'Compute quant score, fair lines, edges, confidence and risk flags.',
  },
  {
    name: 'snapshot',
    script: 'intraday_snapshot_engine.js',
    cadence: 'multiple intraday checks',
    window: '08:00_early -> close',
    purpose: 'Persist line movement, volatility, disagreement and market pressure snapshots.',
  },
  {
    name: 'temporal',
    script: 'temporal_density_engine.js',
    cadence: 'multiple intraday checks',
    window: '08:00_early -> close',
    purpose: 'Build edge persistence, market state evolution and CLV foundation.',
  },
  {
    name: 'replay',
    script: 'replay_engine.js',
    cadence: 'multiple intraday checks',
    window: 'lineup_confirm -> close',
    purpose: 'Reconstruct intraday market replay for a focused game.',
  },
  {
    name: 'clv_research',
    script: 'clv_research_engine.js',
    cadence: 'after temporal / replay',
    window: 'lineup_confirm -> close',
    purpose: 'Validate persistence, timing quality and close-proxy structure.',
  },
  {
    name: 'orchestrator',
    script: 'daily_operations_orchestrator.js',
    cadence: 'daily / control plane',
    window: '06:00_open',
    purpose: 'Run the operational pipeline and record stage health.',
  },
];

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

function fmt(value, digits = 1) {
  if (value === null || value === undefined) return 'n/a';
  return Number(value).toFixed(digits);
}

function humanize(value) {
  return String(value || 'unknown').replaceAll('_', ' ');
}

function loadOperationsStatus() {
  if (!fs.existsSync(OPERATIONS_STATUS_PATH)) {
    return null;
  }
  return readJson(OPERATIONS_STATUS_PATH);
}

function classifyJobStatus(job, operationsStatus) {
  if (job.name === 'orchestrator') {
    return operationsStatus ? 'control_plane_observed' : 'unknown';
  }
  if (job.name === 'collector' || job.name === 'snapshot') {
    return operationsStatus?.meta?.ops_mode === 'offline' ? 'skipped_in_offline' : 'scheduled';
  }
  const stage = (operationsStatus?.stage_results || []).find((row) => row.name === job.name);
  if (!stage) return 'unknown';
  if (stage.status === 'ok') return 'healthy';
  if (stage.status === 'skipped') return 'skipped';
  return 'failed';
}

function buildCronRows(operationsStatus) {
  return JOB_LIBRARY.map((job) => {
    const stage = (operationsStatus?.stage_results || []).find((row) => row.name === job.name) || null;
    return {
      name: job.name,
      script: job.script,
      cadence: job.cadence,
      window: job.window,
      purpose: job.purpose,
      status: classifyJobStatus(job, operationsStatus),
      duration_seconds: stage?.duration_seconds ?? null,
      exit_code: stage?.exit_code ?? null,
      reason: stage?.reason ?? null,
      started_at: stage?.started_at ?? null,
      ended_at: stage?.ended_at ?? null,
    };
  });
}

function buildHealthSummary(operationsStatus, rows) {
  const total = rows.length;
  const healthy = rows.filter((row) => row.status === 'healthy').length;
  const skipped = rows.filter((row) => row.status === 'skipped' || row.status === 'skipped_in_offline').length;
  const failed = rows.filter((row) => row.status === 'failed').length;
  const unknown = rows.filter((row) => row.status === 'unknown').length;
  const operationalFlags = operationsStatus?.operational_health?.operational_flags || [];

  return {
    total_jobs: total,
    healthy_jobs: healthy,
    skipped_jobs: skipped,
    failed_jobs: failed,
    unknown_jobs: unknown,
    pipeline_health_score: operationsStatus?.operational_health?.pipeline_health_score ?? null,
    source_reliability_score: operationsStatus?.operational_health?.source_reliability_score ?? null,
    extraction_success_rate: operationsStatus?.operational_health?.extraction_success_rate ?? null,
    schema_consistency_score: operationsStatus?.operational_health?.schema_consistency_score ?? null,
    market_data_quality_score: operationsStatus?.operational_health?.market_data_quality_score ?? null,
    snapshot_density_score: operationsStatus?.operational_health?.snapshot_density_score ?? null,
    operational_flags: operationalFlags,
  };
}

function buildScheduleReport(operationsStatus, rows, summary) {
  const lines = [
    '# MLB Cron Schedule Report',
    '',
    `Date: ${DATE}`,
    `Mode: ${operationsStatus?.meta?.ops_mode || 'unknown'}`,
    `Run label: ${operationsStatus?.meta?.snapshot_label || 'unknown'}`,
    '',
    '## Scheduled Jobs',
    '',
  ];

  for (const row of rows) {
    lines.push(`- ${row.name}: ${row.cadence} | window ${row.window} | status ${row.status}`);
  }

  lines.push('');
  lines.push('## Schedule Windows');
  lines.push('');
  for (const window of SCHEDULE_WINDOWS) {
    lines.push(`- ${window}`);
  }

  lines.push('');
  lines.push('## Job Purpose');
  lines.push('');
  for (const row of rows) {
    lines.push(`- ${row.name}: ${row.purpose}`);
  }

  lines.push('');
  lines.push('## Operational Notes');
  lines.push('');
  lines.push(`- Healthy jobs: ${summary.healthy_jobs}/${summary.total_jobs}`);
  lines.push(`- Failed jobs: ${summary.failed_jobs}`);
  lines.push(`- Skipped jobs: ${summary.skipped_jobs}`);
  lines.push(`- Pipeline health: ${fmt(summary.pipeline_health_score, 1)}`);
  lines.push(`- Snapshot density: ${fmt(summary.snapshot_density_score, 1)}`);

  return lines.join('\n');
}

function buildStatusReport(operationsStatus, rows, summary) {
  const lines = [
    '# MLB Cron Status Report',
    '',
    `Date: ${DATE}`,
    '',
    '## Current Status',
    '',
    `- Pipeline health score: ${fmt(summary.pipeline_health_score, 1)}`,
    `- Source reliability score: ${fmt(summary.source_reliability_score, 1)}`,
    `- Extraction success rate: ${fmt(summary.extraction_success_rate, 1)}%`,
    `- Schema consistency score: ${fmt(summary.schema_consistency_score, 1)}`,
    `- Market data quality score: ${fmt(summary.market_data_quality_score, 1)}`,
    `- Snapshot density score: ${fmt(summary.snapshot_density_score, 1)}`,
    `- Operational flags: ${summary.operational_flags.length ? summary.operational_flags.map(humanize).join(', ') : 'none'}`,
    '',
    '## Job Health',
    '',
  ];

  for (const row of rows) {
    lines.push(`- ${row.name}: ${row.status}${row.duration_seconds !== null ? ` | ${fmt(row.duration_seconds, 3)}s` : ''}${row.reason ? ` | ${row.reason}` : ''}`);
  }

  lines.push('');
  lines.push('## Status Interpretation');
  lines.push('');
  lines.push('- `healthy` means the stage completed successfully in the latest operations run.');
  lines.push('- `skipped` or `skipped_in_offline` means the stage was intentionally bypassed in offline mode.');
  lines.push('- `failed` requires investigation before the next production cycle.');
  lines.push('- `unknown` means the job is in the schedule catalog but absent from the latest status file.');

  return lines.join('\n');
}

function main() {
  const operationsStatus = loadOperationsStatus();
  const rows = buildCronRows(operationsStatus);
  const summary = buildHealthSummary(operationsStatus, rows);

  const payload = {
    meta: {
      date: DATE,
      generated_at: new Date().toISOString(),
      source: operationsStatus ? 'daily_operations_status.json' : 'schedule_catalog',
    },
    schedule_windows: SCHEDULE_WINDOWS,
    jobs: rows,
    summary,
    database_preparation: {
      sqlite_tables: {
        cron_jobs: ['date', 'name', 'script', 'cadence', 'window', 'status', 'duration_seconds', 'exit_code'],
        cron_status: ['date', 'generated_at', 'pipeline_health_score', 'source_reliability_score', 'extraction_success_rate', 'operational_flags_json'],
      },
      postgres_hint: 'Partition cron_jobs by date and index (name, status, window).',
    },
  };

  writeJson(CRON_STATUS_PATH, payload);
  writeText(CRON_REPORT_PATH, buildScheduleReport(operationsStatus, rows, summary));
  writeText(CRON_STATUS_REPORT_PATH, buildStatusReport(operationsStatus, rows, summary));

  console.log(JSON.stringify({
    outputs: [
      path.relative(process.cwd(), CRON_STATUS_PATH),
      path.relative(process.cwd(), CRON_REPORT_PATH),
      path.relative(process.cwd(), CRON_STATUS_REPORT_PATH),
    ],
    summary,
  }, null, 2));
}

main();
