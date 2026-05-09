import {
  Bar,
  BarChart,
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
import { fmt } from '../../../shared/lib/formatters';
import { ChartFrame, EdgeList, researchPct } from '../shared/ui';

export default function PersistenceSummarySection({ data }) {
  const summary = data?.summary || {};
  const lifecycleCounts = data?.lifecycle_counts || [];
  const byWindow = data?.by_schedule_window || [];
  const strongestEdges = data?.strongest_edges || [];
  const weakestEdges = data?.weakest_edges || [];

  return (
    <PanelFrame
      title="Persistence Summary"
      subtitle="Operational read on edge survival, stability and temporal durability from persisted research artifacts."
    >
      <CompactStatGrid
        items={[
          { label: 'Edge Survival Rate', value: summary.edge_survival_rate, render: (value) => researchPct(value) },
          { label: 'Avg Persistence Score', value: summary.average_edge_persistence_score, digits: 2 },
          { label: 'Strength vs Decay', value: summary.strengthening_vs_decay_ratio, digits: 2 },
          { label: 'Persistence Stability', value: summary.persistence_stability, digits: 2 },
          { label: 'Edge Durability', value: summary.edge_durability, digits: 2 },
        ]}
        columns="md:grid-cols-2 xl:grid-cols-5"
      />

      <div className="mt-4 grid gap-4 2xl:grid-cols-2">
        <ChartFrame title="Lifecycle Distribution" subtitle="Persistent, unstable, collapsing and strengthening cohorts.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={lifecycleCounts}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="label" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#71c7ff" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame title="Persistence By Window" subtitle="Average persistence and stabilized rate by operational timing window.">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={byWindow}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="window" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => fmt(value, 2)} />
              <Line yAxisId="left" type="monotone" dataKey="average_persistence" stroke="#71c7ff" strokeWidth={2} dot={{ r: 2 }} />
              <Line yAxisId="right" type="monotone" dataKey="stabilized_rate" stroke="#3ddc97" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <div className="mt-4 grid gap-4 2xl:grid-cols-2">
        <EdgeList title="Strongest Persistent Edges" subtitle="Highest persistence scores in the current research slate." rows={strongestEdges} />
        <EdgeList title="Weakest Persistent Edges" subtitle="Edges most exposed to temporal fragility or collapse." rows={weakestEdges} />
      </div>
    </PanelFrame>
  );
}
