import { compactList, fmt, timeAgo, timestampFull } from '../lib/formatters';

export default function WorkspaceHeader({ workspace, overview, status, detail }) {
  const card = detail?.card || null;
  const scheduleTiming = overview?.meta?.schedule_timing || {};
  const processUpdatedAt = scheduleTiming.process_updated_at || overview?.meta?.generated_at || status?.lastUpdated || null;
  const latestSnapshotAt = scheduleTiming.last_snapshot_captured_at || overview?.meta?.latest_snapshot_time || status?.latestSnapshotAt || null;
  return (
    <header className="panel panel-strong rounded-3xl px-5 py-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mono rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-emerald-200">
          Last process update: {timestampFull(processUpdatedAt)}
        </span>
        <span className="mono rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-sky-200">
          {timeAgo(processUpdatedAt)}
        </span>
        <span className="mono rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-cyan-200">
          Last snapshot: {timestampFull(latestSnapshotAt)}
        </span>
        <span className="mono rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-amber-200">
          Next snapshot: {scheduleTiming.next_scheduled_snapshot || 'n/a'}
        </span>
        <span className="mono rounded-full border border-slate-500/30 bg-slate-800/60 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-200">
          Lag: {scheduleTiming.schedule_lag_minutes === null || scheduleTiming.schedule_lag_minutes === undefined ? 'n/a' : `${scheduleTiming.schedule_lag_minutes}m`}
        </span>
      </div>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mono text-[11px] uppercase tracking-[0.35em] text-sky-300/75">{workspace.label}</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white xl:text-3xl">{workspace.question}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">{workspace.description}</p>
        </div>

        <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2 xl:min-w-[530px]">
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Last Refresh</div>
            <div className="mt-1 text-white">{timestampFull(processUpdatedAt)}</div>
          </div>
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Snapshot Signature</div>
            <div className="mt-1 text-white">{overview?.meta?.latest_snapshot_signature || 'n/a'}</div>
          </div>
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Refresh Policy</div>
            <div className="mt-1 text-white">
              {overview?.meta?.refresh_policy?.profile || 'n/a'} / {fmt((overview?.meta?.refresh_policy?.interval_ms || 0) / 1000, 0)}s
            </div>
          </div>
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Schedule Lag</div>
            <div className="mt-1 text-white">
              {scheduleTiming.schedule_lag_minutes === null || scheduleTiming.schedule_lag_minutes === undefined
                ? 'n/a'
                : `${scheduleTiming.schedule_lag_minutes}m / ${scheduleTiming.schedule_lag_windows ?? 0} windows`}
            </div>
          </div>
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Focused Matchup</div>
            <div className="mt-1 text-white">{card?.matchup || 'n/a'}</div>
          </div>
        </div>
      </div>

      {card && (
        <div className="mt-5 grid gap-3 border-t border-slate-700/35 pt-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Selection</div>
            <div className="mt-1 text-sm text-white">{card.selection_team}</div>
          </div>
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Risk Flags</div>
            <div className="mt-1 text-sm text-white">{compactList(card.risk_flags?.slice(0, 4))}</div>
          </div>
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Quant / Persist</div>
            <div className="mt-1 text-sm text-white">{fmt(card.quant_score, 2)} / {fmt(card.persistence_score, 1)}</div>
          </div>
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Vol / Trend</div>
            <div className="mt-1 text-sm text-white">{fmt(card.volatility_score, 1)} / {card.edge_trend}</div>
          </div>
        </div>
      )}
    </header>
  );
}
