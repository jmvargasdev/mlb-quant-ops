import CompactStatGrid from '../../shared/components/CompactStatGrid';
import PanelFrame from '../../shared/components/PanelFrame';
import SignalPill from '../../shared/components/SignalPill';
import { compactList, humanizeFlag } from '../../shared/lib/formatters';
import MarketCharts from './components/MarketCharts';
import WorkspaceShell from '../../layouts/WorkspaceShell';

export default function MarketStructureWorkspace({ detail, overview }) {
  const market = detail?.temporal?.market_state || {};
  const card = detail?.card || null;
  const stats = [
    { label: 'Volatility Regime', value: market.volatility_regime, render: (value) => value || 'n/a' },
    { label: 'Avg Volatility', value: market.average_volatility_score, digits: 1 },
    { label: 'Disagreement Avg', value: market.disagreement_average, digits: 3 },
    { label: 'Pressure Peak', value: market.market_pressure_peak, digits: 3 },
    { label: 'Line Movement', value: card?.line_movement_pct_points, digits: 2 },
    { label: 'Replay Frames', value: card?.replay_snapshot_count, digits: 0 },
  ];

  return (
    <WorkspaceShell
      main={
        <>
          <PanelFrame title="Market State" subtitle="Current temporal regime for the selected matchup.">
            <CompactStatGrid items={stats} columns="md:grid-cols-2 xl:grid-cols-3" />
            <div className="mt-4 flex flex-wrap gap-2">
              {(market.state_flags || []).map((flag) => (
                <SignalPill key={flag} tone={flag.includes('sharp') || flag.includes('expansion') ? 'danger' : 'info'}>
                  {humanizeFlag(flag)}
                </SignalPill>
              ))}
              {!market.state_flags?.length && <SignalPill tone="neutral">no active state flags</SignalPill>}
            </div>
          </PanelFrame>

          <MarketCharts detail={detail} />
        </>
      }
      rail={
        <PanelFrame title="Cross-Slate Context" subtitle="Highest volatility and persistence structures across the slate.">
          <div className="grid gap-4">
            <div className="grid gap-3">
              {(overview.volatility_leaders || []).slice(0, 6).map((row) => (
                <div key={row.game_id} className="rounded-2xl border border-slate-700/35 px-4 py-3">
                  <div className="text-sm text-white">{row.matchup}</div>
                  <div className="mt-1 text-xs text-slate-400">{compactList(row.state_flags)}</div>
                </div>
              ))}
            </div>
            <div className="grid gap-3">
              {(overview.persistence_leaders || []).slice(0, 6).map((row) => (
                <div key={`${row.game_id}-${row.side}`} className="rounded-2xl border border-slate-700/35 px-4 py-3">
                  <div className="text-sm text-white">{row.team}</div>
                  <div className="mt-1 text-xs text-slate-400">{row.matchup}</div>
                </div>
              ))}
            </div>
          </div>
        </PanelFrame>
      }
    />
  );
}
