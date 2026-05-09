export default function WorkspaceShell({ main, rail, railClassName = '' }) {
  const hasRail = Boolean(rail);

  return (
    <div className={hasRail ? 'grid gap-5 xl:grid-cols-[minmax(0,1.85fr)_minmax(300px,0.65fr)]' : 'grid gap-5'}>
      <div className="grid gap-5">{main}</div>
      {hasRail && (
        <aside className={`grid gap-5 self-start lg:sticky lg:top-4 ${railClassName}`}>
          {rail}
        </aside>
      )}
    </div>
  );
}
