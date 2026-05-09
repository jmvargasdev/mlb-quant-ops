import CompactStatGrid from '../../shared/components/CompactStatGrid';
import PanelFrame from '../../shared/components/PanelFrame';
import SignalPill from '../../shared/components/SignalPill';
import { humanizeFlag } from '../../shared/lib/formatters';
import OpsBoard from './components/OpsBoard';
import WorkspaceShell from '../../layouts/WorkspaceShell';

function convictionTone(level) {
  if (level === 'HIGH CONVICTION' || level === 'STABLE EDGE') return 'positive';
  if (level === 'UNSTABLE' || level === 'EDGE DECAY') return 'danger';
  if (level === 'LOW STABILITY') return 'warning';
  return 'info';
}

function deriveConviction(card) {
  if (!card) return { label: 'NO ACTIVE SELECTION', note: 'No focused game selected.', score: null };
  if (card.edge_trend === 'edge_collapse') return { label: 'EDGE DECAY', note: 'Edge is collapsing versus the market.', score: card.persistence_score };
  if ((card.persistence_score || 0) >= 80 && (card.edge_trend === 'stable_edge' || card.edge_trend === 'edge_strengthening')) {
    return { label: 'STABLE EDGE', note: 'Persistence and trend are aligned.', score: card.persistence_score };
  }
  if ((card.quant_score || 0) >= 22 && (card.persistence_score || 0) >= 70) {
    return { label: 'HIGH CONVICTION', note: 'Actionable with supportive market structure.', score: card.quant_score };
  }
  if ((card.volatility_score || 0) >= 65 || (card.persistence_score || 0) < 45) {
    return { label: 'UNSTABLE', note: 'High volatility or weak persistence.', score: card.volatility_score };
  }
  if ((card.persistence_score || 0) < 60) {
    return { label: 'LOW STABILITY', note: 'Needs more temporal confirmation.', score: card.persistence_score };
  }
  return { label: 'MODERATE', note: 'Conditionally interesting, but not dominant.', score: card.quant_score };
}

export default function DailyOpsWorkspace({ overview, detail, onSelectGame }) {
  const card = detail?.card || null;
  const latestSignals = [
    {
      label: 'Current Lean',
      value: card?.lean || 'n/a',
      render: (value) => value,
    },
    {
      label: 'Validation',
      value: card?.validation_bucket || 'n/a',
      render: (value) => value,
    },
    {
      label: 'Market Pressure',
      value: card?.market_pressure,
      digits: 2,
    },
    {
      label: 'Timing Quality',
      value: card?.timing_quality_score,
      digits: 1,
    },
  ];

  const conviction = deriveConviction(card);

  return (
    <WorkspaceShell
      main={<OpsBoard overview={overview} onSelect={onSelectGame} />}
      rail={
        <>
          <PanelFrame title="Operational Conviction" subtitle="Action quality for the focused game.">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SignalPill tone={convictionTone(conviction.label)}>{conviction.label}</SignalPill>
                <p className="mt-3 text-sm text-slate-300">{conviction.note}</p>
              </div>
              <div className="text-right">
                <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Anchor</div>
                <div className="mt-1 text-xl font-semibold text-white">
                  {conviction.score === null || conviction.score === undefined ? 'n/a' : Number(conviction.score).toFixed(1)}
                </div>
              </div>
            </div>
            {card && (
              <div className="mt-4 flex flex-wrap gap-2">
                {(card.risk_flags || []).slice(0, 6).map((flag) => (
                  <SignalPill key={flag} tone="warning">{humanizeFlag(flag)}</SignalPill>
                ))}
              </div>
            )}
          </PanelFrame>

          <PanelFrame title="Current Quant Context" subtitle="Selection-specific context for the focused game.">
            <CompactStatGrid items={latestSignals} />
          </PanelFrame>
        </>
      }
    />
  );
}
