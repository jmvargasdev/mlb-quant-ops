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

export default function TimelinePanel({ detail }) {
  const chartRows = detail?.charts?.snapshots || [];

  return (
    <section className="panel rounded-3xl p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Market Timeline</h2>
        <p className="mt-1 text-sm text-slate-400">Real intraday evolution from persisted snapshots, not mock arrays.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-700/35 p-4">
          <div className="mb-2 text-sm text-slate-300">Implied Probability Evolution</div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows}>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="label" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
                <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="away_implied" stroke="#71c7ff" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="home_implied" stroke="#3ddc97" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700/35 p-4">
          <div className="mb-2 text-sm text-slate-300">Edge Persistence Through Time</div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows}>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="label" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
                <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="away_edge" stroke="#ff9f6e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="home_edge" stroke="#f5b942" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700/35 p-4">
          <div className="mb-2 text-sm text-slate-300">Volatility Evolution</div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartRows}>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="label" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
                <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="away_volatility" stackId="1" stroke="#71c7ff" fill="rgba(113,199,255,0.25)" />
                <Area type="monotone" dataKey="home_volatility" stackId="1" stroke="#3ddc97" fill="rgba(61,220,151,0.2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700/35 p-4">
          <div className="mb-2 text-sm text-slate-300">Disagreement and Pressure</div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows}>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="label" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
                <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="disagreement" stroke="#ff6b6b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="market_pressure" stroke="#d0b5ff" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}
