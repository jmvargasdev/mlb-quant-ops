import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import CompactStatGrid from '../../../shared/components/CompactStatGrid';
import PanelFrame from '../../../shared/components/PanelFrame';
import { fmt } from '../../../shared/lib/formatters';
import { ChartFrame, probabilityPoints } from '../shared/ui';

export default function ClvPreparationSection({ data }) {
  const summary = data?.summary || {};
  const validationBuckets = summary.validation_bucket_counts || {};
  const windowCloseDeltas = data?.window_close_deltas || [];
  const stabilityOutcomes = data?.stability_outcomes || [];
  const records = data?.records || [];

  return (
    <PanelFrame
      title="CLV Preparation"
      subtitle="Close-proxy readiness without fake ROI: persistence vs close, timing vs close and stable vs unstable outcomes."
    >
      <CompactStatGrid
        items={[
          { label: 'Avg Persistence', value: summary.average_edge_persistence_score, digits: 2 },
          { label: 'Avg Half-Life', value: summary.average_edge_half_life_hours, digits: 2 },
          { label: 'Survived', value: validationBuckets.survived || 0, digits: 0 },
          { label: 'Rejected', value: validationBuckets.rejected || 0, digits: 0 },
        ]}
      />

      <div className="mt-4 grid gap-4 2xl:grid-cols-2">
        <ChartFrame title="Snapshot vs Close Proxy" subtitle="Average close dislocation with persistence and timing overlays by window.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={windowCloseDeltas}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="window" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value, name) => (name === 'average_abs_close_delta' ? probabilityPoints(value) : fmt(value, 2))} />
              <Bar yAxisId="left" dataKey="average_abs_close_delta" fill="#71c7ff" radius={[6, 6, 0, 0]} />
              <Bar yAxisId="right" dataKey="average_persistence" fill="#3ddc97" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame title="Stable vs Unstable Outcomes" subtitle="Validation buckets split by current market regime.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stabilityOutcomes}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="label" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="survived" stackId="a" fill="#3ddc97" radius={[6, 6, 0, 0]} />
              <Bar dataKey="rejected" stackId="a" fill="#ff6b6b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-700/35 bg-slate-950/35 p-4">
        <div className="text-sm font-semibold text-white">Preparation Tape</div>
        <div className="mt-1 text-xs text-slate-400">Operational view of persistence, timing and close dislocation for current research rows.</div>
        <div className="mt-4 grid gap-3">
          {records.slice(0, 12).map((row) => (
            <div key={`${row.game_id}:${row.side}`} className="rounded-2xl border border-slate-700/30 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-white">{row.team}</div>
                  <div className="mt-1 text-xs text-slate-400">{row.matchup}</div>
                </div>
                <div className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{row.best_window}</div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-300 md:grid-cols-4">
                <div>Persistence {fmt(row.edge_persistence_score, 2)}</div>
                <div>Timing {fmt(row.timing_quality_score, 2)}</div>
                <div>Close delta {probabilityPoints(row.close_delta_implied)}</div>
                <div>{row.market_regime}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PanelFrame>
  );
}
