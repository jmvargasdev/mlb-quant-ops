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
import { fmt, signedPoints, timestampLabel } from '../../../shared/lib/formatters';

function ChartBox({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-700/35 p-4">
      <div className="mb-2 text-sm text-slate-300">{title}</div>
      <div className="h-72">{children}</div>
    </div>
  );
}

function buildTimelineRows(snapshots) {
  return (snapshots || []).map((row, index) => {
    const time = timestampLabel(row.timestamp);
    const source = row.source_label || row.label || `snapshot ${index + 1}`;
    return {
      ...row,
      timeline_label: `${source} ${time}`,
      update_number: index + 1,
    };
  });
}

function formatAmerican(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  const numeric = Number(value);
  return numeric > 0 ? `+${numeric}` : String(numeric);
}

function formatTotal(row) {
  if (row.total_current === null || row.total_current === undefined || Number.isNaN(Number(row.total_current))) return 'n/a';
  const total = Number(row.total_current).toFixed(Number.isInteger(Number(row.total_current)) ? 0 : 1);
  const over = formatAmerican(row.total_over_price);
  const under = formatAmerican(row.total_under_price);
  if (over === 'n/a' && under === 'n/a') return total;
  return `${total} O${over}/U${under}`;
}

function formatSpread(points, price) {
  if (points === null || points === undefined || Number.isNaN(Number(points))) return 'n/a';
  const numeric = Number(points);
  const spread = `${numeric > 0 ? '+' : ''}${numeric.toFixed(1)}`;
  const linePrice = formatAmerican(price);
  return linePrice === 'n/a' ? spread : `${spread} ${linePrice}`;
}

export default function MarketCharts({ detail }) {
  const rows = buildTimelineRows(detail?.charts?.snapshots);
  const showDots = rows.length <= 4;

  return (
    <PanelFrame title="Temporal Market Structure" subtitle="Observed market evolution across persisted snapshots.">
      {!rows.length && (
        <div className="rounded-2xl border border-slate-700/35 bg-slate-950/50 px-4 py-5 text-sm text-slate-400">
          No timeline updates are available for the selected matchup.
        </div>
      )}

      <div className="grid gap-4 2xl:grid-cols-2">
        <ChartBox title="Implied Probability Evolution">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="timeline_label" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="away_implied" stroke="#71c7ff" strokeWidth={2} dot={showDots} />
              <Line type="monotone" dataKey="home_implied" stroke="#3ddc97" strokeWidth={2} dot={showDots} />
            </LineChart>
          </ResponsiveContainer>
        </ChartBox>

        <ChartBox title="Edge Evolution">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="timeline_label" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="away_edge" stroke="#ff9f6e" strokeWidth={2} dot={showDots} connectNulls />
              <Line type="monotone" dataKey="home_edge" stroke="#f5b942" strokeWidth={2} dot={showDots} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartBox>

        <ChartBox title="Volatility Evolution">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="timeline_label" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
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
              <XAxis dataKey="timeline_label" stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="disagreement" stroke="#ff6b6b" strokeWidth={2} dot={showDots} />
              <Line type="monotone" dataKey="market_pressure" stroke="#c69cff" strokeWidth={2} dot={showDots} />
            </LineChart>
          </ResponsiveContainer>
        </ChartBox>
      </div>

      {!!rows.length && (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-700/35">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[72px_minmax(0,1fr)_88px_96px_96px_88px_88px] gap-3 border-b border-slate-700/35 px-4 py-2 mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
              <div>Update</div>
              <div>Snapshot</div>
              <div>Total</div>
              <div>Away RL</div>
              <div>Home RL</div>
              <div>Away Edge</div>
              <div>Home Edge</div>
            </div>
            <div className="divide-y divide-slate-700/25">
              {rows.slice(-5).map((row) => (
                <div key={`${row.timestamp}-${row.update_number}`} className="grid grid-cols-[72px_minmax(0,1fr)_88px_96px_96px_88px_88px] gap-3 px-4 py-3 text-sm">
                  <div className="mono text-slate-400">#{row.update_number}</div>
                  <div className="min-w-0">
                    <div className="truncate text-white">{row.source_label || row.label || 'snapshot'}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{timestampLabel(row.timestamp)}</div>
                  </div>
                  <div className="text-slate-200">{formatTotal(row)}</div>
                  <div className="text-slate-200">{formatSpread(row.away_run_line, row.away_run_line_price)}</div>
                  <div className="text-slate-200">{formatSpread(row.home_run_line, row.home_run_line_price)}</div>
                  <div className="text-slate-200">{signedPoints(row.away_edge)}</div>
                  <div className="text-slate-200">{signedPoints(row.home_edge)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-slate-700/35 px-4 py-2 text-xs text-slate-500">
            {rows.length} update{rows.length === 1 ? '' : 's'} captured. Latest pressure: {fmt(rows[rows.length - 1].market_pressure, 3)}.
          </div>
        </div>
      )}
    </PanelFrame>
  );
}
