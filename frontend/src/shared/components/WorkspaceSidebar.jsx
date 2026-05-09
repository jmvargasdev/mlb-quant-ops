import { timeAgo, timestampFull } from '../lib/formatters';
import { WORKSPACES } from '../../app/workspaces';

export default function WorkspaceSidebar({ activeWorkspace, onChange, overview, gameId, onSelectGame }) {
  const games = overview?.game_index || [];
  const scheduleTiming = overview?.meta?.schedule_timing || {};
  const processUpdatedAt = scheduleTiming.process_updated_at || overview?.meta?.generated_at || null;
  const latestSnapshotAt = scheduleTiming.last_snapshot_captured_at || overview?.meta?.latest_snapshot_time || null;

  return (
    <aside className="panel panel-strong rounded-3xl p-4 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:overflow-hidden">
      <div className="border-b border-slate-700/40 pb-4">
        <div className="mono text-[11px] uppercase tracking-[0.35em] text-sky-300/80">MLB Quant Ops</div>
        <div className="mt-2 text-lg font-semibold text-white">Operational Workspaces</div>
        <div className="mt-1 text-sm text-slate-400">
          Temporal-first cockpit over real scoring, persistence, replay and pipeline health.
        </div>
      </div>

      <nav className="mt-4 grid gap-2">
        {WORKSPACES.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            onClick={() => onChange(workspace.id)}
            className={`rounded-2xl border px-3 py-3 text-left transition ${
              activeWorkspace === workspace.id
                ? 'border-sky-300/50 bg-sky-300/8'
                : 'border-slate-700/35 bg-slate-900/30 hover:border-slate-500/45'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">{workspace.label}</div>
              <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{workspace.shortLabel}</div>
            </div>
            <div className="mt-1 text-xs text-slate-400">{workspace.description}</div>
          </button>
        ))}
      </nav>

      <div className="mt-5 border-t border-slate-700/40 pt-4">
        <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Focus Game</div>
        <select
          value={gameId || ''}
          onChange={(event) => onSelectGame(Number(event.target.value))}
          className="mt-3 w-full rounded-2xl border border-slate-700/40 bg-slate-950/60 px-3 py-3 text-sm text-white outline-none"
        >
          {games.map((game) => (
            <option key={game.game_id} value={game.game_id}>
              {game.matchup}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5 grid gap-3 border-t border-slate-700/40 pt-4 text-sm">
        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/8 px-3 py-3">
          <div className="mono text-[11px] uppercase tracking-[0.25em] text-emerald-200">Last process update</div>
          <div className="mt-2 text-sm text-white">{timestampFull(processUpdatedAt)}</div>
          <div className="mt-1 mono text-[10px] uppercase tracking-[0.18em] text-emerald-200/80">{timeAgo(processUpdatedAt)}</div>
          <div className="mt-3 mono text-[11px] uppercase tracking-[0.25em] text-cyan-200">Last snapshot</div>
          <div className="mt-1 text-sm text-white">{timestampFull(latestSnapshotAt)}</div>
          <div className="mt-1 mono text-[10px] uppercase tracking-[0.18em] text-cyan-200/80">{timeAgo(latestSnapshotAt)}</div>
          <div className="mt-3 mono text-[11px] uppercase tracking-[0.25em] text-amber-200">Next snapshot</div>
          <div className="mt-1 text-sm text-white">{scheduleTiming.next_scheduled_snapshot || 'n/a'}</div>
          <div className="mt-1 mono text-[10px] uppercase tracking-[0.18em] text-amber-200/80">
            lag {scheduleTiming.schedule_lag_minutes === null || scheduleTiming.schedule_lag_minutes === undefined ? 'n/a' : `${scheduleTiming.schedule_lag_minutes}m`}
          </div>
        </div>
        <div>
          <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Refresh Profile</div>
          <div className="mt-1 text-white">{overview?.meta?.refresh_policy?.profile || 'n/a'}</div>
        </div>
        <div>
          <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Snapshot Window</div>
          <div className="mt-1 text-white">{overview?.meta?.latest_snapshot_label || 'n/a'}</div>
        </div>
        <div>
          <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Slate Date</div>
          <div className="mt-1 text-white">{overview?.meta?.date || 'n/a'}</div>
        </div>
      </div>
    </aside>
  );
}
