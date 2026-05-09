import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import PanelFrame from '../../../shared/components/PanelFrame';
import { ChartFrame, researchPct } from '../shared/ui';

export default function PersistenceEvolutionSection({ data, memory }) {
  const history = data?.history || [];
  const survivalCurve = data?.survival_curve || [];
  const memoryHistory = memory?.market_structure_history || [];

  return (
    <PanelFrame
      title="Persistence Evolution"
      subtitle="Real historical runs from history.jsonl converted into usable persistence memory, survival curves and market state evolution."
    >
      <div className="grid gap-4 2xl:grid-cols-2">
        <ChartFrame title="Persistence Through Time" subtitle="Historical research runs, not mocked time buckets.">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
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

        <ChartFrame title="Survival Curve" subtitle="Share of edges that remain above persistence score thresholds.">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={survivalCurve}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="threshold" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => researchPct(value, 2)} />
              <Line type="monotone" dataKey="survival_rate" stroke="#f4c95d" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame title="Stable vs Unstable Memory" subtitle="Current research runs translated into usable market memory.">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={memoryHistory}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="label" stroke="#8ca2b8" tick={{ fontSize: 10 }} />
              <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="stable_markets" stackId="1" stroke="#3ddc97" fill="rgba(61,220,151,0.22)" />
              <Area type="monotone" dataKey="unstable_markets" stackId="1" stroke="#ff6b6b" fill="rgba(255,107,107,0.18)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartFrame>

        <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 p-4">
          <div className="text-sm font-semibold text-white">Evolution Samples</div>
          <div className="mt-1 text-xs text-slate-400">Latest persisted runs and bundle references used for this workspace.</div>
          <div className="mt-4 grid gap-3">
            {history.slice(-6).reverse().map((row) => (
              <div key={row.index} className="rounded-2xl border border-slate-700/30 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-white">{row.label}</div>
                  <div className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{row.bundle_path}</div>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-slate-300 sm:grid-cols-4">
                  <div>Survival {researchPct(row.edge_survival_rate, 2)}</div>
                  <div>Persistence {row.average_persistence?.toFixed?.(2) ?? row.average_persistence ?? 'n/a'}</div>
                  <div>Timing {row.timing_quality?.toFixed?.(2) ?? row.timing_quality ?? 'n/a'}</div>
                  <div>Stable {row.stable_markets ?? 'n/a'} / Unstable {row.unstable_markets ?? 'n/a'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PanelFrame>
  );
}
