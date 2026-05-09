import SignalPill from '../../../shared/components/SignalPill';

export function researchPct(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  return `${Number(value).toFixed(digits)}%`;
}

export function probabilityPoints(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  const numeric = Number(value) * 100;
  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${numeric.toFixed(digits)} pts`;
}

export function lifecycleTone(value) {
  if (value === 'persistent' || value === 'survived') return 'positive';
  if (value === 'strengthening') return 'info';
  if (value === 'collapsing' || value === 'rejected') return 'danger';
  return 'warning';
}

export function ChartFrame({ title, subtitle, children, height = 'h-72' }) {
  return (
    <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold text-white">{title}</div>
        {subtitle && <div className="mt-1 text-xs text-slate-400">{subtitle}</div>}
      </div>
      <div className={height}>{children}</div>
    </div>
  );
}

export function EdgeList({ title, subtitle, rows = [] }) {
  return (
    <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold text-white">{title}</div>
        {subtitle && <div className="mt-1 text-xs text-slate-400">{subtitle}</div>}
      </div>
      <div className="grid gap-3">
        {rows.map((row) => (
          <div key={`${row.game_id}:${row.side}`} className="rounded-2xl border border-slate-700/30 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">{row.team}</div>
                <div className="mt-1 text-xs text-slate-400">{row.matchup}</div>
              </div>
              <SignalPill tone={lifecycleTone(row.lifecycle || row.validation_bucket)}>{row.lifecycle || row.validation_bucket}</SignalPill>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
              <div>
                <div className="mono uppercase tracking-[0.2em] text-slate-500">Persistence</div>
                <div className="mt-1 text-white">{row.edge_persistence_score?.toFixed?.(2) ?? row.edge_persistence_score ?? 'n/a'}</div>
              </div>
              <div>
                <div className="mono uppercase tracking-[0.2em] text-slate-500">Timing</div>
                <div className="mt-1 text-white">{row.timing_quality_score?.toFixed?.(2) ?? row.timing_quality_score ?? 'n/a'}</div>
              </div>
              <div>
                <div className="mono uppercase tracking-[0.2em] text-slate-500">Close Delta</div>
                <div className="mt-1 text-white">{probabilityPoints(row.close_delta_implied)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HeatmapGrid({ rows = [], columns = [], values = [], formatter = (value) => value }) {
  const maxCount = Math.max(1, ...values.map((item) => item.count || 0));

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] gap-2" style={{ gridTemplateColumns: `150px repeat(${columns.length}, minmax(88px, 1fr))` }}>
        <div />
        {columns.map((column) => (
          <div key={column} className="mono px-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            {column}
          </div>
        ))}
        {rows.map((row) => (
          <div
            key={row}
            className="contents"
          >
            <div key={`${row}-label`} className="mono flex items-center px-2 text-[10px] uppercase tracking-[0.18em] text-slate-400">
              {row}
            </div>
            {columns.map((column) => {
              const cell = values.find((item) => item.regime === row && item.window === column) || {};
              const intensity = Math.max(0.08, (cell.count || 0) / maxCount);
              return (
                <div
                  key={`${row}:${column}`}
                  className="rounded-xl border border-slate-700/30 px-2 py-3 text-center"
                  style={{ backgroundColor: `rgba(113, 199, 255, ${intensity * 0.35})` }}
                >
                  <div className="text-sm font-semibold text-white">{cell.count || 0}</div>
                  <div className="mt-1 text-[11px] text-slate-300">{formatter(cell)}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
