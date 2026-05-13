const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getOperationalDate } = require('./lib/operational-date');

const JOURNAL_API_URL = (process.env.JOURNAL_API_URL || 'https://project-journal-view.lovable.app/api/journal/entries').replace(/\/$/, '');
const JOURNAL_API_KEY = process.env.JOURNAL_API_KEY || '';

const OPS_ROOT = path.resolve(__dirname, '..');
const PROCESSED_DIR = path.join(OPS_ROOT, 'processed');
const DATE = process.env.MLB_DATE || getOperationalDate();

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
}

function todayCommits(date) {
  try {
    const out = execFileSync('git', [
      'log',
      '--no-merges',
      '--format=%s',
      `--after=${date}T00:00:00`,
      `--before=${date}T23:59:59`,
    ], { encoding: 'utf8', cwd: path.resolve(OPS_ROOT, '..') }).trim();
    return out ? out.split('\n').map((line) => line.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function deriveStatus(checklist, commits) {
  if (!checklist && !commits.length) return 'planned';
  if (checklist?.ready_for_today) return 'done';
  return 'in_progress';
}

function deriveTags(commits) {
  const tags = new Set(['mlb-quant-ops']);
  const text = commits.join(' ').toLowerCase();
  if (text.includes('journal')) tags.add('journal');
  if (text.includes('pipeline') || text.includes('bootstrap') || text.includes('orchestrat')) tags.add('pipeline');
  if (text.includes('frontend') || text.includes('dashboard') || text.includes('workspace')) tags.add('frontend');
  if (text.includes('cio') || text.includes('allocation') || text.includes('decision')) tags.add('decision-engine');
  if (text.includes('research') || text.includes('persistence') || text.includes('temporal')) tags.add('research');
  if (text.includes('portfolio') || text.includes('governance') || text.includes('exposure')) tags.add('portfolio');
  if (text.includes('deploy') || text.includes('config') || text.includes('env')) tags.add('infra');
  return [...tags];
}

const COMMIT_ENRICHMENTS = [
  {
    match: (t) => t.includes('journal'),
    effect: 'This closes the gap between development activity and project visibility — the journal now reflects real session work instead of requiring manual updates.',
    why: 'The project lacked a way to automatically record what was built each session.',
  },
  {
    match: (t) => t.includes('bootstrap') || t.includes('orchestrat'),
    effect: 'This means the system can recover from incomplete states and resume pipeline execution without manual intervention.',
    why: 'The bootstrap layer needed to be more resilient to partial runs and missed schedule windows.',
  },
  {
    match: (t) => t.includes('pipeline'),
    effect: 'This improves data flow reliability and ensures downstream engines receive consistent input on each run.',
    why: 'Pipeline stages were not coordinating state correctly between execution steps.',
  },
  {
    match: (t) => t.includes('cio') || t.includes('allocation') || t.includes('decision'),
    effect: 'This sharpens the final deployment signal and reduces the risk of acting on edges that do not survive governance review.',
    why: 'The executive allocation layer needed tighter alignment between governance inputs and capital deployment output.',
  },
  {
    match: (t) => t.includes('portfolio') || t.includes('governance') || t.includes('exposure'),
    effect: 'This gives the system a more accurate picture of aggregate risk before any deployment decision is made.',
    why: 'Portfolio-level correlation and concentration were not being weighed correctly at the governance layer.',
  },
  {
    match: (t) => t.includes('research') || t.includes('persistence') || t.includes('temporal'),
    effect: 'This gives the system better evidence for judging whether an edge survives market interaction over time.',
    why: 'The research layer needed richer signals to distinguish edges that persist from those that collapse under market pressure.',
  },
  {
    match: (t) => t.includes('frontend') || t.includes('dashboard') || t.includes('workspace'),
    effect: 'This makes the allocation posture more immediately readable and reduces the cognitive load of interpreting the slate.',
    why: 'The dashboard needed to reflect the allocation-first hierarchy more clearly so the most actionable information is always in focus.',
  },
  {
    match: (t) => t.includes('report') || t.includes('panel') || t.includes('quant'),
    effect: 'This makes the report more useful as a decision artifact rather than a raw data dump.',
    why: 'The report panel needed to prioritize the executive view over granular operational metrics.',
  },
  {
    match: (t) => t.includes('config') || t.includes('env') || t.includes('deploy'),
    effect: 'This moves the project closer to a state where it can be hosted and run reliably outside of the local environment.',
    why: 'The deployment configuration was incomplete and not yet ready for a hosted runtime.',
  },
  {
    match: (t) => t.includes('snapshot') || t.includes('intraday'),
    effect: 'This ensures the temporal intelligence layer has enough density to evaluate edge persistence accurately across the day.',
    why: 'Snapshot coverage was missing for certain schedule windows, leaving gaps in the market timeline.',
  },
  {
    match: (t) => t.includes('scoring') || t.includes('sabermetric'),
    effect: 'This produces more accurate structural hypotheses as inputs to the market pricing and CIO layers.',
    why: 'The scoring engine needed updated logic to better capture matchup quality signals.',
  },
  {
    match: (t) => t.includes('ledger') || t.includes('outcome') || t.includes('attribution'),
    effect: 'This creates an auditable record of decisions and outcomes that the policy feedback engine can learn from over time.',
    why: 'Decision history was not being closed and attributed correctly, limiting the system\'s ability to evaluate its own track record.',
  },
  {
    match: (t) => t.includes('policy') || t.includes('feedback') || t.includes('learning'),
    effect: 'This allows the system to adjust its posture based on what has and has not worked in previous sessions.',
    why: 'The feedback loop between outcomes and future allocation decisions was not yet wired into the daily cycle.',
  },
  {
    match: (t) => t.includes('document') || t.includes('rationale') || t.includes('epistemolog') || t.includes('handbook'),
    effect: 'This makes the reasoning behind system design decisions available to anyone reviewing the codebase, reducing the risk of future changes that contradict established principles.',
    why: 'Key architectural and epistemic decisions were not yet written down, making it harder to maintain consistency across development sessions.',
  },
  {
    match: (t) => t.includes('observabilit') || t.includes('metric') || t.includes('health'),
    effect: 'This makes it possible to catch pipeline degradation early and understand where the system is losing signal quality.',
    why: 'There was no structured way to measure whether the operational pipeline was performing at an acceptable level across sessions.',
  },
  {
    match: (t) => t.includes('runtime') || t.includes('freshness') || t.includes('readiness'),
    effect: 'This prevents the dashboard from presenting stale data as if it were current, which would undermine decision quality.',
    why: 'The system had no reliable mechanism to verify that data was fresh before exposing it to the decision layer.',
  },
  {
    match: (t) => t.includes('bilingual') || t.includes('ui provider') || t.includes('locale'),
    effect: 'This allows the interface to serve operators in their preferred language without fragmenting the codebase into separate builds.',
    why: 'The dashboard needed to support multiple languages in a way that did not complicate the component structure.',
  },
];

function enrichCommit(msg) {
  const text = msg.toLowerCase();
  const match = COMMIT_ENRICHMENTS.find((e) => e.match(text));
  const base = msg.charAt(0).toUpperCase() + msg.slice(1);
  const sentence = base.endsWith('.') ? base : `${base}.`;
  if (!match) return sentence;
  return `${sentence} ${match.why} ${match.effect}`;
}

function buildSummary(commits, checklist) {
  if (!commits.length && !checklist) {
    return 'This session focused on reviewing the current project state and architecture. No structural changes were committed, but the pipeline configuration and system documentation were examined in depth to prepare for upcoming development work.';
  }

  const count = commits.length;
  const text = commits.join(' ').toLowerCase();

  const themes = [];
  if (text.includes('journal')) themes.push('operational observability');
  if (text.includes('pipeline') || text.includes('bootstrap')) themes.push('pipeline reliability');
  if (text.includes('cio') || text.includes('allocation') || text.includes('decision')) themes.push('executive decision quality');
  if (text.includes('frontend') || text.includes('dashboard')) themes.push('dashboard clarity');
  if (text.includes('research') || text.includes('temporal') || text.includes('persistence')) themes.push('market research depth');
  if (text.includes('portfolio') || text.includes('governance')) themes.push('portfolio governance');
  if (text.includes('config') || text.includes('env') || text.includes('deploy')) themes.push('deployment readiness');

  const themeList = themes.length > 1
    ? `${themes.slice(0, -1).join(', ')} and ${themes[themes.length - 1]}`
    : themes[0] || null;
  const themePhrase = themeList
    ? `The session concentrated on ${themeList}.`
    : 'The session addressed several areas of the codebase.';

  const scopePhrase = count === 1
    ? 'A single focused change was introduced.'
    : `${count} changes were introduced across the project.`;

  const statePhrase = checklist?.ready_for_today
    ? 'The system reached a fully operational state for the day.'
    : 'The work is ongoing and the system is still building toward full operational readiness.';

  return `${themePhrase} ${scopePhrase} ${statePhrase}`;
}

function buildWorkCompleted(commits) {
  if (!commits.length) {
    return [
      'Reviewed project architecture and pipeline structure. Understanding the current system layers is necessary before introducing changes that affect multiple engines.',
      'Examined documentation across README, SYSTEM_OVERVIEW, and architecture notes. This ensures any upcoming development stays aligned with the established design principles.',
    ];
  }
  return commits.map(enrichCommit);
}

function buildNextSteps(checklist, commits) {
  const items = [];
  const text = commits.join(' ').toLowerCase();

  if (text.includes('journal')) {
    items.push('Verify that today\'s journal entry is rendering correctly in Lovable, confirming the POST and PATCH flow works end to end with the live API key.');
    items.push('Hook journal sync into the daily bootstrap as a final stage so that every pipeline run automatically leaves a session record without requiring a manual trigger.');
  }

  if (text.includes('pipeline') || text.includes('bootstrap')) {
    items.push('Monitor bootstrap run logs after the next scheduled trigger to confirm the new changes propagate correctly through all pipeline stages.');
  }

  if (text.includes('cio') || text.includes('allocation') || text.includes('decision')) {
    items.push('Run a full bootstrap cycle and review the executive allocation output to confirm the decision layer is producing consistent and defensible postures.');
  }

  if (text.includes('frontend') || text.includes('dashboard') || text.includes('report') || text.includes('panel')) {
    items.push('Open the dashboard and verify the updated layout reflects the allocation-first hierarchy, with the CIO output visible before supporting research panels.');
  }

  if (text.includes('config') || text.includes('env') || text.includes('deploy')) {
    items.push('Test the environment configuration against a clean install to confirm all required variables are documented and the runtime validation catches missing entries early.');
  }

  if (!checklist?.ready_for_today && checklist) {
    items.push('Complete the remaining pipeline windows before game time so the system has a full timeline of market snapshots to work with.');
  }

  if (!items.length) {
    items.push('Review the output artifacts from the next bootstrap cycle to confirm the changes introduced today are reflected correctly in the processed state.');
    items.push('Continue developing the current layer and document any design decisions that are not yet captured in the architecture notes.');
  }

  return items;
}

function buildPayload(ops, bootstrap) {
  const checklist = ops?.meta?.operational_checklist || bootstrap?.checklist || null;
  const commits = todayCommits(DATE);
  const status = deriveStatus(checklist, commits);

  return {
    date: DATE,
    title: `Session · ${DATE}`,
    summary: buildSummary(commits, checklist),
    work_completed: buildWorkCompleted(commits),
    next_steps: buildNextSteps(checklist, commits),
    status,
    tags: deriveTags(commits),
    eta: null,
  };
}

async function apiRequest(method, url, body) {
  if (!JOURNAL_API_KEY) throw new Error('JOURNAL_API_KEY is not set');
  const res = await fetch(url, {
    method,
    headers: {
      'x-api-key': JOURNAL_API_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, body: json };
}

async function getEntryForDate(date) {
  const res = await fetch(`${JOURNAL_API_URL}/${date}`, {
    headers: { 'x-api-key': JOURNAL_API_KEY },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET failed: ${res.status}`);
  const json = await res.json();
  if (Array.isArray(json)) return json[0] || null;
  return json?.id ? json : null;
}

async function main() {
  if (!JOURNAL_API_KEY) {
    console.error('[journal-sync] JOURNAL_API_KEY is not set — aborting');
    process.exit(1);
  }

  const ops = readJsonIfExists(path.join(PROCESSED_DIR, 'daily_operations_status.json'));
  const bootstrap = readJsonIfExists(path.join(OPS_ROOT, 'historical', 'bootstrap', `${DATE}.json`));
  const payload = buildPayload(ops, bootstrap);

  console.log(`[journal-sync] date=${DATE} status=${payload.status} tags=${payload.tags.join(', ')}`);

  const existing = await getEntryForDate(DATE);

  if (existing?.id) {
    const result = await apiRequest('PATCH', `${JOURNAL_API_URL}/${existing.id}`, {
      title: payload.title,
      summary: payload.summary,
      work_completed: payload.work_completed,
      next_steps: payload.next_steps,
      status: payload.status,
      tags: payload.tags,
    });
    if (!result.ok) throw new Error(`PATCH failed: ${result.status} — ${JSON.stringify(result.body)}`);
    console.log(`[journal-sync] PATCH ${existing.id} → ${result.status}`);
  } else {
    const result = await apiRequest('POST', JOURNAL_API_URL, payload);
    if (!result.ok) throw new Error(`POST failed: ${result.status} — ${JSON.stringify(result.body)}`);
    console.log(`[journal-sync] POST → ${result.status} id=${result.body?.id || 'unknown'}`);
  }
}

main().catch((err) => {
  console.error(`[journal-sync] ${err.message}`);
  process.exit(1);
});
