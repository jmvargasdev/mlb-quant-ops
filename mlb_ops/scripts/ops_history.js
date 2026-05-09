const fs = require('fs');
const path = require('path');

const OPS_ROOT = path.resolve(__dirname, '..');
const HISTORY_ROOT = path.join(OPS_ROOT, 'historical');
const BOOTSTRAP_DIR = path.join(HISTORY_ROOT, 'bootstrap');
const DAILY_EVENTS_DIR = path.join(HISTORY_ROOT, 'daily_events');
const DAILY_RUNS_DIR = path.join(HISTORY_ROOT, 'daily_runs');

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

function bootstrapPath(date) {
  return path.join(BOOTSTRAP_DIR, `${date}.json`);
}

function dailyEventsPath(date) {
  return path.join(DAILY_EVENTS_DIR, `${date}.json`);
}

function dailyRunPath(date) {
  return path.join(DAILY_RUNS_DIR, `${date}.json`);
}

function loadDailyEvents(date) {
  return readJsonIfExists(dailyEventsPath(date)) || { date, events: [] };
}

function appendDailyEvent(date, event) {
  const current = loadDailyEvents(date);
  const entry = {
    event_id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...event,
  };
  const next = {
    date,
    updated_at: entry.timestamp,
    events: [...(current.events || []), entry],
  };
  writeJson(dailyEventsPath(date), next);
  return entry;
}

function loadBootstrapRecord(date) {
  return readJsonIfExists(bootstrapPath(date));
}

function writeBootstrapRecord(date, record) {
  writeJson(bootstrapPath(date), {
    date,
    updated_at: new Date().toISOString(),
    ...record,
  });
}

function writeDailyRunRecord(date, record) {
  writeJson(dailyRunPath(date), {
    date,
    updated_at: new Date().toISOString(),
    ...record,
  });
}

module.exports = {
  HISTORY_ROOT,
  BOOTSTRAP_DIR,
  DAILY_EVENTS_DIR,
  DAILY_RUNS_DIR,
  appendDailyEvent,
  loadBootstrapRecord,
  writeBootstrapRecord,
  writeDailyRunRecord,
};
