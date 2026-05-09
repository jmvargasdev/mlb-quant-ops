import EdgeCard from './EdgeCard';

export default function EdgeSection({ title, subtitle, cards, selectedGameId, onSelect }) {
  return (
    <section className="panel rounded-3xl p-5">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        </div>
        <div className="mono text-xs uppercase tracking-[0.22em] text-slate-500">{cards.length} rows</div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {cards.map((card) => (
          <EdgeCard
            key={`${card.game_id}-${card.selection_side || card.side || card.team}`}
            card={card}
            selected={selectedGameId === card.game_id}
            onSelect={onSelect}
          />
        ))}
        {!cards.length && <div className="rounded-2xl border border-dashed border-slate-600/40 p-6 text-sm text-slate-400">No live rows in this section.</div>}
      </div>
    </section>
  );
}
