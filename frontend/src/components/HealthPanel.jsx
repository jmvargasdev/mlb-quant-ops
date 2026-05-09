import { humanizeFlag } from '../shared/lib/formatters';

function rowStatus(value) {
  if (value === null || value === undefined) return 'text-slate-400';
  if (value >= 85) return 'metric-good';
  if (value >= 65) return 'metric-warn';
  return 'metric-bad';
}

export default function HealthPanel({ health }) {
  const rows = [
    ['Pipeline', health.pipeline_health_score],
    ['Source Reliability', health.source_reliability_score],
    ['Schema Consistency', health.schema_consistency_score],
    ['Market Data Quality', health.market_data_quality_score],
    ['Snapshot Density', health.snapshot_density_score],
  ];

  return (
    <section className="panel rounded-3xl p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Operational Health</h2>
        <p className="mt-1 text-sm text-slate-400">Live health view over extraction reliability, schema continuity and timeline completeness.</p>
      </div>
      <div className="grid gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between rounded-2xl border border-slate-700/35 px-4 py-3">
            <div className="text-sm text-slate-300">{label}</div>
            <div className={`mono text-sm ${rowStatus(value)}`}>{value?.toFixed?.(1) ?? 'n/a'}</div>
          </div>
        ))}
      </div>
      <div className="mt-5">
        <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Operational Flags</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(health.operational_flags || []).map((flag) => (
            <span key={flag} className="mono rounded-full border border-amber-300/30 bg-amber-300/8 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-amber-200">
              {humanizeFlag(flag)}
            </span>
          ))}
          {!health.operational_flags?.length && <span className="text-sm text-slate-400">No active operational flags.</span>}
        </div>
      </div>
    </section>
  );
}
