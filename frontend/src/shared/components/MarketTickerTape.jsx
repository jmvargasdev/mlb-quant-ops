function formatAmerican(value) {
  if (value === null || value === undefined) return '--';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return numeric > 0 ? `+${numeric}` : `${numeric}`;
}

function formatTotal(value) {
  if (value === null || value === undefined) return '--';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(numeric % 1 === 0 ? 0 : 1) : '--';
}

function formatSpread(value) {
  if (value === null || value === undefined) return '--';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric > 0 ? `+${numeric.toFixed(1)}` : numeric.toFixed(1);
}

function formatPriceSuffix(value) {
  const price = formatAmerican(value);
  return price === '--' ? '' : ` ${price}`;
}

function formatEventTime(value) {
  if (!value) return 'Event TBD';
  const text = String(value).trim();
  if (/\bE[DS]?T\b/i.test(text)) return `Event ${text}`;
  return `Event ${text} ET`;
}

function TickerItem({ row }) {
  return (
    <div className="inline-flex shrink-0 items-center gap-3 border-r border-slate-700/45 px-5 py-2">
      <div className="min-w-[150px]">
        <div className="text-xs font-semibold text-white">{row.away?.abbreviation || 'AWY'} @ {row.home?.abbreviation || 'HOM'}</div>
        <div className="mt-0.5 text-[11px] text-slate-500">{formatEventTime(row.game_time_local)}</div>
      </div>
      <div className="mono text-[11px] text-slate-300">
        ML <span className="text-sky-200">{row.away?.abbreviation} {formatAmerican(row.away?.moneyline)}</span>
        <span className="mx-1 text-slate-600">/</span>
        <span className="text-sky-200">{row.home?.abbreviation} {formatAmerican(row.home?.moneyline)}</span>
      </div>
      <div className="mono text-[11px] text-slate-300">
        O/U <span className="text-emerald-200">{formatTotal(row.total)}</span>
        {(row.total_over_price || row.total_under_price) && (
          <span className="text-slate-500"> O{formatPriceSuffix(row.total_over_price)} / U{formatPriceSuffix(row.total_under_price)}</span>
        )}
      </div>
      <div className="mono text-[11px] text-slate-300">
        RL <span className="text-amber-100">{row.away?.abbreviation} {formatSpread(row.away?.run_line)}{formatPriceSuffix(row.away?.run_line_price)}</span>
        <span className="mx-1 text-slate-600">/</span>
        <span className="text-amber-100">{row.home?.abbreviation} {formatSpread(row.home?.run_line)}{formatPriceSuffix(row.home?.run_line_price)}</span>
      </div>
    </div>
  );
}

export default function MarketTickerTape({ rows = [] }) {
  if (!rows.length) return null;
  const tickerRows = [...rows, ...rows];

  return (
    <section className="panel panel-terminal overflow-hidden rounded-2xl border border-slate-700/40">
      <style>{`
        @keyframes marketTickerScroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .market-ticker-track {
          animation: marketTickerScroll 55s linear infinite;
        }
        .market-ticker-track:hover {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .market-ticker-track {
            animation: none;
          }
        }
      `}</style>
      <div className="flex items-center border-b border-slate-700/35 px-4 py-2">
        <div className="mono text-[10px] uppercase tracking-[0.22em] text-sky-200">Live Market Tape</div>
        <div className="ml-3 text-xs text-slate-500">ML, totals and run-line spread</div>
      </div>
      <div className="relative whitespace-nowrap">
        <div className="market-ticker-track inline-flex min-w-max">
          {tickerRows.map((row, index) => (
            <TickerItem key={`${row.game_id}-${index}`} row={row} />
          ))}
        </div>
      </div>
    </section>
  );
}
