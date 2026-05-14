import { useEffect, useRef } from 'react';

const STORAGE_KEY = 'executeNowNotified';
const ALERT_DURATION_S = 10;
const PULSE_INTERVAL_S = 0.45;
const PULSE_ON_S = 0.18;
const FREQ_HZ = 880;

function loadNotified(date) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : {};
    return new Set(stored[date] || []);
  } catch {
    return new Set();
  }
}

function saveNotified(date, keys) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : {};
    // keep only today — auto-expires yesterday's entries
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ [date]: [...keys] }));
  } catch {}
}

function playAlert() {
  try {
    const ctx = new AudioContext();
    for (let t = 0; t < ALERT_DURATION_S; t += PULSE_INTERVAL_S) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = FREQ_HZ;
      gain.gain.setValueAtTime(0, ctx.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + t + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + t + PULSE_ON_S);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + PULSE_ON_S);
    }
  } catch {}
}

export function useExecuteNowAlert(allocationRows, date, onNewSignals) {
  const prevKeysRef = useRef(null);

  useEffect(() => {
    if (!allocationRows?.length || !date) return;

    const executeNow = allocationRows.filter((r) => r.action === 'Execute Now');
    if (!executeNow.length) return;

    const notified = loadNotified(date);
    const newSignals = executeNow.filter((r) => {
      const key = r.source_signature || `${r.game_id}:${r.side}:${r.generated_at}`;
      return !notified.has(key);
    });

    if (!newSignals.length) return;

    // avoid double-firing within same render cycle
    const newKeyString = newSignals.map((r) => r.source_signature || `${r.game_id}:${r.side}`).join(',');
    if (prevKeysRef.current === newKeyString) return;
    prevKeysRef.current = newKeyString;

    playAlert();

    const updatedKeys = new Set(notified);
    newSignals.forEach((r) => {
      updatedKeys.add(r.source_signature || `${r.game_id}:${r.side}:${r.generated_at}`);
    });
    saveNotified(date, updatedKeys);

    if (onNewSignals) onNewSignals(newSignals);
  }, [allocationRows, date, onNewSignals]);
}
