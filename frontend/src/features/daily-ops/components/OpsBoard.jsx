import PanelFrame from '../../../shared/components/PanelFrame';
import SignalPill from '../../../shared/components/SignalPill';
import { fmt, humanizeFlag, pct, signedPoints } from '../../../shared/lib/formatters';

function toneFromTrend(trend) {
  if (trend === 'edge_strengthening' || trend === 'stable_edge') return 'positive';
  if (trend === 'edge_collapse' || trend === 'edge_decay') return 'danger';
  return 'neutral';
}

function Card({ card, onSelect }) {
  const categoryLabel = card.category === 'top_bettable'
    ? 'action'
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

function Section({ title, subtitle, rows, onSelect, columnsClass = 'grid gap-3 xl:grid-cols-1' }) {
  return (
    <PanelFrame title={title} subtitle={subtitle}>
      <div className={columnsClass}>
        {rows.map((row) => <Card key={`${row.game_id}-${row.selection_team}`} card={row} onSelect={onSelect} />)}
        {!rows.length && <div className="rounded-2xl border border-dashed border-slate-700/35 p-6 text-sm text-slate-400">No rows in this workflow bucket.</div>}
      </div>
    </PanelFrame>
  );
}

export default function OpsBoard({ overview, onSelect }) {
  const sections = overview?.sections || {};
  return (
    <div className="grid gap-5">
      <Section
        title="Bettable Leans"
        subtitle="Highest priority actions for the current snapshot window."
        rows={sections.top_bettable || []}
        onSelect={onSelect}
      />
      <Section
        title="Watchlist"
        subtitle="Positive setups that still need temporal confirmation."
        rows={sections.watchlist || []}
        onSelect={onSelect}
      />
      <Section
        title="No Action"
        subtitle="Informative but non-actionable states under current price and risk."
        rows={sections.no_action || []}
        onSelect={onSelect}
      />
      <Section
        title="Fades"
        subtitle="Sides priced above modeled fairness or carrying structural risk."
        rows={sections.fades || []}
        onSelect={onSelect}
      />
    </div>
  );
}
