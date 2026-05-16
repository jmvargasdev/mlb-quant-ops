export default function HeaderBar({ overview, status }) {
  return (
    <header className="panel panel-glow rounded-3xl px-6 py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mono text-xs uppercase tracking-[0.35em] text-sky-300/80">MarketSentinel</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Operational Market Intelligence Cockpit</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">
            Real-time quantitative operations view over live MLB acquisition, scoring, temporal structure, persistence and CLV preparation.
          </p>
        </div>
        <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2 lg:min-w-[420px]">
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Slate Date</div>
            <div className="mt-1 text-base text-white">{overview?.meta?.date || 'n/a'}</div>
          </div>
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Refresh Profile</div>
            <div className="mt-1 text-base text-white">{overview?.meta?.refresh_policy?.profile || 'n/a'}</div>
          </div>
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Snapshot Window</div>
            <div className="mt-1 text-base text-white">{overview?.meta?.latest_snapshot_label || 'unknown'}</div>
          </div>
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Last Refresh</div>
            <div className="mt-1 text-base text-white">
              {status?.lastUpdated ? new Date(status.lastUpdated).toLocaleTimeString() : 'pending'}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
