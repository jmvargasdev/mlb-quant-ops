import { useDeferredValue } from 'react';
import EdgeSection from './components/EdgeSection';
import HeaderBar from './components/HeaderBar';
import HealthPanel from './components/HealthPanel';
import MetricTile from './components/MetricTile';
import ReplayViewer from './components/ReplayViewer';
import SnapshotDensityPanel from './components/SnapshotDensityPanel';
import TimelinePanel from './components/TimelinePanel';
import { usePortalData } from './hooks/usePortalData';

function formatValue(value, digits = 1) {
  if (value === null || value === undefined) return 'n/a';
  return Number(value).toFixed(digits);
}

function SelectionConsole({ overview, selectedGameId, onSelect }) {
  const top = overview.sections?.top_bettable || [];
  const watch = overview.sections?.watchlist || [];
  const noAction = overview.sections?.no_action || [];
  const fades = overview.sections?.fades || [];

  return (
    <div className="grid gap-6">
      <EdgeSection
        title="Top Bettable Edges"
        subtitle="Highest-ranked live selections from the scoring and persistence layers."
        cards={top}
        selectedGameId={selectedGameId}
        onSelect={onSelect}
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <EdgeSection
          title="Watchlist"
          subtitle="Positive but not fully promoted signals."
          cards={watch}
          selectedGameId={selectedGameId}
          onSelect={onSelect}
        />
        <EdgeSection
          title="No Action"
          subtitle="Informative rows that do not clear action thresholds."
          cards={noAction}
          selectedGameId={selectedGameId}
          onSelect={onSelect}
        />
      </div>
      <EdgeSection
        title="Fades"
        subtitle="Overpriced or structurally weak market sides."
        cards={fades}
        selectedGameId={selectedGameId}
        onSelect={onSelect}
      />
    </div>
  );
}

function MarketBoards({ overview, onSelect }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="panel rounded-3xl p-5">
        <h2 className="text-lg font-semibold text-white">Market Volatility</h2>
        <div className="mt-4 grid gap-3">
          {(overview.volatility_leaders || []).map((row) => (
            <button
              type="button"
              key={row.game_id}
              onClick={() => onSelect(row.game_id)}
              className="flex items-center justify-between rounded-2xl border border-slate-700/35 px-4 py-3 text-left"
            >
              <div>
                <div className="text-sm text-white">{row.matchup}</div>
                <div className="mt-1 text-xs text-slate-400">{(row.state_flags || []).join(', ') || 'no flags'}</div>
              </div>
              <div className="mono text-sm text-white">{formatValue(row.volatility_score, 1)}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="panel rounded-3xl p-5">
        <h2 className="text-lg font-semibold text-white">Edge Persistence</h2>
        <div className="mt-4 grid gap-3">
          {(overview.persistence_leaders || []).map((row) => (
            <button
              type="button"
              key={`${row.game_id}-${row.side}`}
              onClick={() => onSelect(row.game_id)}
              className="flex items-center justify-between rounded-2xl border border-slate-700/35 px-4 py-3 text-left"
            >
              <div>
                <div className="text-sm text-white">{row.team}</div>
                <div className="mt-1 text-xs text-slate-400">{row.matchup}</div>
              </div>
              <div className="mono text-sm text-white">{formatValue(row.edge_persistence_score, 1)}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function CLVPanel({ overview }) {
  const clv = overview.clv_preparation || {};
  return (
    <section className="panel rounded-3xl p-5">
      <h2 className="text-lg font-semibold text-white">CLV Preparation</h2>
      <p className="mt-1 text-sm text-slate-400">Timing quality and close-readiness from the persisted temporal research layer.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-700/35 p-4">
          <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Ready Records</div>
          <div className="mt-2 text-2xl font-semibold text-white">{clv.ready_records ?? 'n/a'}</div>
        </div>
        <div className="rounded-2xl border border-slate-700/35 p-4">
          <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Missing Close</div>
          <div className="mt-2 text-2xl font-semibold text-white">{clv.missing_close ?? 'n/a'}</div>
        </div>
        <div className="rounded-2xl border border-slate-700/35 p-4">
          <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Missing Pregame</div>
          <div className="mt-2 text-2xl font-semibold text-white">{clv.missing_pregame ?? 'n/a'}</div>
        </div>
        <div className="rounded-2xl border border-slate-700/35 p-4">
          <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Avg Timing</div>
          <div className="mt-2 text-2xl font-semibold text-white">{formatValue(clv.average_timing_quality, 1)}</div>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const { overview, gameId, setGameId, gameDetail, status } = usePortalData();
  const deferredDetail = useDeferredValue(gameDetail);

  if (status.loading && !overview) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-300">Loading live MLB operations state…</div>;
  }

  if (status.error && !overview) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-rose-300">{status.error}</div>;
  }

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
      <HeaderBar overview={overview} status={status} />

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(overview.metrics || []).map((metric) => (
          <MetricTile key={metric.label} metric={metric} />
        ))}
      </div>

      <div className="mt-6 grid gap-6 2xl:grid-cols-[1.55fr_0.95fr]">
        <div className="grid gap-6">
          <SelectionConsole overview={overview} selectedGameId={gameId} onSelect={setGameId} />
          <MarketBoards overview={overview} onSelect={setGameId} />
          <CLVPanel overview={overview} />
        </div>

        <div className="grid gap-6">
          <HealthPanel health={overview.operational_health} />
          <SnapshotDensityPanel health={overview.operational_health} overview={overview} />
          {deferredDetail && <TimelinePanel detail={deferredDetail} />}
          {deferredDetail && <ReplayViewer detail={deferredDetail} />}
        </div>
      </div>
    </div>
  );
}
