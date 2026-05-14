import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useExecuteNowAlert } from './useExecuteNowAlert';
import CompactStatGrid from '../../shared/components/CompactStatGrid';
import PanelFrame from '../../shared/components/PanelFrame';
import SignalPill from '../../shared/components/SignalPill';
import WorkspaceShell from '../../layouts/WorkspaceShell';
import { fmt, timestampFull, timeAgo } from '../../shared/lib/formatters';
import { useLanguage } from '../../shared/i18n/LanguageProvider';
import { useDecisionPanel } from './useDecisionPanel';

function actionTone(action) {
  if (action === 'Execute Now') return 'positive';
  if (action === 'Wait for Confirmation') return 'warning';
  if (action === 'Reduced Quality') return 'info';
  if (action === 'Pass') return 'danger';
  return 'neutral';
}

function riskTone(value) {
  if (['High', 'Elevated', 'Restricted', 'unstable', 'dangerous concentration'].includes(value)) return 'danger';
  if (['Moderate', 'Defensive', 'Selective', 'mixed', 'disagreement-led', 'elevated concentration'].includes(value)) return 'warning';
  if (['Opportunistic', 'Contained', 'stable', 'low concentration'].includes(value)) return 'positive';
  return 'info';
}

function tierTone(tier) {
  if (tier === 'Elite Conviction' || tier === 'High Conviction') return 'positive';
  if (tier === 'Supportive') return 'info';
  if (tier === 'Speculative' || tier === 'Watchlist') return 'warning';
  return 'danger';
}

function statusTone(value) {
  if (value === 'OK' || value === 'Stable') return 'positive';
  if (value === 'Watch') return 'warning';
  if (value === 'Risk') return 'danger';
  return 'neutral';
}

function exposureUnits(value) {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function actionPriority(action) {
  if (action === 'Execute Now') return 4;
  if (action === 'Wait for Confirmation') return 3;
  if (action === 'Reduced Quality') return 2;
  if (action === 'Pass') return 0;
  return 1;
}

function tierPriority(tier) {
  if (tier === 'Elite Conviction') return 5;
  if (tier === 'High Conviction') return 4;
  if (tier === 'Supportive') return 3;
  if (tier === 'Speculative') return 2;
  if (tier === 'Watchlist') return 1;
  return 0;
}

function actionLabel(action, t) {
  return action ? t(`action.${action}`) : 'n/a';
}

function tierLabel(tier, t) {
  return tier ? t(`tier.${tier}`) : 'n/a';
}

const EDGE_COMPONENTS = [
  { key: 'starter_edge', label: 'Starter' },
  { key: 'bullpen_edge', label: 'Bullpen' },
  { key: 'lineup_quality', label: 'Lineup' },
  { key: 'offensive_form', label: 'Offense' },
  { key: 'split_edge', label: 'Splits' },
  { key: 'recent_form', label: 'Form' },
];

function cap(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

function buildBreakdownReading(key, score, explanation, edgePts) {
  const magnitude = Math.abs(score);
  const pos = score >= 0;
  const level = magnitude >= 0.55 ? 'significant' : magnitude >= 0.25 ? 'moderate' : magnitude >= 0.08 ? 'slight' : 'minimal';

  if (key === 'starter_edge') {
    const m = explanation?.match(/starter (.+) vs (.+)/);
    if (m) {
      const sp1 = m[1].trim(); const sp2 = m[2].trim();
      return pos
        ? `${sp1} holds a ${level} edge over ${sp2} — xERA, WHIP and K/9`
        : `${sp2} outpitches ${sp1} — ${level} disadvantage on xERA and WHIP`;
    }
  }
  if (key === 'bullpen_edge') {
    const m = explanation?.match(/ERA ([\d.]+) with (\w+)/);
    const era = m?.[1]; const fatigue = m?.[2];
    return pos
      ? `Bullpen has ${level} advantage — opponent ERA higher in this matchup`
      : `Opponent bullpen stronger${era ? ` — team ERA ${era}${fatigue ? `, ${fatigue} fatigue` : ''}` : ''}`;
  }
  if (key === 'lineup_quality') {
    const m = explanation?.match(/OPS ([\d.]+) and xwOBA ([\d.]+)/);
    const ops = m?.[1]; const xwoba = m?.[2];
    return pos
      ? `${cap(level)} lineup edge — OPS ${ops ?? 'n/a'}, xwOBA ${xwoba ?? 'n/a'} vs opponent`
      : `Opponent lineup superior in OPS and xwOBA`;
  }
  if (key === 'split_edge') {
    const m = explanation?.match(/vs (\w+)HP: ([\d.]+)/);
    const hand = m?.[1]; const ops = m?.[2];
    return pos
      ? `${cap(level)} platoon advantage vs ${hand ?? ''}HP starter — split OPS ${ops ?? 'n/a'}`
      : `Opponent has the platoon edge against this starter's handedness`;
  }
  if (key === 'offensive_form') {
    const m = explanation?.match(/runs\/game ([\d.]+)/);
    const rpg = m?.[1];
    return pos
      ? `Offense in ${level} form — ${rpg ?? 'n/a'} runs/game outpacing opponent`
      : `Opponent offense outscoring this team recently`;
  }
  if (key === 'recent_form') {
    const m = explanation?.match(/last 10 ([\d-]+) with run diff ([-\d.]+)/);
    const rec = m?.[1]; const diff = m?.[2];
    const diffSign = diff && Number(diff) > 0 ? '+' : '';
    return pos
      ? `${rec ?? 'n/a'} last 10, ${diffSign}${diff ?? 'n/a'} run diff — ${level} form edge over opponent`
      : `Opponent in better recent form`;
  }
  if (key === '__market__') {
    const pts = Math.abs(edgePts ?? 0).toFixed(1);
    return pos
      ? `Market undervaluing this team by ~${pts} probability points`
      : `Model estimates this team is overpriced by ~${pts} points`;
  }
  return pos ? `${cap(level)} advantage in this category` : `${cap(level)} disadvantage in this category`;
}

function EdgeBreakdown({ structure }) {
  if (!structure?.component_scores || !structure?.component_weights) return null;

  const scores = structure.component_scores;
  const weights = structure.component_weights;
  const explanations = structure.component_explanations || {};
  const edgePts = structure.edge_pct_points;

  const contributions = EDGE_COMPONENTS.map(({ key, label }) => {
    const contribution = (scores[key] ?? 0) * (weights[key] ?? 0) * 18;
    return { key, label, contribution };
  });

  const maxAbs = Math.max(...contributions.map((c) => Math.abs(c.contribution)), 0.001);

  return (
    <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-slate-950/40 px-4 py-3">
      <div className="mono text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-3">Edge Breakdown</div>

      <div className="grid gap-[7px]">
        {contributions.map(({ key, label, contribution }) => {
          const pct = (Math.abs(contribution) / maxAbs) * 100;
          const positive = contribution >= 0;
          return (
            <div key={label} className="flex items-center gap-3">
              <div className="mono text-[10px] w-12 shrink-0 text-slate-400">{label}</div>
              <div className="flex-1 h-[5px] bg-slate-800/80 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${positive ? 'bg-emerald-400/80' : 'bg-rose-400/80'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className={`mono text-[10px] w-8 text-right shrink-0 tabular-nums ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {positive ? '+' : ''}{contribution.toFixed(1)}
              </div>
            </div>
          );
        })}
        {edgePts !== null && edgePts !== undefined && (
          <div className="mt-1 pt-[7px] border-t border-slate-700/30 flex items-center gap-3">
            <div className="mono text-[10px] w-12 shrink-0 text-slate-400">vs Mkt</div>
            <div className="flex-1 h-[5px] bg-slate-800/80 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-sky-400/80"
                style={{ width: `${Math.min(Math.abs(edgePts) / 15 * 100, 100)}%` }}
              />
            </div>
            <div className="mono text-[10px] w-8 text-right shrink-0 tabular-nums text-sky-400">
              {edgePts > 0 ? '+' : ''}{edgePts.toFixed(1)}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-slate-700/25 pt-3">
        <div className="mono text-[10px] uppercase tracking-[0.22em] text-slate-600 mb-2">Reading</div>
        <div className="grid divide-y divide-slate-700/20">
          {contributions.map(({ key, label, contribution }) => {
            const positive = contribution >= 0;
            const reading = buildBreakdownReading(key, scores[key] ?? 0, explanations[key], edgePts);
            return (
              <div key={key} className="flex gap-3 py-[5px] items-baseline">
                <div className={`mono text-[10px] w-20 shrink-0 tabular-nums ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {label} {positive ? '+' : ''}{contribution.toFixed(2)}
                </div>
                <div className="text-[11px] text-slate-400 leading-snug">{reading}</div>
              </div>
            );
          })}
          {edgePts !== null && edgePts !== undefined && (
            <div className="flex gap-3 py-[5px] items-baseline">
              <div className="mono text-[10px] w-20 shrink-0 tabular-nums text-sky-400">
                vs Mkt {edgePts > 0 ? '+' : ''}{edgePts.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400 leading-snug">
                {buildBreakdownReading('__market__', edgePts, null, edgePts)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function findStructureForAllocation(structures, allocation) {
  if (!allocation) return null;
  return (structures || []).find((s) => (
    s.game_id === allocation.game_id && (s.side ?? s.selection_side) === allocation.side
  )) || null;
}

function resolvePrimaryAllocation(rows) {
  return [...(rows || [])]
    .filter((row) => row.action !== 'Pass' && exposureUnits(row.executive_exposure) > 0)
    .sort((a, b) => (
      actionPriority(b.action) - actionPriority(a.action)
      || exposureUnits(b.executive_exposure) - exposureUnits(a.executive_exposure)
      || tierPriority(b.conviction_tier) - tierPriority(a.conviction_tier)
      || Number(b.operational_conviction || 0) - Number(a.operational_conviction || 0)
    ))[0] || null;
}

function resolveTopRawEdge(structures) {
  return [...(structures || [])]
    .sort((a, b) => Number(b.quant_score || 0) - Number(a.quant_score || 0))[0] || null;
}

function findAllocationForStructure(rows, structure) {
  if (!structure) return null;
  const structureSide = structure.selection_side || structure.side;
  return (rows || []).find((row) => (
    row.game_id === structure.game_id
    && (!structureSide || row.side === structureSide)
  )) || null;
}

function resolveHighConvictionSignals(rows) {
  return [...(rows || [])]
    .filter((row) => ['Elite Conviction', 'High Conviction'].includes(row.conviction_tier))
    .sort((a, b) => (
      tierPriority(b.conviction_tier) - tierPriority(a.conviction_tier)
      || actionPriority(b.action) - actionPriority(a.action)
      || exposureUnits(b.executive_exposure) - exposureUnits(a.executive_exposure)
    ));
}

function DetailCard({ label, value, helper, tone = 'neutral', badge }) {
  return (
    <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
          <div className="mt-2 text-lg font-semibold text-white">{value ?? 'n/a'}</div>
        </div>
        <SignalPill tone={tone}>{badge || tone}</SignalPill>
      </div>
      {helper && <div className="mt-2 text-xs text-slate-400">{helper}</div>}
    </div>
  );
}

function AllocationEvidence({ evidence, t }) {
  if (!evidence) {
    return <div className="text-sm text-slate-400">{t('decision.noLinkedEvidence')}</div>;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
      <div className="grid gap-3 md:grid-cols-2">
        {[
          [t('decision.persistence'), fmt(evidence.persistence_score, 1)],
          [t('decision.timing'), evidence.timing_quality_score === null || evidence.timing_quality_score === undefined ? 'n/a' : fmt(evidence.timing_quality_score, 1)],
          [t('decision.volatility'), fmt(evidence.volatility_score, 1)],
          [t('decision.conviction'), fmt(evidence.operational_conviction, 2)],
          [t('decision.validation'), evidence.validation_bucket || 'n/a'],
          [t('decision.lifecycle'), evidence.lifecycle || 'n/a'],
          [t('decision.dashboardRank'), evidence.dashboard_rank ? `#${evidence.dashboard_rank}` : 'n/a'],
          [t('decision.memoRank'), evidence.memo_rank ? `#${evidence.memo_rank}` : 'n/a'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-700/30 bg-slate-950/35 px-3 py-2">
            <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
            <div className="mt-1 text-sm text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3">
        <div className="rounded-xl border border-slate-700/30 bg-slate-950/35 px-3 py-2">
          <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{t('decision.evidenceNarrative')}</div>
          <div className="mt-2 text-sm text-slate-300">{evidence.narrative || t('decision.noNarrative')}</div>
          {evidence.timing_view && <div className="mt-2 text-xs text-slate-400">{evidence.timing_view}</div>}
        </div>
        <div className="rounded-xl border border-slate-700/30 bg-slate-950/35 px-3 py-2">
          <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{t('decision.downgradeCues')}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(evidence.reason_codes || []).length ? (
              evidence.reason_codes.map((code) => (
                <SignalPill key={code} tone={code.includes('STRONG') ? 'positive' : code.includes('LOW') || code.includes('PENALTY') || code.includes('DECAY') ? 'warning' : 'info'}>
                  {code}
                </SignalPill>
              ))
            ) : (
              <span className="text-sm text-slate-400">{t('decision.noReasonCodes')}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AllocationActions({ rows, structures, t }) {
  const [expandedKey, setExpandedKey] = useState(null);

  if (!rows?.length) {
    return <div className="text-sm text-slate-400">{t('decision.noAllocationRows')}</div>;
  }

  const evidenceByKey = new Map((structures || []).map((row) => [`${row.game_id}:${row.side}`, row]));

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-y-2 text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.22em] text-slate-500">
            <th className="px-3 py-2">{t('decision.structure')}</th>
            <th className="px-3 py-2">{t('decision.capitalAction')}</th>
            <th className="px-3 py-2">{t('decision.executive')}</th>
            <th className="px-3 py-2">{t('decision.raw')}</th>
            <th className="px-3 py-2">{t('decision.conviction')}</th>
            <th className="px-3 py-2">{t('decision.why')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = `${row.game_id}:${row.side}`;
            const expanded = expandedKey === key;
            const evidence = evidenceByKey.get(key) || null;
            return (
              <Fragment key={key}>
                <tr className="bg-slate-950/35">
                  <td className="rounded-l-2xl border-y border-l border-slate-700/35 px-3 py-3 align-top">
                    <button type="button" onClick={() => setExpandedKey(expanded ? null : key)} className="text-left">
                      <div className="font-semibold text-white">{row.team}</div>
                      <div className="mt-1 text-xs text-slate-400">{row.matchup}</div>
                      <div className="mt-2 mono text-[10px] uppercase tracking-[0.16em] text-sky-200">
                        {expanded ? t('decision.hideEvidence') : t('decision.showEvidence')}
                      </div>
                    </button>
                  </td>
                  <td className="border-y border-slate-700/35 px-3 py-3 align-top">
                    <SignalPill tone={actionTone(row.action)}>{actionLabel(row.action, t)}</SignalPill>
                  </td>
                  <td className="border-y border-slate-700/35 px-3 py-3 align-top text-white">{row.executive_exposure || 'n/a'}</td>
                  <td className="border-y border-slate-700/35 px-3 py-3 align-top text-slate-400">{row.raw_exposure || 'n/a'}</td>
                  <td className="border-y border-slate-700/35 px-3 py-3 align-top">
                    <SignalPill tone={tierTone(row.conviction_tier)}>{tierLabel(row.conviction_tier, t)}</SignalPill>
                  </td>
                  <td className="rounded-r-2xl border-y border-r border-slate-700/35 px-3 py-3 align-top text-slate-300">
                    {row.reason || t('decision.noReason')}
                  </td>
                </tr>
                {expanded && (
                  <tr key={`${key}:evidence`}>
                    <td colSpan={6} className="rounded-2xl border border-sky-300/20 bg-sky-300/6 p-4">
                      <AllocationEvidence evidence={evidence} t={t} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EvidenceRows({ structures, t }) {
  if (!structures?.length) {
    return <div className="text-sm text-slate-400">{t('decision.noDecisionEvidence')}</div>;
  }

  return (
    <div className="grid gap-4">
      {structures.map((row) => (
        <div key={`${row.game_id}:${row.side}`} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-white">{row.team}</div>
              <div className="mt-1 text-xs text-slate-400">{row.matchup}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <SignalPill tone={tierTone(row.conviction_tier)}>{tierLabel(row.conviction_tier, t)}</SignalPill>
              <SignalPill tone={row.exposure === 'Pass' ? 'warning' : 'positive'}>{row.exposure || 'n/a'}</SignalPill>
              {row.lifecycle && <SignalPill tone={row.lifecycle === 'collapsing' ? 'danger' : row.lifecycle === 'strengthening' ? 'positive' : 'info'}>{row.lifecycle}</SignalPill>}
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              ['Edge', `${fmt(row.edge_pct_points, 1)} pts`],
              [t('decision.persistence'), fmt(row.persistence_score, 1)],
              [t('decision.timing'), row.timing_quality_score === null || row.timing_quality_score === undefined ? 'n/a' : fmt(row.timing_quality_score, 1)],
              [t('decision.volatility'), fmt(row.volatility_score, 1)],
              [t('decision.conviction'), fmt(row.operational_conviction, 2)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-700/30 px-3 py-2">
                <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
                <div className="mt-1 text-white">{value}</div>
              </div>
            ))}
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
  );
}

export default function DecisionPanelWorkspace({ overview, status, active }) {
  const { t } = useLanguage();
  const refreshMs = overview?.meta?.refresh_policy?.interval_ms || 120000;
  const { data, status: panelStatus } = useDecisionPanel(active, refreshMs);

  const [alertBanner, setAlertBanner] = useState(null);
  const bannerTimerRef = useRef(null);

  const handleNewSignals = useCallback((signals) => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setAlertBanner(signals);
    bannerTimerRef.current = setTimeout(() => setAlertBanner(null), 12000);
  }, []);

  const allocationRows = data?.executive_allocation?.allocation_rows || [];
  const alertDate = data?.meta?.date || null;

  useExecuteNowAlert(allocationRows, alertDate, handleNewSignals);
  useEffect(() => () => { if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current); }, []);

  if (panelStatus.loading && !data) {
    return (
      <PanelFrame title={t('decision.title')} subtitle={t('decision.subtitle')}>
        <div className="text-sm text-slate-300">{t('decision.loading')}</div>
      </PanelFrame>
    );
  }

  if (panelStatus.error && !data) {
    return (
      <PanelFrame title={t('decision.title')} subtitle={t('decision.errorSubtitle')}>
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
  const executiveMemo = executive.executive_memo || {};
  const deployment = executive.deployment_evaluation || {};
  const structures = data?.best_structures || [];
  const primaryAllocation = executive.primary_allocation || resolvePrimaryAllocation(allocationRows);
  const policyGates = executive.policy_gates || [];
  const decisionLedger = data?.decision_ledger || {};
  const learning = data?.learning_observability || {};
  const topRawEdge = resolveTopRawEdge(structures);
  const topRawEdgeAllocation = findAllocationForStructure(allocationRows, topRawEdge);
  const primaryStructure = findStructureForAllocation(structures, primaryAllocation);
  const highConvictionSignals = resolveHighConvictionSignals(allocationRows);
  const timing = data?.timing_persistence || {};
  const riskLayer = data?.risk_layer || [];
  const conclusion = data?.operational_conclusion || {};
  const slate = data?.slate_quality_distribution || {};
  const lastUpdated = data?.meta?.generated_at || panelStatus.lastUpdated || status?.lastUpdated || null;

  return (
    <WorkspaceShell
      main={
        <>
          {alertBanner && (
            <div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-5 py-4 animate-pulse">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mono text-[11px] uppercase tracking-[0.3em] text-emerald-300">Execute Now</div>
                  <div className="mt-1 flex flex-wrap gap-3">
                    {alertBanner.map((s) => (
                      <span key={`${s.game_id}:${s.side}`} className="text-sm font-semibold text-white">
                        {s.team} — {s.executive_exposure} · {s.conviction_tier}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAlertBanner(null)}
                  className="mono text-[10px] uppercase tracking-widest text-emerald-400 hover:text-white"
                >
                  dismiss
                </button>
              </div>
            </div>
          )}
          <PanelFrame
            title={t('decision.title')}
            subtitle={t('decision.subtitle')}
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
              <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/6 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="mono text-[11px] uppercase tracking-[0.3em] text-emerald-200">{t('decision.primaryAllocation')}</div>
                    <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">{primaryAllocation?.team || t('decision.noActiveAllocation')}</h2>
                    <div className="mt-2 text-sm text-slate-300">{primaryAllocation?.matchup || t('decision.noClearedStructure')}</div>
                  </div>
                  <SignalPill tone={primaryAllocation ? actionTone(primaryAllocation.action) : 'warning'}>
                    {primaryAllocation ? actionLabel(primaryAllocation.action, t) : t('decision.noAllocation')}
                  </SignalPill>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-emerald-300/20 bg-slate-950/35 px-4 py-3">
                    <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{t('decision.executiveExposure')}</div>
                    <div className="mt-1 text-xl font-semibold text-white">{primaryAllocation?.executive_exposure || '0.00u'}</div>
                  </div>
                  <div className="rounded-2xl border border-emerald-300/20 bg-slate-950/35 px-4 py-3">
                    <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{t('decision.conviction')}</div>
                    <div className="mt-1 text-xl font-semibold text-white">{tierLabel(primaryAllocation?.conviction_tier, t)}</div>
                  </div>
                  <div className="rounded-2xl border border-emerald-300/20 bg-slate-950/35 px-4 py-3">
                    <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{t('decision.slatePosture')}</div>
                    <div className="mt-1 text-xl font-semibold text-white">{executive.aggression_state || portfolioSummary.recommended_aggression || 'n/a'}</div>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-slate-950/35 px-4 py-3 text-sm text-slate-200">
                  {primaryAllocation?.reason || executiveMemo.recommended_deployment || t('decision.noDeploymentRecommendation')}
                </div>
                <EdgeBreakdown structure={primaryStructure} />
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{t('decision.highConvictionSignals')}</div>
                  <div className="mt-3 grid gap-2">
                    {highConvictionSignals.length ? highConvictionSignals.map((row) => (
                      <div key={`${row.game_id}:${row.side}`} className="rounded-xl border border-slate-700/30 bg-slate-950/40 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">{row.team}</div>
                            <div className="mt-1 text-xs text-slate-400">{row.executive_exposure || '0.00u'} / {tierLabel(row.conviction_tier, t)}</div>
                          </div>
                          <SignalPill tone={actionTone(row.action)}>{actionLabel(row.action, t)}</SignalPill>
                        </div>
                      </div>
                    )) : (
                      <div className="text-sm text-slate-400">{t('decision.noHighConvictionSignals')}</div>
                    )}
                  </div>
                </div>
                <DetailCard
                  label={t('decision.topRawEdgeSignal')}
                  value={topRawEdge?.team || 'n/a'}
                  helper={topRawEdge ? `${topRawEdge.matchup} / ${t('decision.rawScore')} ${fmt(topRawEdge.quant_score, 2)}` : t('decision.noRawEdge')}
                  tone={topRawEdgeAllocation ? actionTone(topRawEdgeAllocation.action) : 'info'}
                  badge={topRawEdgeAllocation ? actionLabel(topRawEdgeAllocation.action, t) : t('decision.rawSignal')}
                />
                <DetailCard
                  label={t('decision.governedExposure')}
                  value={portfolioSummary.total_suggested_exposure || deployment.total_allocated_exposure}
                  helper={`raw ${portfolioSummary.raw_total_exposure || 'n/a'} / allocated ${deployment.total_allocated_exposure || 'n/a'}`}
                  tone={riskTone(portfolioSummary.recommended_aggression)}
                />
                <DetailCard
                  label={t('decision.portfolioRisk')}
                  value={portfolioSummary.portfolio_risk || 'n/a'}
                  helper={concentrationRisk.level || 'n/a'}
                  tone={riskTone(portfolioSummary.portfolio_risk)}
                />
                <DetailCard
                  label={t('decision.exposureCompression')}
                  value={aggregateExposure.reduction_amount || deployment.compression_from_raw || '0.00u'}
                  helper={aggression.rationale || aggregateExposure.narrative}
                  tone={aggregateExposure.reduction_amount === '0.00u' ? 'positive' : 'warning'}
                />
              </div>
            </div>
          </PanelFrame>

          <PanelFrame
            title={t('decision.capitalActions')}
            subtitle={t('decision.capitalActionsSubtitle')}
          >
            <AllocationActions rows={allocationRows} structures={structures} t={t} />
          </PanelFrame>

          <PanelFrame
            title={t('decision.portfolioRiskTitle')}
            subtitle={t('decision.portfolioRiskSubtitle')}
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <CompactStatGrid
                items={[
                  { label: t('decision.rawExposure'), value: portfolioSummary.raw_total_exposure || 'n/a', render: (value) => value },
                  { label: t('decision.governedExposure'), value: portfolioSummary.total_suggested_exposure || 'n/a', render: (value) => value },
                  { label: t('decision.correlatedExposure'), value: portfolioSummary.correlated_exposure || 'n/a', render: (value) => value },
                  { label: t('decision.riskConcentration'), value: portfolioSummary.risk_concentration || 'n/a', render: (value) => value },
                  { label: t('decision.timingRisk'), value: aggregateExposure.aggregate_timing_risk || 'n/a', render: (value) => value },
                  { label: t('decision.volatilityRisk'), value: aggregateExposure.aggregate_volatility_risk || 'n/a', render: (value) => value },
                  { label: t('decision.disagreementRisk'), value: aggregateExposure.aggregate_disagreement_risk || 'n/a', render: (value) => value },
                  { label: t('decision.slateStability'), value: slateStability.state || 'n/a', render: (value) => value },
                ]}
                columns="md:grid-cols-2 xl:grid-cols-4"
              />
              <div className="grid gap-3">
                <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{t('decision.riskConcentration')}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <SignalPill tone={riskTone(concentrationRisk.level)}>{concentrationRisk.level || 'n/a'}</SignalPill>
                    {(concentrationRisk.drivers || []).map((driver) => <SignalPill key={driver} tone="warning">{driver}</SignalPill>)}
                  </div>
                  <div className="mt-3 text-sm text-slate-300">{concentrationRisk.narrative}</div>
                </div>
                <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{t('decision.slateStability')}</div>
                  <div className="mt-2 text-sm font-semibold text-white">{slateStability.state || 'n/a'}</div>
                  <div className="mt-2 text-sm text-slate-300">{slateStability.narrative}</div>
                </div>
              </div>
            </div>
          </PanelFrame>

          <PanelFrame
            title={t('decision.decisionEvidence')}
            subtitle={t('decision.decisionEvidenceSubtitle')}
          >
            <EvidenceRows structures={structures} t={t} />
          </PanelFrame>

          <PanelFrame
            title={t('decision.marketTimingContext')}
            subtitle={t('decision.marketTimingSubtitle')}
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <CompactStatGrid
                items={[
                  { label: t('decision.correction'), value: environment.correctionEfficiency || 'n/a', render: (value) => value },
                  { label: t('decision.disagreement'), value: environment.disagreementEnvironment || 'n/a', render: (value) => value },
                  { label: t('decision.stability'), value: environment.stabilityRegime || 'n/a', render: (value) => value },
                  { label: t('decision.volatility'), value: environment.volatilityRegime || 'n/a', render: (value) => value },
                  { label: t('decision.persistenceBreadth'), value: environment.persistenceBreadth || 'n/a', render: (value) => value },
                  { label: t('decision.convergence'), value: environment.marketConvergenceQuality || 'n/a', render: (value) => value },
                  { label: t('decision.highConviction'), value: slate['High Conviction'] || 0, digits: 0 },
                  { label: t('decision.unstable'), value: slate.Unstable || 0, digits: 0 },
                ]}
                columns="md:grid-cols-2"
              />
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 p-4">
                <div className="text-sm font-semibold text-white">{t('decision.timingChangeLog')}</div>
                <div className="mt-3 grid gap-3">
                  {(timing.change_log || []).map((row) => (
                    <div key={row.change} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-700/30 px-3 py-3">
                      <div className="text-sm text-slate-300">{row.change}</div>
                      <SignalPill tone={statusTone(row.status)}>{row.status}</SignalPill>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </PanelFrame>
        </>
      }
      rail={
        <>
          <PanelFrame title={t('decision.capitalGuardrails')} subtitle={t('decision.capitalGuardrailsSubtitle')}>
            <div className="grid gap-3">
              {[
                [t('decision.maxSingleExposure'), exposureGovernance.max_single_exposure],
                [t('decision.maxTotalExposure'), exposureGovernance.max_total_daily_exposure],
                [t('decision.maxCorrelatedExposure'), exposureGovernance.max_correlated_exposure],
                [t('decision.volatilityScaling'), exposureGovernance.volatility_regime_scaling],
                [t('decision.timingScaling'), exposureGovernance.timing_penalty_scaling],
                [t('decision.unstableMarketRule'), exposureGovernance.unstable_market_exposure_reduction],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
                  <div className="mt-1 text-sm text-white">{value || 'n/a'}</div>
                </div>
              ))}
            </div>
          </PanelFrame>

          <PanelFrame title={t('decision.invalidationPressure')} subtitle={t('decision.invalidationPressureSubtitle')}>
            <div className="grid gap-3">
              {(executive.deployment_risk || riskLayer || []).map((row) => (
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

          <PanelFrame title={t('decision.operationalPosture')} subtitle={t('decision.operationalPostureSubtitle')}>
            <div className="grid gap-3">
              {[
                [t('decision.marketRegime'), posture.marketRegime],
                [t('decision.recommendedStyle'), posture.recommendedStyle],
                [t('decision.edgeEnvironment'), posture.edgeEnvironment],
                [t('decision.timingSensitivity'), posture.timingSensitivity],
                [t('decision.volatilityContext'), posture.volatilityContext],
                [t('decision.confirmation'), posture.confirmationRequirements],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
                  <div className="mt-1 text-sm text-white">{value || 'n/a'}</div>
                </div>
              ))}
            </div>
          </PanelFrame>

          <PanelFrame title={t('decision.correlationClusters')} subtitle={t('decision.correlationClustersSubtitle')}>
            <div className="grid gap-3">
              {(correlation.clusters || []).slice(0, 6).map((cluster) => (
                <div key={cluster.key} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-white">{cluster.label}</div>
                    <SignalPill tone={cluster.severity === 'Elevated' ? 'danger' : cluster.severity === 'Moderate' ? 'warning' : 'info'}>
                      {cluster.severity}
                    </SignalPill>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    {cluster.count} structures / {cluster.exposure?.toFixed ? `${cluster.exposure.toFixed(2)}u` : cluster.exposure}
                  </div>
                  <div className="mt-2 text-xs text-slate-400">{cluster.narrative}</div>
                </div>
              ))}
            </div>
          </PanelFrame>

          <PanelFrame title={t('decision.researchInsights')} subtitle={t('decision.researchInsightsSubtitle')}>
            <div className="grid gap-3 text-sm text-slate-300">
              {(data?.research_insights || []).map((line) => (
                <div key={line} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">{line}</div>
              ))}
            </div>
          </PanelFrame>

          <PanelFrame title={t('decision.update')} subtitle={t('decision.updateSubtitle')}>
            <div className="text-sm text-slate-300">
              {t('decision.updated')} {timestampFull(lastUpdated)}
            </div>
            <div className="mt-1 mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{timeAgo(lastUpdated)}</div>
          </PanelFrame>

          <PanelFrame title={t('decision.auditMemory')} subtitle={t('decision.auditMemorySubtitle')}>
            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{t('decision.decisionLedger')}</div>
                    <div className="mt-1 text-sm text-white">{decisionLedger.path || 'n/a'}</div>
                  </div>
                  <SignalPill tone={decisionLedger.status === 'active' ? 'positive' : 'warning'}>{decisionLedger.status || 'n/a'}</SignalPill>
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  {t('decision.ledgerRecords')}: {decisionLedger.total_records ?? 0} / {t('decision.ledgerAppended')}: {decisionLedger.appended_records ?? 0}
                </div>
              </div>
              {policyGates.map((gate) => (
                <div key={gate.code} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-white">{gate.code}</div>
                    <SignalPill tone={gate.status === 'passed' ? 'positive' : 'danger'}>{gate.status}</SignalPill>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">{gate.effect}</div>
                </div>
              ))}
            </div>
          </PanelFrame>

          <PanelFrame title={t('decision.learningObservability')} subtitle={t('decision.learningObservabilitySubtitle')}>
            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{t('decision.learningStatus')}</div>
                    <div className="mt-1 text-sm text-white">{learning.learning_status?.status || 'n/a'}</div>
                  </div>
                  <SignalPill tone={learning.learning_status?.status === 'learning' ? 'positive' : learning.learning_status?.status === 'collecting_evidence' ? 'info' : 'warning'}>
                    {learning.outcome_attribution?.complete ?? 0} / {learning.outcome_attribution?.decisions ?? 0}
                  </SignalPill>
                </div>
                <div className="mt-2 text-xs text-slate-400">{learning.learning_status?.rationale || t('decision.noLearningStatus')}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{t('decision.traceNodes')}</div>
                  <div className="mt-1 text-sm text-white">{learning.decision_trace?.node_count ?? 0}</div>
                </div>
                <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{t('decision.feedback')}</div>
                  <div className="mt-1 text-sm text-white">{learning.policy_feedback?.recommendations ?? 0}</div>
                </div>
              </div>
            </div>
          </PanelFrame>
        </>
      }
    />
  );
}
