import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import CompactStatGrid from '../../../shared/components/CompactStatGrid';
import PanelFrame from '../../../shared/components/PanelFrame';
import { ChartFrame, researchPct } from '../shared/ui';

export default function HistoricalMemorySection({ data }) {
  const bundles = data?.bundles || [];
  const persistenceHistory = data?.persistence_history || [];
  const timingHistory = data?.timing_history || [];
  const marketStructureHistory = data?.market_structure_history || [];

  return (
    <PanelFrame
      title="Historical Memory"
      subtitle="history.jsonl converted into accumulated research days, edge coverage and reusable market structure memory."
    >
      <CompactStatGrid
        items={[
          { label: 'Accumulated Days', value: data?.accumulated_research_days, digits: 0 },
          { label: 'Research Runs', value: data?.research_runs, digits: 0 },
          { label: 'Total Edges Studied', value: data?.total_edges_studied, digits: 0 },
          { label: 'Memory Bundles', value: bundles.length, digits: 0 },
        ]}
      />

      <div className="mt-4 grid gap-4 2xl:grid-cols-3">
        <ChartFrame title="Persistence History" subtitle="Run-by-run survival and persistence.">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={persistenceHistory}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="label" stroke="#8ca2b8" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value, name) => (name === 'edge_survival_rate' ? researchPct(value, 2) : value)} />
              <Line yAxisId="left" type="monotone" dataKey="average_persistence" stroke="#71c7ff" strokeWidth={2} dot={{ r: 2 }} />
              <Line yAxisId="right" type="monotone" dataKey="edge_survival_rate" stroke="#3ddc97" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame title="Timing History" subtitle="Timing quality and validation balance through time.">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timingHistory}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="label" stroke="#8ca2b8" tick={{ fontSize: 10 }} />
              <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="timing_quality" stroke="#f4c95d" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="survived" stroke="#3ddc97" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="rejected" stroke="#ff6b6b" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame title="Market Structure History" subtitle="Stable vs unstable market memory and line acceleration.">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={marketStructureHistory}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="label" stroke="#8ca2b8" tick={{ fontSize: 10 }} />
              <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="stable_markets" stroke="#3ddc97" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="unstable_markets" stroke="#ff6b6b" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="line_acceleration_mean" stroke="#71c7ff" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-700/35 bg-slate-950/35 p-4">
        <div className="text-sm font-semibold text-white">Memory Ledger</div>
        <div className="mt-1 text-xs text-slate-400">Bundle lineage used to reconstruct persistence and timing history.</div>
        <div className="mt-4 grid gap-3">
          {bundles.slice(-8).reverse().map((row) => (
            <div key={row.index} className="rounded-2xl border border-slate-700/30 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-white">{row.label}</div>
                <div className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{row.bundle_path}</div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-300 md:grid-cols-4">
                <div>Survival {researchPct(row.edge_survival_rate, 2)}</div>
                <div>Persistence {row.average_persistence?.toFixed?.(2) ?? row.average_persistence ?? 'n/a'}</div>
                <div>Timing {row.timing_quality?.toFixed?.(2) ?? row.timing_quality ?? 'n/a'}</div>
                <div>Stable {row.stable_markets ?? 'n/a'} / Unstable {row.unstable_markets ?? 'n/a'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PanelFrame>
  );
}
