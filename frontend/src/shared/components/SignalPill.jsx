export default function SignalPill({ children, tone = 'neutral' }) {
  const toneClass = {
    positive: 'border-emerald-400/25 bg-emerald-400/6 text-emerald-100',
    warning: 'border-amber-300/25 bg-amber-300/6 text-amber-50',
    danger: 'border-rose-400/25 bg-rose-400/6 text-rose-100',
    info: 'border-sky-300/25 bg-sky-300/6 text-sky-100',
    neutral: 'border-slate-500/25 bg-slate-500/6 text-slate-300',
  }[tone] || 'border-slate-500/25 bg-slate-500/6 text-slate-300';

  return (
    <span className={`mono rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${toneClass}`}>
      {children}
    </span>
  );
}
