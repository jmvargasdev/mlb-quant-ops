import { timeAgo, timestampFullWithZone } from '../lib/formatters';
import { useLanguage } from '../i18n/LanguageProvider';

function lagText(scheduleTiming, t) {
  const minutes = scheduleTiming?.schedule_lag_minutes;
  const windows = scheduleTiming?.schedule_lag_windows;
  const parts = [];
  if (minutes !== null && minutes !== undefined) parts.push(`${minutes}m ${t('snapshot.lag')}`);
  if (windows !== null && windows !== undefined) parts.push(`${windows} ${t('snapshot.windowsBehind')}`);
  return parts.join(' / ') || t('snapshot.lagNA');
}

export function isSnapshotStale(scheduleTiming) {
  const minutes = Number(scheduleTiming?.schedule_lag_minutes);
  const windows = Number(scheduleTiming?.schedule_lag_windows);
  return scheduleTiming?.schedule_state === 'behind_schedule'
    || (Number.isFinite(minutes) && minutes > 30)
    || (Number.isFinite(windows) && windows > 0);
}

export default function SnapshotFreshness({ at, scheduleTiming, compact = false }) {
  const { t } = useLanguage();
  const stale = isSnapshotStale(scheduleTiming);
  const tone = stale
    ? 'border-amber-300/25 bg-amber-300/10 text-amber-200'
    : 'border-cyan-300/25 bg-cyan-300/10 text-cyan-200';
  const label = stale ? t('snapshot.stale') : t('snapshot.last');

  if (compact) {
    return (
      <span className={`mono rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.22em] ${tone}`}>
        {label}: {timestampFullWithZone(at)} ({lagText(scheduleTiming, t)})
      </span>
    );
  }

  return (
    <div>
      <div className={`mono text-[11px] uppercase tracking-[0.25em] ${stale ? 'text-amber-200' : 'text-cyan-200'}`}>{label}</div>
      <div className="mt-1 text-sm text-white">{timestampFullWithZone(at)}</div>
      <div className={`mt-1 mono text-[10px] uppercase tracking-[0.18em] ${stale ? 'text-amber-200/80' : 'text-cyan-200/80'}`}>
        {timeAgo(at)} / {lagText(scheduleTiming, t)}
      </div>
    </div>
  );
}
