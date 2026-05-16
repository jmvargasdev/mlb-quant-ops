import CompactStatGrid from '../../shared/components/CompactStatGrid';
import PanelFrame from '../../shared/components/PanelFrame';
import SignalPill from '../../shared/components/SignalPill';
import { compactList, humanizeFlag } from '../../shared/lib/formatters';
import MarketCharts from './components/MarketCharts';
import WorkspaceShell from '../../layouts/WorkspaceShell';

function formatAmerican(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  const numeric = Number(value);
  return numeric > 0 ? `+${numeric}` : String(numeric);
}

function formatTotal(value, overPrice, underPrice) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  const base = Number(value).toFixed(Number.isInteger(Number(value)) ? 0 : 1);
  const over = formatAmerican(overPrice);
  const under = formatAmerican(underPrice);
  if (over === 'n/a' && under === 'n/a') return `${base} · prices pending`;
  return `${base} · O ${over} / U ${under}`;
}

function formatRunLine(points, price) {
  if (points === null || points === undefined || Number.isNaN(Number(points))) return 'n/a';
  const numeric = Number(points);
  const spread = `${numeric > 0 ? '+' : ''}${numeric.toFixed(1)}`;
  return price === null || price === undefined ? `${spread} · price pending` : `${spread} ${formatAmerican(price)}`;
}

export default function MarketStructureWorkspace({ detail, overview }) {
  const market = detail?.temporal?.market_state || {};
  const card = detail?.card || null;
  const latestSnapshot = detail?.charts?.snapshots?.at?.(-1) || null;
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
          <PanelFrame title="Line Board" subtitle="Latest captured moneyline, total, and run line context for this matchup.">
            <CompactStatGrid
              columns="md:grid-cols-2 xl:grid-cols-3"
              items={[
                {
                  label: latestSnapshot?.away_abbreviation || 'Away ML',
                  value: latestSnapshot?.away_american,
                  render: formatAmerican,
                  helper: latestSnapshot?.away_team,
                },
                {
                  label: latestSnapshot?.home_abbreviation || 'Home ML',
                  value: latestSnapshot?.home_american,
                  render: formatAmerican,
                  helper: latestSnapshot?.home_team,
                },
                {
                  label: 'Total',
                  value: latestSnapshot?.total_current,
                  render: (value) => formatTotal(value, latestSnapshot?.total_over_price, latestSnapshot?.total_under_price),
                  helper: latestSnapshot?.source_label || latestSnapshot?.label || 'latest snapshot',
                },
                {
                  label: `${latestSnapshot?.away_abbreviation || 'Away'} RL`,
                  value: latestSnapshot?.away_run_line,
                  render: (value) => formatRunLine(value, latestSnapshot?.away_run_line_price),
                  helper: latestSnapshot?.away_team,
                },
                {
                  label: `${latestSnapshot?.home_abbreviation || 'Home'} RL`,
                  value: latestSnapshot?.home_run_line,
                  render: (value) => formatRunLine(value, latestSnapshot?.home_run_line_price),
                  helper: latestSnapshot?.home_team,
                },
                {
                  label: 'Snapshot',
                  value: latestSnapshot?.source_label || latestSnapshot?.label,
                  render: (value) => value || 'n/a',
                  helper: latestSnapshot?.timestamp ? new Date(latestSnapshot.timestamp).toLocaleTimeString() : null,
                },
              ]}
            />
          </PanelFrame>

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
