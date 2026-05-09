import { statusTone } from '../lib/formatters';

export default function MetricStrip({ metrics }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="panel rounded-2xl px-4 py-3">
          <div className="mono text-[11px] uppercase tracking-[0.24em] text-slate-500">{metric.label}</div>
          <div className={`mt-2 text-2xl font-semibold ${statusTone(metric.value)}`}>{metric.display ?? 'n/a'}</div>
          <div className="mt-1 text-xs text-slate-400">{metric.status}</div>
        </div>
      ))}
    </div>
  );
}
