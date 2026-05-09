import PanelFrame from '../../../shared/components/PanelFrame';
import SignalPill from '../../../shared/components/SignalPill';

function toneForDifference(value) {
  if (value === null || value === undefined || value === 0) return 'neutral';
  return value > 0 ? 'warning' : 'positive';
}

function formatRankShift(value) {
  if (value === null || value === undefined) return 'n/a';
  if (value === 0) return 'flat';
  return value > 0 ? `down ${value}` : `up ${Math.abs(value)}`;
}

export default function RankingExplainabilitySection({ data }) {
  const rows = data?.divergences || [];

  return (
    <PanelFrame
      title="Ranking Explainability"
      subtitle="Why Daily Ops raw edge rankings and memo operational conviction rankings diverge without being inconsistent."
    >
      <div className="grid gap-3 text-sm text-slate-300">
        <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
          Daily Ops ranks raw quantitative opportunity. The memo ranks operational conviction after timing quality, persistence validation, lifecycle and volatility adjustment are applied.
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        {rows.map((row) => (
          <div key={`${row.game_id}:${row.side}`} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-white">{row.team}</div>
                <div className="mt-1 text-xs text-slate-400">{row.matchup}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <SignalPill tone="info">dashboard #{row.dashboard_rank ?? 'n/a'}</SignalPill>
                <SignalPill tone={toneForDifference(row.rank_difference)}>memo #{row.memo_rank ?? 'n/a'}</SignalPill>
                <SignalPill tone={toneForDifference(row.rank_difference)}>{formatRankShift(row.rank_difference)}</SignalPill>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
              <div className="rounded-xl border border-slate-700/30 px-3 py-2">
                <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Quant</div>
                <div className="mt-1 text-white">{row.quant_reading}</div>
              </div>
              <div className="rounded-xl border border-slate-700/30 px-3 py-2">
                <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Persistence</div>
                <div className="mt-1 text-white">{row.persistence_reading}</div>
              </div>
              <div className="rounded-xl border border-slate-700/30 px-3 py-2">
                <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Timing</div>
                <div className="mt-1 text-white">{row.timing_reading}</div>
              </div>
              <div className="rounded-xl border border-slate-700/30 px-3 py-2">
                <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Volatility</div>
                <div className="mt-1 text-white">{row.volatility_reading}</div>
              </div>
              <div className="rounded-xl border border-slate-700/30 px-3 py-2">
                <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Conviction</div>
                <div className="mt-1 text-white">{row.operational_reading}</div>
              </div>
              <div className="rounded-xl border border-slate-700/30 px-3 py-2">
                <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Timing Penalty</div>
                <div className="mt-1 text-white">{row.timing_penalty ?? 'n/a'}</div>
              </div>
              <div className="rounded-xl border border-slate-700/30 px-3 py-2">
                <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Vol Penalty</div>
                <div className="mt-1 text-white">{row.volatility_penalty ?? 'n/a'}</div>
              </div>
              <div className="rounded-xl border border-slate-700/30 px-3 py-2">
                <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Lifecycle Bonus</div>
                <div className="mt-1 text-white">{row.lifecycle_bonus ?? 'n/a'}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {(row.reason_codes || []).map((code) => (
                <SignalPill key={code} tone={code.includes('STRONG') ? 'positive' : code.includes('LOW') || code.includes('PENALTY') || code.includes('DECAY') ? 'warning' : 'info'}>
                  {code}
                </SignalPill>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-700/30 bg-slate-950/45 px-4 py-3 text-sm text-slate-300">
              {row.interpretation}
            </div>
          </div>
        ))}
        {!rows.length && <div className="rounded-2xl border border-dashed border-slate-700/35 p-6 text-sm text-slate-400">No material ranking divergence detected.</div>}
      </div>
    </PanelFrame>
  );
}
