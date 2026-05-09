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
import SignalPill from '../../../shared/components/SignalPill';
import { fmt } from '../../../shared/lib/formatters';
import { ChartFrame, lifecycleTone, probabilityPoints, researchPct } from '../shared/ui';

export default function SurvivedRejectedSection({ data }) {
  const buckets = data?.buckets || [];
  const rows = data?.rows || [];

  return (
    <PanelFrame
      title="Survived vs Rejected"
      subtitle="Visual separation between robust edges, unstable edges, collapses and strengthening cohorts."
    >
      <CompactStatGrid
        items={[
          { label: 'Collapse Rate', value: data?.collapse_rate, render: (value) => researchPct(value, 2) },
          { label: 'Strengthening Rate', value: data?.strengthening_rate, render: (value) => researchPct(value, 2) },
          {
            label: 'Survived Count',
            value: buckets.find((item) => item.label === 'survived')?.count ?? 0,
            digits: 0,
          },
          {
            label: 'Rejected Count',
            value: buckets.find((item) => item.label === 'rejected')?.count ?? 0,
            digits: 0,
          },
        ]}
      />

      <div className="mt-4 grid gap-4 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <ChartFrame title="Validation Buckets" subtitle="Current research slate split by survival outcome.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="label" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => fmt(value, 0)} />
              <Bar dataKey="count" fill="#71c7ff" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 p-4">
          <div className="text-sm font-semibold text-white">Classification Tape</div>
          <div className="mt-1 text-xs text-slate-400">Persistent, unstable, collapsing and strengthening edges with real persistence and close-proxy context.</div>
          <div className="mt-4 grid gap-3">
            {rows.map((row) => (
              <div key={`${row.game_id}:${row.side}`} className="rounded-2xl border border-slate-700/30 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-white">{row.team}</div>
                    <div className="mt-1 text-xs text-slate-400">{row.matchup}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <SignalPill tone={lifecycleTone(row.validation_bucket)}>{row.validation_bucket}</SignalPill>
                    <SignalPill tone={lifecycleTone(row.lifecycle)}>{row.lifecycle}</SignalPill>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate-300 md:grid-cols-4">
                  <div>Persistence {fmt(row.edge_persistence_score, 2)}</div>
                  <div>Stability {fmt(row.edge_stability_score, 2)}</div>
                  <div>Timing {fmt(row.timing_quality_score, 2)}</div>
                  <div>Close delta {probabilityPoints(row.close_delta_implied)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PanelFrame>
  );
}
