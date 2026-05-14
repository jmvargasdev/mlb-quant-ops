const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getOperationalDate } = require('./lib/operational-date');
const { chat, isAvailable, MODELS } = require('../../config/ollama');

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

async function generateJournalEntry(commits, checklist, date) {
  if (!(await isAvailable())) return null;

  const context = [
    'Project: MLB Quant Ops — 5-layer epistemic system for MLB game-day markets.',
    'Layers: Sabermetrics → Market Pricing → Temporal Intelligence → Portfolio Governance → Executive CIO.',
    `Date: ${date}`,
    commits.length
      ? `Git commits:\n${commits.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : 'No commits — review or planning session.',
    checklist ? `Operational checklist ready: ${checklist.ready_for_today ?? 'unknown'}` : '',
  ].filter(Boolean).join('\n');

  const systemPrompt = `You write development journal entries for a quantitative research system.
Your audience is a human practitioner reviewing project progress.
Each work_completed item must: state what was done, explain why it was needed (cause), and describe what changes as a result (effect).
Each next_steps item must be concrete and actionable with brief rationale.
The summary must read as coherent prose — not a list, not a log.
Respond with valid JSON only, matching this exact schema:
{"summary":"string","work_completed":["string"],"next_steps":["string"]}`;

  const raw = await chat(MODELS.reason, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: context },
  ]);

  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function fallbackEntry(commits) {
  const summary = commits.length
    ? `This session introduced ${commits.length} change${commits.length > 1 ? 's' : ''} to the MLB Quant Ops pipeline.`
    : 'This session focused on reviewing the current project state. No structural changes were committed.';
  const work_completed = commits.length
    ? commits.map((c) => `${c.charAt(0).toUpperCase() + c.slice(1)}.`)
    : ['Reviewed project architecture and pipeline structure.'];
  const next_steps = ['Review the output artifacts from the next bootstrap cycle to confirm today\'s changes are reflected correctly in the processed state.'];
  return { summary, work_completed, next_steps };
}

async function buildPayload(ops, bootstrap) {
  const checklist = ops?.meta?.operational_checklist || bootstrap?.checklist || null;
  const commits = todayCommits(DATE);
  const status = deriveStatus(checklist, commits);
  const llm = await generateJournalEntry(commits, checklist, DATE);
  if (!llm) console.log('[journal-sync] Ollama unavailable — using fallback entry');
  const { summary, work_completed, next_steps } = llm || fallbackEntry(commits);

  return {
    date: DATE,
    title: `Session · ${DATE}`,
    summary,
    work_completed,
    next_steps,
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
  const payload = await buildPayload(ops, bootstrap);

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
