import CompactStatGrid from '../../shared/components/CompactStatGrid';
import PanelFrame from '../../shared/components/PanelFrame';
import SignalPill from '../../shared/components/SignalPill';
import WorkspaceShell from '../../layouts/WorkspaceShell';
import { fmt, timestampFull, timeAgo } from '../../shared/lib/formatters';
import { useDecisionPanel } from './useDecisionPanel';

function toneForTier(tier) {
  if (tier === 'Elite Conviction' || tier === 'High Conviction') return 'positive';
  if (tier === 'Supportive') return 'info';
  if (tier === 'Speculative') return 'warning';
  if (tier === 'Watchlist') return 'neutral';
  return 'danger';
}

function changeStatusTone(value) {
  if (value === 'OK') return 'positive';
  if (value === 'Watch') return 'warning';
  if (value === 'Risk') return 'danger';
  return 'neutral';
}

export default function DecisionPanelWorkspace({ overview, status, active }) {
  const refreshMs = overview?.meta?.refresh_policy?.interval_ms || 120000;
  const { data, status: panelStatus } = useDecisionPanel(active, refreshMs);

  if (panelStatus.loading && !data) {
    return (
      <PanelFrame title="Decision Panel" subtitle="Building portfolio posture from current overview and research layers.">
        <div className="text-sm text-slate-300">Loading decision context...</div>
      </PanelFrame>
    );
  }

  if (panelStatus.error && !data) {
    return (
      <PanelFrame title="Decision Panel" subtitle="Decision context is temporarily unavailable.">
        <div className="text-sm text-rose-300">{panelStatus.error}</div>
      </PanelFrame>
    );
  }

  const posture = data?.operational_posture || {};
  const environment = data?.market_environment || {};
  const portfolioSummary = data?.portfolio_summary || {};
  const correlation = data?.correlation_awareness || {};
  const exposureGovernance = data?.exposure_governance || {};
  const concentrationRisk = data?.concentration_risk || {};
  const slateStability = data?.slate_stability || {};
  const aggression = data?.portfolio_aggression_control || {};
  const aggregateExposure = data?.aggregate_exposure_intelligence || {};
  const executive = data?.executive_allocation || {};
  const structures = data?.best_structures || [];
  const timing = data?.timing_persistence || {};
  const exposure = data?.exposure_recommendations || [];
  const riskLayer = data?.risk_layer || [];
  const conclusion = data?.operational_conclusion || {};
  const slate = data?.slate_quality_distribution || {};
  const lastUpdated = data?.meta?.generated_at || panelStatus.lastUpdated || status?.lastUpdated || null;

  return (
    <WorkspaceShell
      main={
        <>
          <PanelFrame
            title="Portfolio Summary"
            subtitle="Slate-level governance before individual structures are allowed to dominate portfolio behavior."
          >
            <CompactStatGrid
              items={[
                { label: 'Suggested Exposure', value: portfolioSummary.total_suggested_exposure || 'n/a', render: (value) => value, helper: `raw ${portfolioSummary.raw_total_exposure || 'n/a'}` },
                { label: 'Avg Conviction', value: portfolioSummary.average_conviction, digits: 2 },
                { label: 'Slate Stability', value: portfolioSummary.slate_stability || 'n/a', render: (value) => value },
                { label: 'Portfolio Risk', value: portfolioSummary.portfolio_risk || 'n/a', render: (value) => value },
                { label: 'Correlated Exposure', value: portfolioSummary.correlated_exposure || 'n/a', render: (value) => value },
                { label: 'Aggression', value: portfolioSummary.recommended_aggression || 'n/a', render: (value) => value },
                { label: 'Risk Concentration', value: portfolioSummary.risk_concentration || 'n/a', render: (value) => value },
                { label: 'Reduction', value: aggregateExposure.reduction_amount || '0.00u', render: (value) => value },
              ]}
              columns="md:grid-cols-2 xl:grid-cols-4"
            />
            <div className="mt-4 rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3 text-sm text-slate-300">
              {aggregateExposure.narrative}
            </div>
          </PanelFrame>

          <PanelFrame
            title="Executive Allocation Layer"
            subtitle="Chief portfolio deployment view after governance, compression and timing-aware capital preservation."
          >
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/6 px-4 py-3 text-sm text-slate-200">
              {executive.executive_memo?.executive_summary}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                ['Deployment Posture', executive.executive_memo?.deployment_posture],
                ['Exposure Style', executive.executive_memo?.exposure_style],
                ['Timing View', executive.executive_memo?.timing_interpretation],
                ['Risk Concentration', executive.executive_memo?.risk_concentration],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
                  <div className="mt-2 text-sm font-semibold text-white">{value || 'n/a'}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    <th className="px-3 py-2">Structure</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Exposure</th>
                    <th className="px-3 py-2">Raw</th>
                    <th className="px-3 py-2">Context</th>
                  </tr>
                </thead>
                <tbody>
                  {(executive.allocation_rows || []).map((row) => (
                    <tr key={`${row.game_id}:${row.side}`} className="rounded-2xl border border-slate-700/35 bg-slate-950/35">
                      <td className="rounded-l-2xl px-3 py-3 align-top">
                        <div className="text-white">{row.team}</div>
                        <div className="mt-1 text-xs text-slate-400">{row.matchup}</div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <SignalPill tone={row.action === 'Execute Now' ? 'positive' : row.action === 'Wait for Confirmation' ? 'warning' : row.action === 'Reduced Quality' ? 'info' : 'danger'}>
                          {row.action}
                        </SignalPill>
                      </td>
                      <td className="px-3 py-3 align-top text-white">{row.executive_exposure}</td>
                      <td className="px-3 py-3 align-top text-slate-400">{row.raw_exposure}</td>
                      <td className="rounded-r-2xl px-3 py-3 align-top text-slate-300">{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelFrame>

          <PanelFrame
            title="Operational Posture"
            subtitle="Top-level posture for how the operator should behave before thinking about any single matchup."
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                ['Market Regime', posture.marketRegime],
                ['Recommended Style', posture.recommendedStyle],
                ['Edge Environment', posture.edgeEnvironment],
                ['Timing Sensitivity', posture.timingSensitivity],
                ['Volatility Context', posture.volatilityContext],
                ['Operational Bias', posture.operationalBias],
                ['Confirmation', posture.confirmationRequirements],
                ['Exposure Posture', conclusion.exposure_posture],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
                  <div className="mt-2 text-sm font-semibold text-white">{value || 'n/a'}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3 text-sm text-slate-300">
              {conclusion.summary}
            </div>
          </PanelFrame>

          <PanelFrame
            title="Market Environment"
            subtitle="Régimen de mercado, calidad de convergencia y distribución global de estructuras del slate."
          >
            <CompactStatGrid
              items={[
                { label: 'Correction', value: environment.correctionEfficiency, render: (value) => value },
                { label: 'Disagreement', value: environment.disagreementEnvironment, render: (value) => value },
                { label: 'Stability', value: environment.stabilityRegime, render: (value) => value },
                { label: 'Volatility', value: environment.volatilityRegime, render: (value) => value },
                { label: 'Persistence Breadth', value: environment.persistenceBreadth, render: (value) => value },
                { label: 'Convergence', value: environment.marketConvergenceQuality, render: (value) => value },
                { label: 'High Conviction', value: slate['High Conviction'] || 0, digits: 0 },
                { label: 'Unstable', value: slate.Unstable || 0, digits: 0 },
              ]}
              columns="md:grid-cols-2 xl:grid-cols-4"
            />
          </PanelFrame>

          <PanelFrame
            title="Correlation Awareness"
            subtitle="Detects redundant structural risk across timing, volatility, disagreement and persistence clusters."
          >
            <div className="grid gap-3 xl:grid-cols-2">
              {(correlation.clusters || []).map((cluster) => (
                <div key={cluster.key} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">{cluster.label}</div>
                    <SignalPill tone={cluster.severity === 'Elevated' ? 'danger' : cluster.severity === 'Moderate' ? 'warning' : 'info'}>
                      {cluster.severity}
                    </SignalPill>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-700/30 px-3 py-2">
                      <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Count</div>
                      <div className="mt-1 text-white">{cluster.count}</div>
                    </div>
                    <div className="rounded-xl border border-slate-700/30 px-3 py-2">
                      <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Exposure</div>
                      <div className="mt-1 text-white">{cluster.exposure.toFixed ? `${cluster.exposure.toFixed(2)}u` : cluster.exposure}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-slate-300">{cluster.narrative}</div>
                </div>
              ))}
            </div>
          </PanelFrame>

          <PanelFrame
            title="Best Operational Structures"
            subtitle="Structures ranked for exposure quality, not raw edge magnitude alone."
          >
            <div className="grid gap-4">
              {structures.map((row) => (
                <div key={`${row.game_id}:${row.side}`} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-white">{row.team}</div>
                      <div className="mt-1 text-xs text-slate-400">{row.matchup}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <SignalPill tone={toneForTier(row.conviction_tier)}>{row.conviction_tier}</SignalPill>
                      <SignalPill tone={row.exposure === 'Pass' ? 'warning' : 'positive'}>{row.exposure}</SignalPill>
                      {row.dashboard_rank && <SignalPill tone="info">dashboard #{row.dashboard_rank}</SignalPill>}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-xl border border-slate-700/30 px-3 py-2">
                      <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Edge</div>
                      <div className="mt-1 text-white">{fmt(row.edge_pct_points, 1)} pts</div>
                    </div>
                    <div className="rounded-xl border border-slate-700/30 px-3 py-2">
                      <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Persistence</div>
                      <div className="mt-1 text-white">{fmt(row.persistence_score, 1)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-700/30 px-3 py-2">
                      <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Timing</div>
                      <div className="mt-1 text-white">{row.timing_quality_score === null || row.timing_quality_score === undefined ? 'n/a' : fmt(row.timing_quality_score, 1)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-700/30 px-3 py-2">
                      <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Conviction</div>
                      <div className="mt-1 text-white">{fmt(row.operational_conviction, 2)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-700/30 px-3 py-2">
                      <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Structure</div>
                      <div className="mt-1 text-white">{row.structure_quality}</div>
                    </div>
                  </div>
                  <div className="mt-4 text-sm text-slate-300">{row.narrative}</div>
                  <div className="mt-2 text-xs text-slate-400">{row.timing_view}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(row.reason_codes || []).map((code) => (
                      <SignalPill key={code} tone={code.includes('STRONG') ? 'positive' : code.includes('LOW') || code.includes('PENALTY') ? 'warning' : 'info'}>
                        {code}
                      </SignalPill>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </PanelFrame>

          <PanelFrame
            title="Timing & Persistence"
            subtitle="Temporal quality, preferred windows and what changed in the slate since the last window."
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <CompactStatGrid
                items={[
                  { label: 'Best Window', value: timing.best_window?.window || 'n/a', render: (value) => value },
                  { label: 'Worst Window', value: timing.worst_window?.window || 'n/a', render: (value) => value },
                  {
                    label: 'Best Timing',
                    value: timing.best_window?.average_timing_quality,
                    digits: 2,
                  },
                  {
                    label: 'Stabilization',
                    value: timing.market_stabilization,
                    render: (value) => (value === null || value === undefined ? 'n/a' : `~${Math.round(value / 60)}h`),
                  },
                ]}
              />
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 p-4">
                <div className="text-sm font-semibold text-white">What Changed Since Last Window</div>
                <div className="mt-3 grid gap-3">
                  {(timing.change_log || []).map((row) => (
                    <div key={row.change} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-700/30 px-3 py-3">
                      <div className="text-sm text-slate-300">{row.change}</div>
                      <SignalPill tone={changeStatusTone(row.status)}>{row.status}</SignalPill>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </PanelFrame>

          <PanelFrame
            title="Aggregate Exposure Intelligence"
            subtitle="Portfolio-level view of timing, volatility and disagreement risk after structure-level ranking."
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <CompactStatGrid
                items={[
                  { label: 'Active Structures', value: aggregateExposure.active_structures, digits: 0 },
                  { label: 'Passed Structures', value: aggregateExposure.passed_structures, digits: 0 },
                  { label: 'Timing Risk', value: aggregateExposure.aggregate_timing_risk || 'n/a', render: (value) => value },
                  { label: 'Volatility Risk', value: aggregateExposure.aggregate_volatility_risk || 'n/a', render: (value) => value },
                  { label: 'Disagreement Risk', value: aggregateExposure.aggregate_disagreement_risk || 'n/a', render: (value) => value },
                  { label: 'Governed Total', value: aggression.suggested_total_exposure || 'n/a', render: (value) => value },
                ]}
                columns="md:grid-cols-2 xl:grid-cols-3"
              />
              <div className="grid gap-3">
                <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Slate Stability</div>
                  <div className="mt-2 text-sm font-semibold text-white">{slateStability.state || 'n/a'}</div>
                  <div className="mt-2 text-sm text-slate-300">{slateStability.narrative}</div>
                </div>
                <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Concentration Risk</div>
                  <div className="mt-2 text-sm font-semibold text-white">{concentrationRisk.level || 'n/a'}</div>
                  <div className="mt-2 text-sm text-slate-300">{concentrationRisk.narrative}</div>
                </div>
              </div>
            </div>
          </PanelFrame>
        </>
      }
      rail={
        <>
          <PanelFrame title="Portfolio Aggression" subtitle="Aggregate deployment control based on regime, concentration and timing overlap.">
            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Recommended State</div>
                    <div className="mt-1 text-white">{aggression.state || 'n/a'}</div>
                  </div>
                  <SignalPill tone={aggression.state === 'Restricted' ? 'danger' : aggression.state === 'Defensive' || aggression.state === 'Selective' ? 'warning' : 'positive'}>
                    {aggression.suggested_total_exposure || 'n/a'}
                  </SignalPill>
                </div>
                <div className="mt-2 text-xs text-slate-400">Governance scale {aggression.governance_scale ?? 'n/a'}</div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3 text-sm text-slate-300">
                {aggression.rationale}
              </div>
            </div>
          </PanelFrame>

          <PanelFrame title="Executive Memo" subtitle="Institutional deployment memo from the portfolio CIO layer.">
            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3 text-sm text-slate-300">
                {executive.executive_memo?.recommended_deployment}
              </div>
              {(executive.executive_memo?.portfolio_warnings || []).map((warning) => (
                <div key={warning.label} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-white">{warning.label}</div>
                    <SignalPill tone={warning.severity === 'Elevated' ? 'danger' : warning.severity === 'Moderate' ? 'warning' : 'info'}>
                      {warning.severity}
                    </SignalPill>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">{warning.context}</div>
                </div>
              ))}
            </div>
          </PanelFrame>

          <PanelFrame title="Exposure Recommendations" subtitle="Conservative deployment model aligned to conviction tier.">
            <div className="grid gap-3">
              {exposure.map((row) => (
                <div key={`${row.matchup}:${row.team}`} className="flex items-center justify-between rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div>
                    <div className="text-sm text-white">{row.team}</div>
                    <div className="mt-1 text-xs text-slate-400">{row.tier}</div>
                  </div>
                  <div className="text-right">
                    <div className="mono text-sm text-white">{row.exposure}</div>
                    <div className="mt-1 text-xs text-slate-400">{fmt(row.operational_conviction, 2)}</div>
                  </div>
                </div>
              ))}
            </div>
          </PanelFrame>

          <PanelFrame title="Exposure Governance" subtitle="Portfolio caps and scaling rules applied above structure-level sizing.">
            <div className="grid gap-3">
              {[
                ['Max Single Exposure', exposureGovernance.max_single_exposure],
                ['Max Total Exposure', exposureGovernance.max_total_daily_exposure],
                ['Max Correlated Exposure', exposureGovernance.max_correlated_exposure],
                ['Volatility Scaling', exposureGovernance.volatility_regime_scaling],
                ['Timing Scaling', exposureGovernance.timing_penalty_scaling],
                ['Unstable Market Rule', exposureGovernance.unstable_market_exposure_reduction],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
                  <div className="mt-1 text-sm text-white">{value || 'n/a'}</div>
                </div>
              ))}
            </div>
          </PanelFrame>

          <PanelFrame title="Risk Layer" subtitle="Institutional risk briefing for the current posture.">
            <div className="grid gap-3">
              {riskLayer.map((row) => (
                <div key={row.label} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-white">{row.label}</div>
                    <SignalPill tone={row.severity === 'Elevated' ? 'danger' : row.severity === 'Moderate' ? 'warning' : 'info'}>{row.severity}</SignalPill>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">{row.context}</div>
                </div>
              ))}
            </div>
          </PanelFrame>

          <PanelFrame title="Research Insights" subtitle="Temporal learning translated into portfolio behavior.">
            <div className="grid gap-3 text-sm text-slate-300">
              {(data?.research_insights || []).map((line) => (
                <div key={line} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">{line}</div>
              ))}
            </div>
          </PanelFrame>

          <PanelFrame title="Operational Conclusion" subtitle="Final posture for the slate.">
            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Recommended Behavior</div>
                <div className="mt-1 text-white">{conclusion.recommended_behavior || 'n/a'}</div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Confirmation Need</div>
                <div className="mt-1 text-white">{conclusion.confirmation_need || 'n/a'}</div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Slate Conviction</div>
                <div className="mt-1 text-white">{conclusion.general_conviction || 'n/a'}</div>
              </div>
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/6 px-4 py-3 text-sm text-slate-200">
                {conclusion.summary}
              </div>
              <div className="text-xs text-slate-500">
                Updated {timestampFull(lastUpdated)} · {timeAgo(lastUpdated)}
              </div>
            </div>
          </PanelFrame>
        </>
      }
    />
  );
}
