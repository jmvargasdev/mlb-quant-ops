import { useMemo, useState } from 'react';
import PanelFrame from '../../shared/components/PanelFrame';
import SignalPill from '../../shared/components/SignalPill';
import { fmt, pct, timestampFull } from '../../shared/lib/formatters';
import useHistoricalSelections from './useHistoricalSelections';

const ALL = 'all';

function resultTone(result) {
  if (result === 'Win') return 'positive';
  if (result === 'Loss') return 'danger';
  if (result === 'Pending') return 'info';
  return 'neutral';
}

function uniqueOptions(rows, key) {
  return [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort();
}

function probability(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  return pct(Number(value) * 100, 1);
}

function numericCell(value, digits = 1) {
  return value === null || value === undefined ? 'n/a' : fmt(value, digits);
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-800/70 py-2 text-sm last:border-0">
      <div className="text-slate-500">{label}</div>
      <div className="max-w-[65%] text-right text-slate-200">{value ?? 'n/a'}</div>
    </div>
  );
}

function SelectionDrawer({ row, onClose }) {
  if (!row) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-slate-700/50 bg-slate-950/98 shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-slate-700/50 px-5 py-4">
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.22em] text-slate-500">{row.date} · {row.snapshot_label || 'snapshot n/a'}</div>
          <h2 className="mt-2 text-lg font-semibold text-white">{row.team}</h2>
          <p className="mt-1 text-sm text-slate-400">{row.matchup || `Game ${row.game_id}`}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-9 w-9 rounded-md border border-slate-700/60 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white"
          aria-label="Close"
          title="Close"
        >
          ×
        </button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-wrap gap-2">
          <SignalPill tone={row.signal_classification === 'Validated Edge' ? 'positive' : 'neutral'}>{row.signal_classification}</SignalPill>
          <SignalPill tone={row.exposure_governance === 'active' ? 'positive' : row.exposure_governance === 'monitor_only' ? 'info' : 'neutral'}>{row.exposure_governance}</SignalPill>
          <SignalPill tone={resultTone(row.result)}>{row.result}</SignalPill>
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold text-white">Outcome</h3>
          <div className="mt-2 border-y border-slate-800/70">
            <DetailRow label="Score" value={row.score} />
            <DetailRow label="P/L proxy" value={numericCell(row.profit_loss_proxy, 2)} />
            <DetailRow label="Decision quality" value={row.decision_quality} />
            <DetailRow label="Action correct" value={row.was_action_correct === null || row.was_action_correct === undefined ? 'n/a' : row.was_action_correct ? 'yes' : 'no'} />
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold text-white">Signal Evidence</h3>
          <div className="mt-2 border-y border-slate-800/70">
            <DetailRow label="Action" value={row.action} />
            <DetailRow label="Conviction tier" value={row.conviction_tier} />
            <DetailRow label="Fair probability" value={probability(row.fair_probability)} />
            <DetailRow label="Market probability" value={probability(row.market_probability)} />
            <DetailRow label="Edge" value={row.edge_pct_points === null || row.edge_pct_points === undefined ? 'n/a' : `${fmt(row.edge_pct_points, 2)} pts`} />
            <DetailRow label="Quant score" value={numericCell(row.quant_score, 2)} />
            <DetailRow label="Persistence" value={numericCell(row.persistence_score, 1)} />
            <DetailRow label="Volatility" value={numericCell(row.volatility_score, 1)} />
            <DetailRow label="Validation" value={row.validation_bucket} />
            <DetailRow label="Lifecycle" value={row.lifecycle} />
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold text-white">Audit Trail</h3>
          <div className="mt-2 border-y border-slate-800/70">
            <DetailRow label="Decision generated" value={timestampFull(row.decision_generated_at)} />
            <DetailRow label="Attributed" value={timestampFull(row.generated_at)} />
            <DetailRow label="Source signature" value={row.source_signature} />
            <DetailRow label="Executive exposure" value={row.executive_exposure} />
            <DetailRow label="Kelly exposure" value={row.kelly_exposure} />
            <DetailRow label="Raw exposure" value={row.raw_exposure} />
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold text-white">Reason</h3>
          <p className="mt-2 rounded-md border border-slate-800/70 bg-slate-900/50 p-3 text-sm leading-6 text-slate-300">{row.reason || 'n/a'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(row.reason_codes || []).map((code) => (
              <span key={code} className="mono rounded-md border border-slate-700/50 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300">{code}</span>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold text-white">Policy Gates</h3>
          <div className="mt-2 grid gap-2">
            {(row.policy_gates || []).length ? row.policy_gates.map((gate) => (
              <div key={`${gate.code}-${gate.status}`} className="rounded-md border border-slate-800/70 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="mono text-[10px] uppercase tracking-[0.16em] text-slate-300">{gate.code}</span>
                  <span className="text-xs text-slate-500">{gate.status}</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">{gate.effect} · {gate.severity}</div>
              </div>
            )) : <div className="text-sm text-slate-500">No policy gates recorded.</div>}
          </div>
        </div>
      </div>
    </aside>
  );
}

export default function HistoricalSelectionsWorkspace() {
  const { rows, summary, generatedAt, status } = useHistoricalSelections();
  const [filters, setFilters] = useState({
    signal: ALL,
    governance: ALL,
    result: ALL,
    date: '',
    query: '',
  });
  const [selectedRow, setSelectedRow] = useState(null);

  const signalOptions = useMemo(() => uniqueOptions(rows, 'signal_classification'), [rows]);
  const governanceOptions = useMemo(() => uniqueOptions(rows, 'exposure_governance'), [rows]);
  const resultOptions = useMemo(() => uniqueOptions(rows, 'result'), [rows]);

  const filteredRows = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.signal !== ALL && row.signal_classification !== filters.signal) return false;
      if (filters.governance !== ALL && row.exposure_governance !== filters.governance) return false;
      if (filters.result !== ALL && row.result !== filters.result) return false;
      if (filters.date && row.date !== filters.date) return false;
      if (query) {
        const haystack = `${row.team || ''} ${row.matchup || ''} ${row.action || ''} ${row.conviction_tier || ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [filters, rows]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="grid gap-5">
      <PanelFrame
        title="Historical Selections"
        subtitle="Auditable selection-level outcomes across the historical attribution layer."
        className="border border-sky-300/20 bg-slate-950/55"
        action={<div className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Updated {timestampFull(generatedAt)}</div>}
      >
        {status.error && <div className="rounded-md border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{status.error}</div>}
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Validated Edge</div>
            <div className="mt-1 text-xl font-semibold text-white">{fmt(summary.complete_validated_edge_rows, 0)}</div>
            <div className="text-xs text-slate-500">{fmt(summary.pending_validated_edge_rows, 0)} pending</div>
          </div>
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Accuracy</div>
            <div className="mt-1 text-xl font-semibold text-white">{pct(summary.validated_edge_accuracy, 1)}</div>
            <div className="text-xs text-slate-500">{fmt(summary.wins, 0)} wins / {fmt(summary.losses, 0)} losses</div>
          </div>
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Rows</div>
            <div className="mt-1 text-xl font-semibold text-white">{fmt(summary.total_rows, 0)}</div>
            <div className="text-xs text-slate-500">{fmt(filteredRows.length, 0)} visible</div>
          </div>
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Source</div>
            <div className="mt-1 text-xl font-semibold text-white">Outcome Attribution</div>
            <div className="text-xs text-slate-500">Deduped by date/game/side/snapshot</div>
          </div>
        </div>
      </PanelFrame>

      <PanelFrame className="border border-slate-700/35 bg-slate-950/50">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_160px_150px]">
          <label className="grid gap-1">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Search</span>
            <input
              value={filters.query}
              onChange={(event) => updateFilter('query', event.target.value)}
              className="h-10 rounded-md border border-slate-700/50 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-300/50"
              placeholder="Team, matchup, action..."
            />
          </label>
          <label className="grid gap-1">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Signal</span>
            <select value={filters.signal} onChange={(event) => updateFilter('signal', event.target.value)} className="h-10 rounded-md border border-slate-700/50 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-300/50">
              <option value={ALL}>All</option>
              {signalOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Governance</span>
            <select value={filters.governance} onChange={(event) => updateFilter('governance', event.target.value)} className="h-10 rounded-md border border-slate-700/50 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-300/50">
              <option value={ALL}>All</option>
              {governanceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Result</span>
            <select value={filters.result} onChange={(event) => updateFilter('result', event.target.value)} className="h-10 rounded-md border border-slate-700/50 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-300/50">
              <option value={ALL}>All</option>
              {resultOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Date</span>
            <input
              value={filters.date}
              onChange={(event) => updateFilter('date', event.target.value)}
              type="date"
              className="h-10 rounded-md border border-slate-700/50 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-300/50"
            />
          </label>
        </div>
      </PanelFrame>

      <PanelFrame className="border border-slate-700/35 bg-slate-950/50 p-0">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="min-w-[1180px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800/80 text-left">
                {['Date', 'Selection', 'Matchup', 'Signal', 'Governance', 'Edge', 'Result', 'Score', 'P/L', 'Snapshot'].map((heading) => (
                  <th key={heading} className="mono px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-slate-500">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-slate-900/80 transition hover:bg-sky-300/5"
                  onClick={() => setSelectedRow(row)}
                >
                  <td className="px-4 py-3 text-slate-300">{row.date}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{row.team}</div>
                    <div className="text-xs text-slate-500">{row.side}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{row.matchup || `Game ${row.game_id}`}</td>
                  <td className="px-4 py-3"><SignalPill tone={row.signal_classification === 'Validated Edge' ? 'positive' : 'neutral'}>{row.signal_classification}</SignalPill></td>
                  <td className="px-4 py-3 text-slate-300">{row.exposure_governance}</td>
                  <td className="px-4 py-3 mono text-slate-200">{row.edge_pct_points === null || row.edge_pct_points === undefined ? 'n/a' : `${fmt(row.edge_pct_points, 2)} pts`}</td>
                  <td className="px-4 py-3"><SignalPill tone={resultTone(row.result)}>{row.result}</SignalPill></td>
                  <td className="px-4 py-3 text-slate-300">{row.score || 'n/a'}</td>
                  <td className="px-4 py-3 mono text-slate-200">{numericCell(row.profit_loss_proxy, 2)}</td>
                  <td className="px-4 py-3 text-slate-400">{row.snapshot_label || 'n/a'}</td>
                </tr>
              ))}
              {!filteredRows.length && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-500">
                    {status.loading ? 'Loading historical selections...' : 'No selections match the current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PanelFrame>

      <SelectionDrawer row={selectedRow} onClose={() => setSelectedRow(null)} />
    </div>
  );
}
