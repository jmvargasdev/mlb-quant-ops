export default function SnapshotDensityPanel({ health, overview }) {
  const density = health.timeline_density || {};
  return (
    <section className="panel rounded-3xl p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Snapshot Density</h2>
        <p className="mt-1 text-sm text-slate-400">Refresh cadence is driven by operational window and latest snapshot detection.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-700/35 p-4">
          <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Latest Signature</div>
          <div className="mt-2 break-all text-sm text-white">{overview.meta.latest_snapshot_signature}</div>
        </div>
        <div className="rounded-2xl border border-slate-700/35 p-4">
          <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Refresh Policy</div>
          <div className="mt-2 text-sm text-white">{overview.meta.refresh_policy.profile}</div>
          <div className="mt-1 text-xs text-slate-400">{Math.round(overview.meta.refresh_policy.interval_ms / 1000)}s polling</div>
        </div>
      </div>
      <div className="mt-4">
        <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Captured Labels</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(density.labels_present || []).map((label) => (
            <span key={label} className="mono rounded-full border border-slate-500/30 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-200">
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
