import { humanizeFlag } from '../shared/lib/formatters';

const TREND_STYLES = {
  edge_strengthening: 'border-emerald-400/35 bg-emerald-400/8',
  edge_collapse: 'border-rose-400/35 bg-rose-400/8',
  stable_edge: 'border-sky-400/35 bg-sky-400/8',
  edge_decay: 'border-amber-300/35 bg-amber-300/8',
  mixed: 'border-slate-500/30 bg-slate-500/8',
};

function format(value, digits = 1) {
  if (value === null || value === undefined) return 'n/a';
  return Number(value).toFixed(digits);
}

export default function EdgeCard({ card, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(card.game_id)}
      className={`panel ${selected ? 'ring-1 ring-sky-300/60' : ''} ${TREND_STYLES[card.edge_trend] || TREND_STYLES.mixed} rounded-2xl border px-4 py-4 text-left transition hover:-translate-y-0.5`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{card.selection_team}</div>
          <div className="mt-1 text-xs text-slate-400">{card.matchup}</div>
        </div>
        <div className="mono text-right text-xs text-slate-400">
          <div>{card.game_time_local || 'TBD'}</div>
          <div className="mt-1">{card.lean}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Edge</div>
          <div className="mt-1 text-lg font-semibold text-white">{format(card.edge_pct_points, 2)} pts</div>
        </div>
        <div>
          <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Quant</div>
          <div className="mt-1 text-lg font-semibold text-white">{format(card.quant_score, 2)}</div>
        </div>
        <div>
          <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Persist</div>
          <div className="mt-1 text-lg font-semibold text-white">{format(card.persistence_score, 1)}</div>
        </div>
        <div>
          <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Volatility</div>
          <div className="mt-1 text-lg font-semibold text-white">{format(card.volatility_score, 1)}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(card.risk_flags || []).slice(0, 4).map((flag) => (
          <span key={flag} className="mono rounded-full border border-slate-500/30 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
            {humanizeFlag(flag)}
          </span>
        ))}
      </div>
    </button>
  );
}
