import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import CompactStatGrid from '../../../shared/components/CompactStatGrid';
import PanelFrame from '../../../shared/components/PanelFrame';
import { fmt } from '../../../shared/lib/formatters';
import { ChartFrame, researchPct } from '../shared/ui';

export default function TimingQualitySection({ data }) {
  const bestWindow = data?.best_window || null;
  const windows = data?.windows || [];
  const summary = data?.summary || {};

  return (
    <PanelFrame
      title="Timing Quality"
      subtitle="Window-by-window comparison of persistence, durability and correction behavior across the operational research schedule."
    >
      <CompactStatGrid
        items={[
          { label: 'Best Timing Window', value: bestWindow?.window || 'n/a', render: (value) => value },
          { label: 'Avg Timing Quality', value: summary.average_timing_quality_score, digits: 2 },
          { label: 'Timing Windows', value: summary.timing_window_count, digits: 0 },
          { label: 'Replay Snapshots', value: summary.replay_snapshot_count, digits: 0 },
          {
            label: 'Best Window Samples',
            value: bestWindow?.sample_count ?? bestWindow?.count ?? 0,
            digits: 0,
          },
        ]}
        columns="md:grid-cols-2 xl:grid-cols-5"
      />

      <div className="mt-4 grid gap-4 2xl:grid-cols-2">
        <ChartFrame title="Timing Window Comparison" subtitle="Average timing quality and persistence by window.">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={windows}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="window" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => fmt(value, 2)} />
              <Bar yAxisId="left" dataKey="average_timing_quality" fill="#71c7ff" radius={[6, 6, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="average_persistence" stroke="#3ddc97" strokeWidth={2} dot={{ r: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame title="Durability And Correction Speed" subtitle="How durable the edge remains and how quickly the market corrects by window.">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={windows}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="window" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => fmt(value, 3)} />
              <Line yAxisId="left" type="monotone" dataKey="average_durability" stroke="#f4c95d" strokeWidth={2} dot={{ r: 2 }} />
              <Line yAxisId="right" type="monotone" dataKey="average_correction_speed" stroke="#ff6b6b" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {windows.map((row) => (
          <div key={row.window} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
            <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{row.window}</div>
            <div className="mt-2 text-sm font-semibold text-white">{row.sample_count} comparisons</div>
            <div className="mt-2 text-xs text-slate-300">Timing {fmt(row.average_timing_quality, 2)} / Persistence {fmt(row.average_persistence, 2)}</div>
            <div className="mt-1 text-xs text-slate-300">Durability {fmt(row.average_durability, 2)} / Stabilized {researchPct(row.stabilized_rate, 2)}</div>
          </div>
        ))}
      </div>
    </PanelFrame>
  );
}
