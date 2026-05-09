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
import CompactStatGrid from '../../../shared/components/CompactStatGrid';
import PanelFrame from '../../../shared/components/PanelFrame';
import { fmt } from '../../../shared/lib/formatters';
import { ChartFrame, probabilityPoints, researchPct } from '../shared/ui';

export default function MarketCorrectionSection({ data }) {
  const summary = data?.summary || {};
  const windows = data?.windows || [];
  const comparisons = data?.comparisons || [];

  return (
    <PanelFrame
      title="Market Correction Behavior"
      subtitle="Correction velocity, disagreement resolution, stabilization timing and absorption behavior across real snapshot comparisons."
    >
      <CompactStatGrid
        items={[
          {
            label: 'Market Stabilization',
            value: summary.market_stabilization_timing_minutes_to_first_pitch,
            render: (value) => (value === null || value === undefined ? 'n/a' : `${fmt(value, 1)}m`),
          },
          {
            label: 'Late Move Avg Shift',
            value: summary.late_movement_behavior_avg_implied_shift,
            render: (value) => probabilityPoints(value),
          },
          {
            label: 'Fastest Absorption',
            value: [...windows].sort((a, b) => (b.absorption_speed || -Infinity) - (a.absorption_speed || -Infinity))[0]?.window || 'n/a',
            render: (value) => value,
          },
          {
            label: 'Highest Disagreement',
            value: [...windows].sort((a, b) => (b.disagreement_resolution || -Infinity) - (a.disagreement_resolution || -Infinity))[0]?.window || 'n/a',
            render: (value) => value,
          },
        ]}
      />

      <div className="mt-4 grid gap-4 2xl:grid-cols-2">
        <ChartFrame title="Correction Velocity By Window" subtitle="Average close correction pace expressed as implied shift per hour to first pitch.">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={windows}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="window" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => fmt(value, 4)} />
              <Line type="monotone" dataKey="correction_velocity" stroke="#71c7ff" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="disagreement_resolution" stroke="#ff6b6b" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame title="Absorption And Volatility Expansion" subtitle="How quickly the market absorbs information and how much volatility remains in each window.">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={windows}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="window" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => fmt(value, 2)} />
              <Area type="monotone" dataKey="absorption_speed" stroke="#3ddc97" fill="rgba(61,220,151,0.18)" />
              <Area type="monotone" dataKey="volatility_expansion" stroke="#f4c95d" fill="rgba(244,201,93,0.16)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-700/35 bg-slate-950/35 p-4">
        <div className="text-sm font-semibold text-white">Correction Tape</div>
        <div className="mt-1 text-xs text-slate-400">Sample of underlying snapshot-to-close comparisons feeding correction and stabilization metrics.</div>
        <div className="mt-4 grid gap-3">
          {comparisons.slice(0, 12).map((row, index) => (
            <div key={`${row.game_id}:${row.side}:${row.snapshot_label}:${index}`} className="rounded-2xl border border-slate-700/30 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-white">{row.matchup} · {row.team}</div>
                  <div className="mt-1 text-xs text-slate-400">{row.snapshot_label} · {row.minutes_to_first_pitch?.toFixed?.(1) ?? row.minutes_to_first_pitch ?? 'n/a'} minutes to first pitch</div>
                </div>
                <div className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{row.validation_bucket}</div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-300 md:grid-cols-4">
                <div>Close delta {probabilityPoints(row.implied_delta_to_close)}</div>
                <div>Correction {fmt(row.correction_velocity, 4)}</div>
                <div>Volatility {fmt(row.volatility_score, 2)}</div>
                <div>Stabilized {researchPct(row.stabilized ? 100 : 0, 0)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PanelFrame>
  );
}
