import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import PanelFrame from '../../../shared/components/PanelFrame';

function ChartBox({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-700/35 p-4">
      <div className="mb-2 text-sm text-slate-300">{title}</div>
      <div className="h-72">{children}</div>
    </div>
  );
}

export default function MarketCharts({ detail }) {
  const rows = detail?.charts?.snapshots || [];

  return (
    <PanelFrame title="Temporal Market Structure" subtitle="Observed market evolution across persisted snapshots.">
      <div className="grid gap-4 2xl:grid-cols-2">
        <ChartBox title="Implied Probability Evolution">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="source_label" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="away_implied" stroke="#71c7ff" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="home_implied" stroke="#3ddc97" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartBox>

        <ChartBox title="Edge Evolution">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="source_label" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="away_edge" stroke="#ff9f6e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="home_edge" stroke="#f5b942" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartBox>

        <ChartBox title="Volatility Evolution">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="source_label" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="away_volatility" stackId="1" stroke="#71c7ff" fill="rgba(113,199,255,0.22)" />
              <Area type="monotone" dataKey="home_volatility" stackId="1" stroke="#3ddc97" fill="rgba(61,220,151,0.20)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartBox>

        <ChartBox title="Disagreement and Pressure">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="source_label" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="disagreement" stroke="#ff6b6b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="market_pressure" stroke="#c69cff" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartBox>
      </div>
    </PanelFrame>
  );
}
