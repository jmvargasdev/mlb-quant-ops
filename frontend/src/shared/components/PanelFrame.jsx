export default function PanelFrame({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`panel panel-terminal rounded-3xl p-4 lg:p-5 ${className}`}>
      {(title || subtitle || action) && (
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-slate-700/35 pb-3">
          <div>
            {title && <h2 className="text-base font-semibold tracking-tight text-white lg:text-lg">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
