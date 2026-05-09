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
import SignalPill from '../../../shared/components/SignalPill';
import { fmt } from '../../../shared/lib/formatters';
import { ChartFrame, HeatmapGrid, probabilityPoints } from '../shared/ui';

const REGIME_ORDER = ['stable', 'balanced', 'elevated', 'turbulent', 'unknown'];
const WINDOW_ORDER = ['06:00_open', '08:00_early', '10:00_market', 'lineup_confirm', '60m_pregame', '15m_pregame', 'close'];

export default function VolatilitySection({ data }) {
  const summary = data?.summary || {};
  const regimes = data?.regimes || [];
  const heatmap = data?.heatmap || [];
  const disagreementRegimes = data?.disagreement_regimes || [];
  const volatilityMemory = data?.volatility_memory || [];

  return (
    <PanelFrame
      title="Volatility Regimes"
      subtitle="Stable, unstable and turbulent market phases translated into regime cohorts and operational heatmaps."
    >
      <CompactStatGrid
        items={[
          { label: 'Volatility Clustering', value: summary.volatility_clustering_score, digits: 3 },
          { label: 'Stable Markets', value: summary.stable_markets, digits: 0 },
          { label: 'Unstable Markets', value: summary.unstable_markets, digits: 0 },
          { label: 'High Turbulence', value: summary.high_turbulence_periods, digits: 0 },
          { label: 'Low Turbulence', value: summary.low_turbulence_periods, digits: 0 },
        ]}
        columns="md:grid-cols-2 xl:grid-cols-5"
      />

      <div className="mt-4 grid gap-4 2xl:grid-cols-2">
        <ChartFrame title="Regime Persistence And Timing" subtitle="Average persistence and timing quality within each volatility regime.">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={regimes}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="regime" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => fmt(value, 2)} />
              <Bar yAxisId="left" dataKey="average_persistence" fill="#71c7ff" radius={[6, 6, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="average_timing_quality" stroke="#3ddc97" strokeWidth={2} dot={{ r: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame title="Regime Close Behavior" subtitle="Average close delta and volatility score by regime.">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={regimes}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="regime" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value, name) => (name === 'average_abs_close_delta' ? probabilityPoints(value) : fmt(value, 2))} />
              <Line yAxisId="left" type="monotone" dataKey="average_abs_close_delta" stroke="#f4c95d" strokeWidth={2} dot={{ r: 2 }} />
              <Line yAxisId="right" type="monotone" dataKey="average_volatility_score" stroke="#ff6b6b" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-700/35 bg-slate-950/35 p-4">
        <div className="text-sm font-semibold text-white">Regime Heatmap</div>
        <div className="mt-1 text-xs text-slate-400">Window-level clustering of regime observations and average close dislocation.</div>
        <div className="mt-4">
          <HeatmapGrid
            rows={REGIME_ORDER}
            columns={WINDOW_ORDER}
            values={heatmap}
            formatter={(cell) => probabilityPoints(cell.average_abs_close_delta)}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 p-4">
          <div className="text-sm font-semibold text-white">Disagreement Regimes</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {disagreementRegimes.map((item) => (
              <SignalPill key={item.label} tone="info">{item.label} {item.count}</SignalPill>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 p-4">
          <div className="text-sm font-semibold text-white">Volatility Memory</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {volatilityMemory.map((item) => (
              <SignalPill key={item.label} tone={item.label === 'unknown' ? 'neutral' : 'warning'}>{item.label} {item.count}</SignalPill>
            ))}
          </div>
        </div>
      </div>
    </PanelFrame>
  );
}
