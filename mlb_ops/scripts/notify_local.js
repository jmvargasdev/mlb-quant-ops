const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const OPS_ROOT = path.resolve(__dirname, '..');
const LEDGER_DIR = path.join(OPS_ROOT, 'historical', 'decision_ledger');
const NOTIFIED_PATH = path.join(OPS_ROOT, 'processed', 'notified_signals.json');

const DATE = process.env.MLB_DATE || new Date().toISOString().slice(0, 10);
const ALERT_SECONDS = Number(process.env.ALERT_SECONDS || 10);
const ALERT_SOUND = process.env.ALERT_SOUND || '/System/Library/Sounds/Ping.aiff';

function readLedger(date) {
  const filePath = path.join(LEDGER_DIR, `${date}.jsonl`);
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function readNotified() {
  if (!fs.existsSync(NOTIFIED_PATH)) return { keys: [] };
  try { return JSON.parse(fs.readFileSync(NOTIFIED_PATH, 'utf8')); } catch { return { keys: [] }; }
}

function writeNotified(notified) {
  fs.writeFileSync(NOTIFIED_PATH, JSON.stringify(notified, null, 2));
}

function playAlert(seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    spawnSync('afplay', [ALERT_SOUND]);
  }
}

function main() {
  const rows = readLedger(DATE);
  const executeNow = rows.filter((r) => r.action === 'Execute Now');

  if (!executeNow.length) {
    console.log(JSON.stringify({ date: DATE, status: 'no_signal', message: 'No Execute Now actions in ledger.' }));
    return;
  }

  const notified = readNotified();
  const newSignals = executeNow.filter((r) => {
    const key = r.source_signature || `${r.game_id}:${r.side}:${r.generated_at}`;
    return !notified.keys.includes(key);
  });

  if (!newSignals.length) {
    console.log(JSON.stringify({ date: DATE, status: 'already_notified', total: executeNow.length }));
    return;
  }

  const summary = newSignals.map((r) => ({
    team: r.team,
    matchup: r.game_id,
    conviction: r.conviction_tier,
    exposure: r.executive_exposure,
    reason: r.reason_codes,
  }));

  console.log(JSON.stringify({ date: DATE, status: 'alerting', new_signals: newSignals.length, signals: summary }));

  playAlert(ALERT_SECONDS);

  const newKeys = newSignals.map((r) => r.source_signature || `${r.game_id}:${r.side}:${r.generated_at}`);
  writeNotified({ keys: [...notified.keys, ...newKeys], last_updated: new Date().toISOString() });
}

main();
