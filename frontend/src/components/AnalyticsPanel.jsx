import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { uncachedApiPath } from '../shared/lib/runtime';

function StatTile({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-700/35 p-4">
      <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value ?? 'n/a'}</div>
    </div>
  );
}

const DAYS_OPTIONS = [7, 14, 30];

export default function AnalyticsPanel() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(7);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    fetch(uncachedApiPath(`/api/analytics/summary?days=${days}`), { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`Analytics request failed: ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [days]);

  return (
    <section className="panel rounded-3xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Traffic Analytics</h2>
          <p className="mt-1 text-sm text-slate-400">Visitantes, ubicación y comportamiento del dashboard.</p>
        </div>
        <div className="flex gap-1">
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`mono rounded-lg px-3 py-1 text-xs transition-colors ${
                days === d
                  ? 'bg-indigo-600 text-white'
                  : 'border border-slate-700/35 text-slate-400 hover:text-white'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      {!data && !error && (
        <p className="text-sm text-slate-400">Cargando…</p>
      )}

      {data && (
        <div className="grid gap-5">
          {/* KPI tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Total Visits" value={data.total_visits.toLocaleString()} />
            <StatTile label="Unique Visitors" value={data.unique_visitors.toLocaleString()} />
            <StatTile
              label="Top Country"
              value={data.top_countries[0]?.country ?? '—'}
            />
          </div>

          {/* Visits by hour */}
          <div>
            <div className="mono mb-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">
              Visits by Hour (UTC)
            </div>
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={data.visits_by_hour} margin={{ top: 0, right: 0, bottom: 0, left: -28 }}>
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(h) => `${h}h`}
                  interval={3}
                />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                  itemStyle={{ color: '#e2e8f0', fontSize: 11 }}
                  labelFormatter={(h) => `${h}:00 UTC`}
                />
                <Bar dataKey="visits" fill="#6366f1" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Top pages */}
            <div>
              <div className="mono mb-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">Top Pages</div>
              <div className="grid gap-1">
                {data.top_pages.slice(0, 6).map((row) => (
                  <div
                    key={row.path}
                    className="flex items-center justify-between rounded-xl border border-slate-700/25 px-3 py-2"
                  >
                    <span className="mono truncate text-xs text-slate-300">{row.path}</span>
                    <span className="mono ml-3 shrink-0 text-xs text-indigo-300">{row.visits}</span>
                  </div>
                ))}
                {!data.top_pages.length && (
                  <p className="text-sm text-slate-400">Sin datos aún.</p>
                )}
              </div>
            </div>

            {/* Top countries */}
            <div>
              <div className="mono mb-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">Top Countries</div>
              <div className="grid gap-1">
                {data.top_countries.slice(0, 6).map((row) => (
                  <div
                    key={row.country}
                    className="flex items-center justify-between rounded-xl border border-slate-700/25 px-3 py-2"
                  >
                    <span className="text-xs text-slate-300">{row.country}</span>
                    <span className="mono ml-3 shrink-0 text-xs text-indigo-300">{row.visits}</span>
                  </div>
                ))}
                {!data.top_countries.length && (
                  <p className="text-sm text-slate-400">Sin datos de ubicación aún.</p>
                )}
              </div>
            </div>
          </div>

          {/* Device breakdown */}
          <div>
            <div className="mono mb-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">Device Type</div>
            <div className="flex gap-3 flex-wrap">
              {data.device_breakdown.map((row) => (
                <div
                  key={row.device}
                  className="flex items-center gap-2 rounded-full border border-slate-700/35 px-3 py-1"
                >
                  <span className="text-xs text-slate-300">{row.device}</span>
                  <span className="mono text-xs text-indigo-300">{row.visits}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
