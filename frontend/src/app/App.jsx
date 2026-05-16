import { localizeWorkspace, workspaceById } from './workspaces';
import WorkspaceHeader from '../shared/components/WorkspaceHeader';
import WorkspaceSidebar from '../shared/components/WorkspaceSidebar';
import LegalFooter from '../shared/components/LegalFooter';
import SnapshotFreshness from '../shared/components/SnapshotFreshness';
import { usePortalOverview } from '../shared/hooks/usePortalOverview';
import { useWorkspaceState } from '../shared/hooks/useWorkspaceState';
import { useFocusedGame } from '../shared/hooks/useFocusedGame';
import DailyOpsWorkspace from '../features/daily-ops/DailyOpsWorkspace';
import MarketStructureWorkspace from '../features/market-structure/MarketStructureWorkspace';
import ReplayWorkspace from '../features/replay/ReplayWorkspace';
import OpsHealthWorkspace from '../features/ops-health/OpsHealthWorkspace';
import ResearchWorkspace from '../workspaces/research/ResearchWorkspace';
import DecisionPanelWorkspace from '../workspaces/decision-panel/DecisionPanelWorkspace';
import HomeWorkspace from '../workspaces/home/HomeWorkspace';
import ResponsibleUseWorkspace from '../workspaces/responsible-use/ResponsibleUseWorkspace';
import { fmt, timeAgo } from '../shared/lib/formatters';
import { useLanguage } from '../shared/i18n/LanguageProvider';

function WorkspaceRenderer({ workspaceId, overview, detail, onSelectGame, onChangeWorkspace, status }) {
  switch (workspaceId) {
    case 'home':
      return <HomeWorkspace overview={overview} status={status} onNavigate={onChangeWorkspace} />;
    case 'decision-panel':
      return <DecisionPanelWorkspace overview={overview} status={status} active />;
    case 'daily-ops':
      return <DailyOpsWorkspace overview={overview} detail={detail} onSelectGame={onSelectGame} />;
    case 'market-structure':
      return <MarketStructureWorkspace overview={overview} detail={detail} />;
    case 'replay':
      return <ReplayWorkspace detail={detail} />;
    case 'research':
      return <ResearchWorkspace overview={overview} status={status} active />;
    case 'ops-health':
      return <OpsHealthWorkspace overview={overview} status={status} />;
    case 'responsible-use':
      return <ResponsibleUseWorkspace />;
    default:
      return <DecisionPanelWorkspace overview={overview} status={status} active />;
  }
}

export default function App() {
  const { t } = useLanguage();
  const { overview, status } = usePortalOverview();
  const safeOverview = overview || {
    meta: {},
    metrics: [],
    performance_dashboard: {},
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

  const resolvedWorkspace = localizeWorkspace(workspaceById(workspaceId), t);
  const pipelineHealth = safeOverview.operational_health?.pipeline_health_score;
  const snapshotDensity = safeOverview.operational_health?.snapshot_density_score;
  const refreshProfile = safeOverview.meta?.refresh_policy?.profile || 'n/a';
  const scheduleTiming = safeOverview.meta?.schedule_timing || {};
  const processUpdatedAt = scheduleTiming.process_updated_at || safeOverview.meta?.generated_at || status.lastUpdated;
  const latestSnapshotAt = scheduleTiming.last_snapshot_captured_at || safeOverview.meta?.latest_snapshot_time || status.latestSnapshotAt || null;
  const nextScheduledSnapshot = scheduleTiming.next_scheduled_snapshot || 'n/a';

  if (status.loading && !overview) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-300">{t('decision.loading')}</div>;
  }

  if ((status.error || error) && !overview) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-rose-300">{status.error || error}</div>;
  }

  return (
    <div className="min-h-screen px-4 py-4 sm:px-5 lg:px-6">
      {workspaceId !== 'home' && (
        <div className="mx-auto mb-4 max-w-[2000px]">
          <section className="panel panel-strong rounded-2xl border border-slate-700/40 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="mono rounded-full border border-emerald-300/25 bg-emerald-300/8 px-3 py-1 uppercase tracking-[0.18em] text-emerald-200">
                {t('app.pipelineHealth')}: {fmt(pipelineHealth, 1)}
              </span>
              <span className="mono rounded-full border border-sky-300/25 bg-sky-300/8 px-3 py-1 uppercase tracking-[0.18em] text-sky-200">
                {t('app.snapshotDensity')}: {fmt(snapshotDensity, 1)}
              </span>
              <SnapshotFreshness at={latestSnapshotAt} scheduleTiming={scheduleTiming} compact />
              <span className="mono rounded-full border border-slate-500/30 bg-slate-800/60 px-3 py-1 uppercase tracking-[0.18em] text-slate-200">
                {t('app.lastProcessUpdate')}: {timeAgo(processUpdatedAt)}
              </span>
              <span className="mono rounded-full border border-slate-500/30 bg-slate-800/60 px-3 py-1 uppercase tracking-[0.18em] text-slate-200">
                {t('app.nextSnapshot')}: {nextScheduledSnapshot}
              </span>
              <span className="mono rounded-full border border-slate-500/30 bg-slate-800/60 px-3 py-1 uppercase tracking-[0.18em] text-slate-200">
                {t('app.refresh')}: {refreshProfile}
              </span>
            </div>
          </section>
        </div>
      )}

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
            onChangeWorkspace={setWorkspaceId}
            status={status}
          />
        </main>
      </div>
      <LegalFooter />
    </div>
  );
}
