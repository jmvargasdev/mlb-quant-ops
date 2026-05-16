import PanelFrame from '../../../shared/components/PanelFrame';
import SignalPill from '../../../shared/components/SignalPill';
import { fmt, humanizeFlag, pct, signedPoints } from '../../../shared/lib/formatters';

function toneFromTrend(trend) {
  if (trend === 'edge_strengthening' || trend === 'stable_edge') return 'positive';
  if (trend === 'edge_collapse' || trend === 'edge_decay') return 'danger';
  return 'neutral';
}

function clamp(value, min = 0, max = 100) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 0;
  return Math.max(min, Math.min(max, Number(value)));
}

function ModelSignalGadget({ card }) {
  const edgeStrength = clamp((card.edge_pct_points || 0) * 8);
  const quantStrength = clamp((card.quant_score || 0) * 4);
  const confidence = clamp(card.confidence_score);
  const persistence = clamp(card.persistence_score);
  const volatilityControl = clamp(100 - (card.volatility_score || 0));
  const composite = clamp((edgeStrength * 0.28) + (quantStrength * 0.24) + (confidence * 0.18) + (persistence * 0.2) + (volatilityControl * 0.1));
  const bars = [
    ['Edge', edgeStrength],
    ['Quant', quantStrength],
    ['Conf', confidence],
    ['Persist', persistence],
    ['Control', volatilityControl],
  ];

  return (
    <div className="mt-4 rounded-xl border border-sky-300/20 bg-slate-950/45 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.22em] text-sky-200">Model Signal</div>
          <div className="mt-1 text-xs text-slate-500">Composite live read</div>
        </div>
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-sky-300/25 bg-sky-300/8">
          <div
            className="absolute inset-1 rounded-full"
            style={{ background: `conic-gradient(#38bdf8 ${composite * 3.6}deg, rgba(51,65,85,0.75) 0deg)` }}
          />
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
            {fmt(composite, 0)}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        {bars.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[64px_minmax(0,1fr)_34px] items-center gap-2">
            <div className="mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 via-emerald-300 to-amber-200 transition-[width] duration-700"
                style={{ width: `${value}%` }}
              />
            </div>
            <div className="mono text-right text-[10px] text-slate-400">{fmt(value, 0)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeSignalRow(row, group) {
  return {
    id: `${group}-${row.game_id}-${row.selection_team || row.team || row.side || row.matchup}`,
    group,
    matchup: row.matchup,
    team: row.selection_team || row.team || 'n/a',
    edge: Number(row.edge_pct_points ?? 0),
    quant: Number(row.quant_score ?? 0),
    volatility: Number(row.volatility_score ?? 0),
  };
}

function SlateSignalMap({ sections }) {
  const groups = [
    {
      key: 'bettable',
      title: 'Priority Signals',
      tone: 'from-emerald-300 to-sky-300',
      rows: (sections.top_bettable || []).map((row) => normalizeSignalRow(row, 'bettable')),
    },
    {
      key: 'watchlist',
      title: 'Watchlist',
      tone: 'from-sky-300 to-amber-200',
      rows: (sections.watchlist || []).map((row) => normalizeSignalRow(row, 'watchlist')),
    },
    {
      key: 'fades',
      title: 'Negative Value Signals',
      tone: 'from-rose-300 to-amber-200',
      rows: (sections.fades || []).map((row) => normalizeSignalRow(row, 'fades')),
    },
  ];
  const allRows = groups.flatMap((group) => group.rows);
  const maxAbsEdge = Math.max(1, ...allRows.map((row) => Math.abs(row.edge)));
  const maxAbsQuant = Math.max(1, ...allRows.map((row) => Math.abs(row.quant)));

  return (
    <PanelFrame title="Slate Signal Map" subtitle="League snapshot grouped by action bucket, edge size, and model strength.">
      <div className="grid gap-3 xl:grid-cols-3">
        {groups.map((group) => (
          <div key={group.key} className="rounded-2xl border border-slate-700/35 bg-slate-950/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">{group.title}</div>
                <div className="mt-1 text-xs text-slate-500">{group.rows.length} team signals</div>
              </div>
              <div className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Edge / Quant</div>
            </div>

            <div className="relative mt-4 h-52 overflow-hidden rounded-xl border border-slate-700/30 bg-slate-950/55">
              <div className="absolute left-0 right-0 top-1/2 border-t border-slate-700/35" />
              <div className="absolute bottom-3 left-3 top-3 border-l border-slate-700/35" />
              <div className="absolute bottom-2 left-3 right-3 flex justify-between mono text-[9px] uppercase tracking-[0.14em] text-slate-600">
                <span>Low</span>
                <span>Model Strength</span>
                <span>High</span>
              </div>
              <div className="absolute left-2 top-3 mono text-[9px] uppercase tracking-[0.14em] text-slate-600">Edge</div>

              {group.rows.map((row) => {
                const x = 12 + (Math.abs(row.quant) / maxAbsQuant) * 78;
                const y = 50 - (row.edge / maxAbsEdge) * 38;
                const size = 8 + Math.min(14, Math.abs(row.edge) * 0.8);
                return (
                  <div
                    key={row.id}
                    className={`absolute rounded-full bg-gradient-to-br ${group.tone} shadow-[0_0_18px_rgba(56,189,248,0.22)]`}
                    style={{
                      left: `${x}%`,
                      top: `${Math.max(8, Math.min(84, y))}%`,
                      width: `${size}px`,
                      height: `${size}px`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    title={`${row.team} · edge ${fmt(row.edge, 2)} · quant ${fmt(row.quant, 2)}`}
                  />
                );
              })}
            </div>

            <div className="mt-3 grid gap-2">
              {group.rows.slice(0, 4).map((row) => (
                <div key={`${row.id}-label`} className="grid grid-cols-[minmax(0,1fr)_64px_64px] gap-2 text-xs">
                  <div className="truncate text-slate-300">{row.team}</div>
                  <div className="mono text-right text-slate-400">{signedPoints(row.edge)}</div>
                  <div className="mono text-right text-slate-400">{fmt(row.quant, 1)}</div>
                </div>
              ))}
              {!group.rows.length && <div className="text-xs text-slate-500">No current signals in this bucket.</div>}
            </div>
          </div>
        ))}
      </div>
    </PanelFrame>
  );
}

function formatCandidateEdge(row) {
  if (row.edge === null || row.edge === undefined || Number.isNaN(Number(row.edge))) return 'n/a';
  if (row.edge_units === 'runs') {
    const numeric = Number(row.edge);
    return `${numeric > 0 ? '+' : ''}${fmt(numeric, 2)} runs`;
  }
  return signedPoints(row.edge);
}

function candidateMagnitude(row) {
  if (row.edge === null || row.edge === undefined || Number.isNaN(Number(row.edge))) return 0;
  return Math.abs(Number(row.edge));
}

function candidateDisplayValue(row) {
  if (row.edge_units === 'runs') return `${fmt(candidateMagnitude(row), 2)} runs delta`;
  return signedPoints(row.edge);
}

function candidateDirection(row) {
  if (row.market_type === 'total') return String(row.side || '').toUpperCase() || 'TOTAL';
  if (row.display_signal === 'Negative value signal') return 'OVERPRICED';
  return row.side ? String(row.side).toUpperCase() : 'SIGNAL';
}

function Gauge({ row, tone = 'positive' }) {
  const magnitude = row.edge_units === 'runs'
    ? clamp(candidateMagnitude(row) * 28, 8, 92)
    : clamp(candidateMagnitude(row) * 5, 8, 92);
  const color = tone === 'danger' ? '#fb7185' : '#34d399';
  const muted = tone === 'danger' ? 'rgba(127,29,29,0.55)' : 'rgba(6,78,59,0.55)';
  const needleRotation = tone === 'danger'
    ? -72 + (magnitude * 0.55)
    : 18 + (magnitude * 0.55);

  return (
    <div className="relative h-20 w-28 overflow-hidden">
      <div
        className="absolute left-1/2 top-4 h-24 w-24 -translate-x-1/2 rounded-full"
        style={{ background: `conic-gradient(from 270deg, ${color} ${magnitude * 1.8}deg, ${muted} 0deg 180deg, transparent 0deg)` }}
      />
      <div className="absolute left-1/2 top-7 h-[4.5rem] w-[4.5rem] -translate-x-1/2 rounded-full bg-slate-950" />
      <div
        className="absolute bottom-5 left-1/2 h-0.5 w-9 origin-left rounded-full"
        style={{ background: color, transform: `rotate(${needleRotation}deg)` }}
      />
      <div className="absolute bottom-3 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-white" />
      <div className="absolute bottom-0 left-0 right-0 text-center mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
        {candidateDirection(row)}
      </div>
    </div>
  );
}

function SignalCard({ row, tone = 'positive' }) {
  const toneClass = tone === 'danger'
    ? 'border-rose-400/30 bg-rose-400/6'
    : 'border-emerald-300/30 bg-emerald-300/6';
  const valueClass = tone === 'danger' ? 'text-rose-200' : 'text-emerald-200';
  const metricLabel = row.market_type === 'total' ? 'Model - Market' : 'Edge';

  return (
    <div className={`rounded-2xl border ${toneClass} px-4 py-3`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-lg font-semibold ${valueClass}`}>{row.selection_label}</div>
          <div className="mt-1 truncate text-xs text-slate-400">{row.matchup}</div>
          <div className="mt-2 mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
            {metricLabel}: <span className={valueClass}>{formatCandidateEdge(row)}</span>
          </div>
        </div>
        <Gauge row={row} tone={tone} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
        <div>
          <div>Model</div>
          <div className="mt-1 text-slate-200">{fmt(row.model_value, row.edge_units === 'runs' ? 2 : 3)}</div>
        </div>
        <div>
          <div>Market</div>
          <div className="mt-1 text-slate-200">{fmt(row.market_value, row.edge_units === 'runs' ? 1 : 3)}</div>
        </div>
        <div>
          <div>Magnitude</div>
          <div className={`mt-1 ${valueClass}`}>{candidateDisplayValue(row)}</div>
        </div>
      </div>
    </div>
  );
}

function RunLineDepthPanel({ unavailable = 0 }) {
  const rows = ['Away line', 'Home line', 'Price depth', 'Book spread'];
  return (
    <div className="rounded-2xl border border-slate-700/35 bg-slate-950/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Run Line Data</div>
          <div className="mt-1 text-xs text-slate-500">Waiting on reliable depth</div>
        </div>
        <SignalPill tone="warning">{unavailable} waiting</SignalPill>
      </div>
      <div className="mt-4 grid gap-2">
        {rows.map((row) => (
          <div key={row} className="grid grid-cols-[110px_minmax(0,1fr)_70px] items-center gap-3 rounded-xl border border-slate-700/25 bg-slate-900/25 px-3 py-2">
            <div className="mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{row}</div>
            <div className="h-2 rounded-full bg-slate-800">
              <div className="h-2 w-1/3 rounded-full bg-slate-700/80" />
            </div>
            <div className="text-right text-xs text-slate-500">pending</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SignalFlow({ rows }) {
  const points = rows.slice(0, 18);
  return (
    <div className="rounded-2xl border border-slate-700/35 bg-slate-950/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">All Signal Flow</div>
          <div className="mt-1 text-xs text-slate-500">Relative edge intensity across current coverage</div>
        </div>
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500">10m horizon</div>
      </div>
      <div className="relative mt-4 h-32 overflow-hidden rounded-xl border border-slate-700/25 bg-slate-950/60">
        <div className="absolute left-0 right-0 top-1/2 border-t border-slate-700/35" />
        <div className="absolute inset-x-4 bottom-4 top-4 flex items-center gap-2">
          {points.map((row, index) => {
            const height = clamp(candidateMagnitude(row) * (row.edge_units === 'runs' ? 18 : 4), 8, 72);
            const positiveTone = row.market_type === 'total'
              ? row.side === 'over'
              : row.edge >= 0;
            return (
              <div key={`${row.market_type}-${row.game_id}-${row.side}-${index}`} className="flex h-full flex-1 items-center justify-center">
                <div
                  className={`w-full max-w-3 rounded-full ${positiveTone ? 'bg-emerald-300/80 shadow-[0_0_14px_rgba(52,211,153,0.25)]' : 'bg-rose-300/80 shadow-[0_0_14px_rgba(251,113,133,0.22)]'}`}
                  style={{ height: `${height}px` }}
                  title={`${row.selection_label}: ${formatCandidateEdge(row)}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MultiMarketSignals({ summary }) {
  const moneyline = summary?.markets?.moneyline?.top || [];
  const totals = summary?.markets?.totals?.top || [];
  const runLineUnavailable = summary?.unavailable_counts?.run_line || 0;
  const allRows = [...moneyline, ...totals];
  const priorityRows = allRows
    .filter((row) => row.status === 'priority_signal' && row.display_signal !== 'Negative value signal')
    .slice(0, 3);
  const negativeRows = moneyline
    .filter((row) => row.display_signal === 'Negative value signal')
    .slice(0, 3);

  return (
    <PanelFrame title="Live Signal Dashboard" subtitle="Multi-market coverage across moneyline, totals, and run line availability.">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
        <div className="mono flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/8 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-200">
          <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
          Moneyline: {summary?.markets?.moneyline?.eligible_count || 0} Live Active
        </div>
        <div className="mono flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-300/8 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-sky-200">
          <span className="h-2 w-2 rounded-full bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.75)]" />
          Totals: {summary?.markets?.totals?.eligible_count || 0} Live Experimental
        </div>
        <div className="mono flex items-center gap-2 rounded-full border border-rose-300/25 bg-rose-300/8 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-rose-200">
          <span className="h-2 w-2 rounded-full bg-rose-300 shadow-[0_0_12px_rgba(251,113,133,0.75)]" />
          Run Line: {summary?.markets?.run_line?.eligible_count || 0} Live Waiting on Depth
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <div>
          <div className="mb-2 mono text-[11px] uppercase tracking-[0.24em] text-emerald-200">Priority Signals High Edge</div>
          <div className="grid gap-3 xl:grid-cols-3">
            {priorityRows.map((row) => <SignalCard key={`priority-${row.market_type}-${row.game_id}-${row.side}`} row={row} tone="positive" />)}
            {!priorityRows.length && <div className="rounded-2xl border border-dashed border-slate-700/35 p-5 text-sm text-slate-500 xl:col-span-3">No priority signals in current coverage.</div>}
          </div>
        </div>

        <div>
          <div className="mb-2 mono text-[11px] uppercase tracking-[0.24em] text-rose-200">Negative Value Signals</div>
          <div className="grid gap-3 xl:grid-cols-3">
            {negativeRows.map((row) => <SignalCard key={`negative-${row.market_type}-${row.game_id}-${row.side}`} row={row} tone="danger" />)}
            {!negativeRows.length && <div className="rounded-2xl border border-dashed border-slate-700/35 p-5 text-sm text-slate-500 xl:col-span-3">No negative value signals in current coverage.</div>}
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <RunLineDepthPanel unavailable={runLineUnavailable} />
          <SignalFlow rows={allRows} />
        </div>
      </div>
    </PanelFrame>
  );
}

function Card({ card, onSelect, showModelGadget = false }) {
  const categoryLabel = card.category === 'top_bettable'
    ? 'priority'
    : String(card.category || 'other').replaceAll('_', ' ');

  return (
    <button
      type="button"
      onClick={() => onSelect(card.game_id)}
      className="rounded-2xl border border-slate-700/35 bg-slate-950/20 px-4 py-4 text-left transition hover:border-slate-500/45"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">{card.selection_team}</div>
          <div className="mt-1 text-xs text-slate-400">{card.matchup}</div>
        </div>
        <div className="flex items-center gap-2">
          <SignalPill tone={toneFromTrend(card.edge_trend)}>{humanizeFlag(card.edge_trend)}</SignalPill>
          <span className="mono rounded-md border border-slate-600/30 bg-slate-900/60 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300">
            {categoryLabel}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-700/30 bg-slate-950/40 px-3 py-2">
          <div className="mono text-[10px] uppercase tracking-[0.22em] text-slate-500">Edge</div>
          <div className="mt-1 text-white">{signedPoints(card.edge_pct_points)}</div>
        </div>
        <div className="rounded-xl border border-slate-700/30 bg-slate-950/40 px-3 py-2">
          <div className="mono text-[10px] uppercase tracking-[0.22em] text-slate-500">Fair / Mkt</div>
          <div className="mt-1 text-white">{pct(card.fair_probability * 100, 1)} / {pct(card.market_probability * 100, 1)}</div>
        </div>
        <div className="rounded-xl border border-slate-700/30 bg-slate-950/40 px-3 py-2">
          <div className="mono text-[10px] uppercase tracking-[0.22em] text-slate-500">Quant / Persist</div>
          <div className="mt-1 text-white">{fmt(card.quant_score, 2)} / {fmt(card.persistence_score, 1)}</div>
        </div>
        <div className="rounded-xl border border-slate-700/30 bg-slate-950/40 px-3 py-2">
          <div className="mono text-[10px] uppercase tracking-[0.22em] text-slate-500">Vol / Move</div>
          <div className="mt-1 text-white">{fmt(card.volatility_score, 1)} / {signedPoints(card.line_movement_pct_points)}</div>
        </div>
      </div>

      {showModelGadget && <ModelSignalGadget card={card} />}

      <div className="mt-4 flex flex-wrap gap-2">
        {(card.risk_flags || []).slice(0, 5).map((flag) => (
          <SignalPill key={flag} tone={flag.includes('survived') || flag.includes('stable') ? 'info' : 'warning'}>
            {humanizeFlag(flag)}
          </SignalPill>
        ))}
      </div>
    </button>
  );
}

function Section({ title, subtitle, rows, onSelect, columnsClass = 'grid gap-3 xl:grid-cols-1', showModelGadget = false }) {
  return (
    <PanelFrame title={title} subtitle={subtitle}>
      <div className={columnsClass}>
        {rows.map((row) => (
          <Card
            key={`${row.game_id}-${row.selection_team}`}
            card={row}
            onSelect={onSelect}
            showModelGadget={showModelGadget}
          />
        ))}
        {!rows.length && <div className="rounded-2xl border border-dashed border-slate-700/35 p-6 text-sm text-slate-400">No rows in this workflow bucket.</div>}
      </div>
    </PanelFrame>
  );
}

export default function OpsBoard({ overview, onSelect }) {
  const sections = overview?.sections || {};
  return (
    <div className="grid gap-5">
      <SlateSignalMap sections={sections} />
      <MultiMarketSignals summary={overview?.multi_market_summary} />
      <Section
        title="Priority Signals"
        subtitle="Highest priority model signals for the current snapshot window."
        rows={sections.top_bettable || []}
        onSelect={onSelect}
        showModelGadget
      />
      <Section
        title="Watchlist"
        subtitle="Positive setups that still need temporal confirmation."
        rows={sections.watchlist || []}
        onSelect={onSelect}
      />
      <Section
        title="Observation Only"
        subtitle="Informative states that do not clear current signal-priority thresholds."
        rows={sections.no_action || []}
        onSelect={onSelect}
      />
      <Section
        title="Negative Value Signals"
        subtitle="Sides priced above modeled fairness or carrying structural risk."
        rows={sections.fades || []}
        onSelect={onSelect}
      />
    </div>
  );
}
