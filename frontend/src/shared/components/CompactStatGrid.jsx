import { fmt } from '../lib/formatters';

export default function CompactStatGrid({ items, columns = 'md:grid-cols-2 xl:grid-cols-4' }) {
  return (
    <div className={`grid gap-3 ${columns}`}>
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-slate-700/35 bg-slate-950/25 px-3 py-3">
          <div className="mono text-[10px] uppercase tracking-[0.24em] text-slate-500">{item.label}</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {item.render ? item.render(item.value) : fmt(item.value, item.digits ?? 1)}
          </div>
          {item.helper && <div className="mt-1 text-xs text-slate-400">{item.helper}</div>}
        </div>
      ))}
    </div>
  );
}
