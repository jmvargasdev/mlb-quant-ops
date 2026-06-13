import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { apiPath } from '../../shared/lib/runtime';

function ChevronIcon({ open }) {
  return (
    <svg
      className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function Section({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-slate-700/40 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-1 py-3 text-left"
      >
        <span className="mono text-[11px] uppercase tracking-[0.22em] text-slate-300">{title}</span>
        <ChevronIcon open={open} />
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

const METHOD_COLORS = {
  'Q-Kelly cap 5%':  '#6366f1',
  'Q-Kelly cap 10%': '#22d3ee',
  'Q-Kelly cap 15%': '#34d399',
  'Q-Kelly sin cap': '#f59e0b',
  '2% Flat':         '#94a3b8',
};

export default function ModelAnalysisAccordion() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || data) return;
    setLoading(true);
    fetch(apiPath('/api/portal/model-analysis'), { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [open, data]);

  return (
    <div className="rounded-3xl border border-slate-700/35 bg-slate-950/40">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <div className="text-sm font-semibold text-white">Análisis Histórico del Modelo</div>
          <div className="mt-0.5 text-xs text-slate-400">Backtest Validated Edge · EV por proposición de sizing · Actualizable en tiempo real</div>
        </div>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="border-t border-slate-700/40 px-5 pb-5">
          {loading && <p className="pt-4 text-sm text-slate-400">Calculando…</p>}
          {error && <p className="pt-4 text-sm text-rose-300">Error: {error}</p>}

          {data && (
            <div className="pt-2">
              {/* KPIs */}
              <div className="mt-3 grid grid-cols-3 gap-3">
                {[
                  ['Señales totales', data.total_signals],
                  ['Wins / Losses', `${data.wins} / ${data.losses}`],
                  ['Accuracy', `${data.accuracy_pct}%`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-700/30 bg-slate-900/40 px-3 py-3">
                    <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
                    <div className="mt-1 text-lg font-semibold text-white">{value}</div>
                  </div>
                ))}
              </div>

              {/* EV por método */}
              <Section title="EV por proposición de sizing" defaultOpen>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left">
                        {['Método','Bankroll','ROI','Max DD','EV/señal','EV/u stk','Geo/señal'].map(h => (
                          <th key={h} className="mono pb-2 pr-4 pt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500 font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.methods.map(m => (
                        <tr key={m.key} className="border-t border-slate-700/20">
                          <td className="py-2 pr-4">
                            <span style={{ color: METHOD_COLORS[m.label] || '#94a3b8' }} className="font-semibold">
                              {m.label}
                            </span>
                          </td>
                          <td className="mono py-2 pr-4 text-white">{m.bankroll_final}u</td>
                          <td className="mono py-2 pr-4 text-emerald-300">+{m.roi_pct}u</td>
                          <td className={`mono py-2 pr-4 ${m.max_drawdown_pct > 35 ? 'text-rose-300' : m.max_drawdown_pct > 20 ? 'text-amber-300' : 'text-slate-300'}`}>
                            {m.max_drawdown_pct}%
                          </td>
                          <td className="mono py-2 pr-4 text-slate-300">{m.ev_per_signal}u</td>
                          <td className="mono py-2 pr-4 text-slate-300">{m.ev_per_unit_staked_pct}%</td>
                          <td className="mono py-2 text-sky-300">{m.geo_growth_per_signal_pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* ROI chart */}
              <Section title="Evolución del bankroll">
                <div className="mt-2">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={data.evolution.filter((_, i) => i % 2 === 0)} margin={{ left: -20, right: 0, top: 4, bottom: 0 }}>
                      <XAxis dataKey="signal" tick={{ fontSize: 10, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                        labelFormatter={v => `Señal #${v}`}
                      />
                      {['cap10', 'cap5', 'flat'].map((key, i) => {
                        const method = data.methods.find(m => m.key === key);
                        return (
                          <Bar key={key} dataKey={key} name={method?.label || key}
                            fill={METHOD_COLORS[method?.label] || '#6366f1'}
                            radius={[2, 2, 0, 0]} />
                        );
                      })}
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="mt-1 text-center text-[10px] text-slate-500">Mostrando cap 5%, cap 10% y Flat (cap 15% y sin cap omitidos por escala)</p>
                </div>
              </Section>

              {/* Kelly distribution */}
              <Section title="Distribución Quarter-Kelly histórica">
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {data.kelly_distribution.map(({ range, count, pct }) => (
                    <div key={range} className="rounded-xl border border-slate-700/25 bg-slate-900/40 p-3 text-center">
                      <div className="mono text-[10px] uppercase tracking-[0.15em] text-slate-500">{range}</div>
                      <div className="mt-1 text-base font-semibold text-white">{count}</div>
                      <div className="mono text-[10px] text-slate-400">{pct}%</div>
                    </div>
                  ))}
                </div>
              </Section>

              <div className="mt-3 text-right">
                <button
                  type="button"
                  onClick={() => setData(null)}
                  className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Actualizar datos ↺
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
