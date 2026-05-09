import { workspaceById } from './workspaces';
import WorkspaceHeader from '../shared/components/WorkspaceHeader';
import WorkspaceSidebar from '../shared/components/WorkspaceSidebar';
import { usePortalOverview } from '../shared/hooks/usePortalOverview';
import { useWorkspaceState } from '../shared/hooks/useWorkspaceState';
import { useFocusedGame } from '../shared/hooks/useFocusedGame';
import DailyOpsWorkspace from '../features/daily-ops/DailyOpsWorkspace';
import MarketStructureWorkspace from '../features/market-structure/MarketStructureWorkspace';
import ReplayWorkspace from '../features/replay/ReplayWorkspace';
import OpsHealthWorkspace from '../features/ops-health/OpsHealthWorkspace';
import ResearchWorkspace from '../workspaces/research/ResearchWorkspace';
import DecisionPanelWorkspace from '../workspaces/decision-panel/DecisionPanelWorkspace';
import { fmt, statusTone, timeAgo, timestampFull } from '../shared/lib/formatters';

function WorkspaceRenderer({ workspaceId, overview, detail, onSelectGame, status }) {
  switch (workspaceId) {
    case 'decision-panel':
      return <DecisionPanelWorkspace overview={overview} status={status} active />;
    case 'market-structure':
      return <MarketStructureWorkspace overview={overview} detail={detail} />;
    case 'replay':
      return <ReplayWorkspace detail={detail} />;
    case 'research':
      return <ResearchWorkspace overview={overview} status={status} active />;
    case 'ops-health':
      return <OpsHealthWorkspace overview={overview} status={status} />;
    case 'daily-ops':
    default:
      return <DailyOpsWorkspace overview={overview} detail={detail} onSelectGame={onSelectGame} />;
  }
}

export default function App() {
  const { overview, status } = usePortalOverview();
  const safeOverview = overview || {
    meta: {},
    metrics: [],
    sections: {
      top_bettable: [],
      watchlist: [],
      no_action: [],
      fades: [],
    },
    operational_health: {},
    volatility_leaders: [],
    persistence_leaders: [],
    clv_preparation: {},
    game_index: [],
  };
  const initialGameId = safeOverview.sections.top_bettable?.[0]?.game_id || safeOverview.game_index?.[0]?.game_id || null;
  const {
    workspaceId,
    setWorkspaceId,
    workspace,
    focusedGameId,
    setFocusedGameId,
  } = useWorkspaceState(initialGameId);
  const { detail, error } = useFocusedGame(focusedGameId, safeOverview.meta?.latest_snapshot_signature);

  const resolvedWorkspace = workspaceById(workspaceId);
  const pipelineHealth = safeOverview.operational_health?.pipeline_health_score;
  const snapshotDensity = safeOverview.operational_health?.snapshot_density_score;
  const refreshProfile = safeOverview.meta?.refresh_policy?.profile || 'n/a';
  const scheduleTiming = safeOverview.meta?.schedule_timing || {};
  const processUpdatedAt = scheduleTiming.process_updated_at || safeOverview.meta?.generated_at || status.lastUpdated;
  const latestSnapshotAt = scheduleTiming.last_snapshot_captured_at || safeOverview.meta?.latest_snapshot_time || status.latestSnapshotAt || null;
  const nextScheduledSnapshot = scheduleTiming.next_scheduled_snapshot || 'n/a';
  const scheduleLagMinutes = scheduleTiming.schedule_lag_minutes;
  const scheduleLagWindows = scheduleTiming.schedule_lag_windows;

  if (status.loading && !overview) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-300">Loading live MLB operations state...</div>;
  }

  if ((status.error || error) && !overview) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-rose-300">{status.error || error}</div>;
  }

  return (
    <div className="min-h-screen px-4 py-4 sm:px-5 lg:px-6">
      <div className="mx-auto mb-5 max-w-[2000px]">
        <section className="panel panel-strong rounded-3xl border border-slate-700/40 px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mono text-[11px] uppercase tracking-[0.35em] text-emerald-300/80">Operational heartbeat</div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="text-2xl font-semibold text-white">Last process update: {timestampFull(processUpdatedAt)}</div>
                <span className="mono rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-sky-200">
                  {timeAgo(processUpdatedAt)}
                </span>
                <span className="mono rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-emerald-200">
                  Last snapshot: {timestampFull(latestSnapshotAt)}
                </span>
                <span className="mono rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-cyan-200">
                  Next snapshot: {nextScheduledSnapshot}
                </span>
                <span className="mono rounded-full border border-slate-500/30 bg-slate-800/60 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-200">
                  lag {scheduleLagMinutes === null ? 'n/a' : `${scheduleLagMinutes}m`}
                </span>
                <span className="mono rounded-full border border-slate-500/30 bg-slate-800/60 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-200">
                  window lag {scheduleLagWindows === null ? 'n/a' : `${scheduleLagWindows}`}
                </span>
                <span className="mono rounded-full border border-slate-500/30 bg-slate-800/60 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-200">
                  refresh {refreshProfile}
                </span>
              </div>
              <p className="mt-2 max-w-4xl text-sm text-slate-300">
                Estado vivo del cockpit. La vista prioriza salud operacional, densidad temporal y frescura del mercado sobre cualquier panel secundario.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/55 px-4 py-3">
                <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Pipeline Health</div>
                <div className={`mt-1 text-2xl font-semibold ${statusTone(pipelineHealth)}`}>{fmt(pipelineHealth, 1)}</div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/55 px-4 py-3">
                <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Snapshot Density</div>
                <div className={`mt-1 text-2xl font-semibold ${statusTone(snapshotDensity)}`}>{fmt(snapshotDensity, 1)}</div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/55 px-4 py-3">
                <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Snapshot Signature</div>
                <div className="mt-1 truncate text-sm text-white">{safeOverview.meta?.latest_snapshot_signature || 'n/a'}</div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="mx-auto grid max-w-[2000px] gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
        <WorkspaceSidebar
          activeWorkspace={workspaceId}
          onChange={setWorkspaceId}
          overview={safeOverview}
          gameId={focusedGameId}
          onSelectGame={setFocusedGameId}
        />

        <main className="grid gap-5">
          <WorkspaceHeader workspace={resolvedWorkspace} overview={safeOverview} status={status} detail={detail} />
          <WorkspaceRenderer
            workspaceId={workspaceId}
            overview={safeOverview}
            detail={detail}
            onSelectGame={setFocusedGameId}
            status={status}
          />
        </main>
      </div>
    </div>
  );
}
