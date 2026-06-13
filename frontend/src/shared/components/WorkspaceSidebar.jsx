import { timeAgo, timestampFull } from '../lib/formatters';
import { WORKSPACE_DEFINITIONS, localizeWorkspace } from '../../app/workspaces';
import SnapshotFreshness from './SnapshotFreshness';
import { useLanguage } from '../i18n/LanguageProvider';

export default function WorkspaceSidebar({ activeWorkspace, onChange, overview, gameId, onSelectGame }) {
  const { t } = useLanguage();
  const games = overview?.game_index || [];
  const isAllocationWorkspace = activeWorkspace === 'decision-panel';
  const isHomeWorkspace = activeWorkspace === 'home';
  const workspaces = WORKSPACE_DEFINITIONS.map((workspace) => localizeWorkspace(workspace, t));
  const scheduleTiming = overview?.meta?.schedule_timing || {};
  const latestSnapshotAt = scheduleTiming.last_snapshot_captured_at || overview?.meta?.latest_snapshot_time || null;
  const processUpdatedAt = latestSnapshotAt || overview?.meta?.generated_at || scheduleTiming.process_updated_at || null;

  return (
    <aside className="panel panel-strong scrollbar-thin rounded-3xl p-4 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <div className="border-b border-slate-700/40 pb-4">
        <div className="text-2xl font-semibold tracking-tight text-white">MarketSentinel</div>
        <div className="mt-1 text-sm font-medium text-slate-300">MLB Quant Ops</div>
        <div className="mt-1 mono text-[11px] uppercase tracking-[0.28em] text-sky-300/80">Capital Intelligence Cockpit</div>
        <div className="mt-3 text-sm text-slate-400">
          {t('app.sidebarDescription')}
        </div>
        <div className="mt-4 mono text-[11px] uppercase tracking-[0.25em] text-slate-500">{t('app.decisionStack')}</div>
      </div>

      <nav className="mt-4 grid gap-2">
        {workspaces.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            onClick={() => onChange(workspace.id)}
            className={`rounded-2xl border px-3 py-3 text-left transition ${
              activeWorkspace === workspace.id
                ? 'border-sky-300/50 bg-sky-300/8'
                : 'border-slate-700/35 bg-slate-900/30 hover:border-slate-500/45'
            } ${workspace.id === 'home' ? 'px-2.5 py-2' : ''}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className={`font-semibold text-white ${workspace.id === 'home' ? 'text-[13px]' : 'text-sm'}`}>{workspace.label}</div>
              <div className={`mono uppercase tracking-[0.2em] text-slate-500 ${workspace.id === 'home' ? 'text-[9px]' : 'text-[10px]'}`}>{workspace.shortLabel}</div>
            </div>
            {workspace.id === 'home' ? (
              <div className="mt-1 text-[11px] leading-snug text-slate-400">
                {workspace.description}
              </div>
            ) : (
              <div className="mt-1 text-xs text-slate-400">{workspace.description}</div>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-5 border-t border-slate-700/40 pt-4">
        <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">
          {isAllocationWorkspace ? t('app.allocationContext') : isHomeWorkspace ? t('app.homeContext') : t('app.focusGame')}
        </div>
        {isAllocationWorkspace ? (
          <div className="mt-3 rounded-2xl border border-sky-300/20 bg-sky-300/6 px-3 py-3 text-sm text-slate-300">
            {t('app.allocationContextDescription')}
          </div>
        ) : isHomeWorkspace ? (
          <div className="mt-3 rounded-2xl border border-slate-700/35 bg-slate-950/35 px-3 py-3 text-sm text-slate-300">
            {t('app.homeContextDescription')}
          </div>
        ) : (
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
        )}
      </div>

      <div className="mt-5 grid gap-3 border-t border-slate-700/40 pt-4 text-sm">
        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/8 px-3 py-3">
          <div className="mono text-[11px] uppercase tracking-[0.25em] text-emerald-200">{t('app.lastProcessUpdate')}</div>
          <div className="mt-2 text-sm text-white">{timestampFull(processUpdatedAt)}</div>
          <div className="mt-1 mono text-[10px] uppercase tracking-[0.18em] text-emerald-200/80">{timeAgo(processUpdatedAt)}</div>
          <div className="mt-3">
            <SnapshotFreshness at={latestSnapshotAt} scheduleTiming={scheduleTiming} />
          </div>
          <div className="mt-3 mono text-[11px] uppercase tracking-[0.25em] text-amber-200">{t('app.nextSnapshot')}</div>
          <div className="mt-1 text-sm text-white">{scheduleTiming.next_scheduled_snapshot || 'n/a'}</div>
          <div className="mt-1 mono text-[10px] uppercase tracking-[0.18em] text-amber-200/80">
            {t('app.lag')} {scheduleTiming.schedule_lag_minutes === null || scheduleTiming.schedule_lag_minutes === undefined ? 'n/a' : `${scheduleTiming.schedule_lag_minutes}m`}
          </div>
        </div>
        <div>
          <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">{t('app.refreshProfile')}</div>
          <div className="mt-1 text-white">{overview?.meta?.refresh_policy?.profile || 'n/a'}</div>
        </div>
        <div>
          <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">{t('app.snapshotWindow')}</div>
          <div className="mt-1 text-white">{overview?.meta?.latest_snapshot_label || 'n/a'}</div>
        </div>
        <div>
          <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">{t('app.slateDate')}</div>
          <div className="mt-1 text-white">{overview?.meta?.date || 'n/a'}</div>
        </div>
      </div>
    </aside>
  );
}
