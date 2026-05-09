import { useEffect, useState } from 'react';
import { humanizeFlag } from '../shared/lib/formatters';

function fmt(value, digits = 2) {
  if (value === null || value === undefined) return 'n/a';
  return Number(value).toFixed(digits);
}

export default function ReplayViewer({ detail }) {
  const awayFrames = detail?.replay?.away?.snapshots || [];
  const homeFrames = detail?.replay?.home?.snapshots || [];
  const totalFrames = Math.max(awayFrames.length, homeFrames.length, 1);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setFrame(0);
  }, [detail?.meta?.game_id]);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setFrame((current) => {
        if (current >= totalFrames - 1) return 0;
        return current + 1;
      });
    }, 1400);
    return () => window.clearInterval(timer);
  }, [playing, totalFrames]);

  const away = awayFrames[frame] || awayFrames[awayFrames.length - 1] || null;
  const home = homeFrames[frame] || homeFrames[homeFrames.length - 1] || null;

  return (
    <section className="panel rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Replay Viewer</h2>
          <p className="mt-1 text-sm text-slate-400">Step through real intraday snapshots for price, edge and volatility evolution.</p>
        </div>
        <button
          type="button"
          onClick={() => setPlaying((current) => !current)}
          className="mono rounded-full border border-slate-500/35 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-200"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>

      <input
        className="w-full accent-sky-400"
        type="range"
        min="0"
        max={Math.max(totalFrames - 1, 0)}
        value={frame}
        onChange={(event) => setFrame(Number(event.target.value))}
      />

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {[['Away', away], ['Home', home]].map(([label, snapshot]) => (
          <div key={label} className="rounded-2xl border border-slate-700/35 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">{label} Snapshot</div>
              <div className="mono text-[11px] uppercase tracking-[0.2em] text-slate-500">{snapshot?.auto_label || 'n/a'}</div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="mono text-[11px] uppercase tracking-[0.2em] text-slate-500">Price</div>
                <div className="mt-1 text-white">{snapshot?.current_american ?? 'n/a'}</div>
              </div>
              <div>
                <div className="mono text-[11px] uppercase tracking-[0.2em] text-slate-500">Implied</div>
                <div className="mt-1 text-white">{fmt((snapshot?.current_implied_probability ?? null) * 100, 2)}%</div>
              </div>
              <div>
                <div className="mono text-[11px] uppercase tracking-[0.2em] text-slate-500">Edge</div>
                <div className="mt-1 text-white">{fmt((snapshot?.edge_vs_market ?? null) * 100, 2)} pts</div>
              </div>
              <div>
                <div className="mono text-[11px] uppercase tracking-[0.2em] text-slate-500">Volatility</div>
                <div className="mt-1 text-white">{fmt(snapshot?.volatility_score, 1)}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(snapshot?.flags || []).map((flag) => (
                <span key={flag} className="mono rounded-full border border-slate-500/30 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                  {humanizeFlag(flag)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
