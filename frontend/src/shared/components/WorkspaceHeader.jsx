import { compactList, fmt, timeAgo, timestampFull } from '../lib/formatters';
import SnapshotFreshness from './SnapshotFreshness';
import { useLanguage } from '../i18n/LanguageProvider';

function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="inline-flex rounded-xl border border-slate-700/45 bg-slate-950/50 p-1">
      {['en', 'es'].map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLanguage(option)}
          className={`mono rounded-lg px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] transition ${
            language === option ? 'bg-sky-300/15 text-sky-100' : 'text-slate-500 hover:text-slate-200'
          }`}
        >
          {t(`language.${option}`)}
        </button>
      ))}
    </div>
  );
}

export default function WorkspaceHeader({ workspace, overview, status, detail }) {
  const { t } = useLanguage();
  const card = detail?.card || null;
  const isAllocationWorkspace = workspace?.id === 'decision-panel';
  const scheduleTiming = overview?.meta?.schedule_timing || {};
  const processUpdatedAt = scheduleTiming.process_updated_at || overview?.meta?.generated_at || status?.lastUpdated || null;
  const latestSnapshotAt = scheduleTiming.last_snapshot_captured_at || overview?.meta?.latest_snapshot_time || status?.latestSnapshotAt || null;
  return (
    <header className="panel panel-strong rounded-3xl px-5 py-5">
      {!isAllocationWorkspace && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="mono rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-emerald-200">
            {t('app.lastProcessUpdate')}: {timestampFull(processUpdatedAt)}
          </span>
          <span className="mono rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-sky-200">
            {timeAgo(processUpdatedAt)}
          </span>
          <SnapshotFreshness at={latestSnapshotAt} scheduleTiming={scheduleTiming} compact />
          <span className="mono rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-amber-200">
            {t('app.nextSnapshot')}: {scheduleTiming.next_scheduled_snapshot || 'n/a'}
          </span>
          <span className="mono rounded-full border border-slate-500/30 bg-slate-800/60 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-200">
            {t('app.lag')}: {scheduleTiming.schedule_lag_minutes === null || scheduleTiming.schedule_lag_minutes === undefined ? 'n/a' : `${scheduleTiming.schedule_lag_minutes}m`}
          </span>
        </div>
      )}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mono text-[11px] uppercase tracking-[0.35em] text-sky-300/75">{workspace.label}</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white xl:text-3xl">{workspace.question}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">{workspace.description}</p>
        </div>
        <div className="flex flex-col gap-3 xl:items-end">
          <LanguageToggle />

          {!isAllocationWorkspace && (
          <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2 xl:min-w-[530px]">
            <div>
              <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">{t('header.lastRefresh')}</div>
              <div className="mt-1 text-white">{timestampFull(processUpdatedAt)}</div>
            </div>
            <div>
              <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">{t('app.snapshotSignature')}</div>
              <div className="mt-1 text-white">{overview?.meta?.latest_snapshot_signature || 'n/a'}</div>
            </div>
            <div>
              <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">{t('header.refreshPolicy')}</div>
              <div className="mt-1 text-white">
                {overview?.meta?.refresh_policy?.profile || 'n/a'} / {fmt((overview?.meta?.refresh_policy?.interval_ms || 0) / 1000, 0)}s
              </div>
            </div>
            <div>
              <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">{t('header.scheduleLag')}</div>
              <div className="mt-1 text-white">
                {scheduleTiming.schedule_lag_minutes === null || scheduleTiming.schedule_lag_minutes === undefined
                  ? 'n/a'
                  : `${scheduleTiming.schedule_lag_minutes}m / ${scheduleTiming.schedule_lag_windows ?? 0} windows`}
              </div>
            </div>
            <div>
              <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">{t('header.focusedMatchup')}</div>
              <div className="mt-1 text-white">{card?.matchup || 'n/a'}</div>
            </div>
          </div>
          )}
        </div>
      </div>

      {isAllocationWorkspace && (
        <div className="mt-3 text-xs text-slate-500">
          {t('header.capitalActionsNote')}
        </div>
      )}

      {!isAllocationWorkspace && card && (
        <div className="mt-5 grid gap-3 border-t border-slate-700/35 pt-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">{t('header.selection')}</div>
            <div className="mt-1 text-sm text-white">{card.selection_team}</div>
          </div>
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">{t('header.riskFlags')}</div>
            <div className="mt-1 text-sm text-white">{compactList(card.risk_flags?.slice(0, 4))}</div>
          </div>
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">{t('header.quantPersist')}</div>
            <div className="mt-1 text-sm text-white">{fmt(card.quant_score, 2)} / {fmt(card.persistence_score, 1)}</div>
          </div>
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">{t('header.volTrend')}</div>
            <div className="mt-1 text-sm text-white">{fmt(card.volatility_score, 1)} / {card.edge_trend}</div>
          </div>
        </div>
      )}
    </header>
  );
}
