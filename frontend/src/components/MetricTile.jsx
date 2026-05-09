const STATUS_CLASS = {
  healthy: 'metric-good',
  degraded: 'metric-warn',
  incomplete: 'metric-bad',
  stale: 'metric-bad',
  unknown: 'text-slate-400',
};

export default function MetricTile({ metric }) {
  return (
    <div className="panel rounded-2xl px-4 py-4">
      <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">{metric.label}</div>
      <div className={`mt-3 text-3xl font-semibold ${STATUS_CLASS[metric.status] || STATUS_CLASS.unknown}`}>
        {metric.display ?? 'n/a'}
      </div>
      <div className="mt-2 text-xs text-slate-400">{metric.status}</div>
    </div>
  );
}
