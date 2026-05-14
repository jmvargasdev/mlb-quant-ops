import CompactStatGrid from '../../shared/components/CompactStatGrid';
import MetricTile from '../../components/MetricTile';
import PanelFrame from '../../shared/components/PanelFrame';
import SignalPill from '../../shared/components/SignalPill';
import { useState } from 'react';
import { fmt, pct, timeAgo, timestampFull } from '../../shared/lib/formatters';
import { useLanguage } from '../../shared/i18n/LanguageProvider';
import { HOME_MOCK_DASHBOARD } from './homeMockData';

function metricStatus(value) {
  if (value === null || value === undefined) return 'unknown';
  if (typeof value === 'number') {
    if (value >= 65) return 'healthy';
    if (value >= 45) return 'degraded';
    return 'incomplete';
  }
  if (String(value).includes('-')) return 'degraded';
  return 'healthy';
}

function statusTone(value) {
  if (value === null || value === undefined) return 'unknown';
  if (typeof value === 'number') {
    if (value >= 65) return 'positive';
    if (value >= 45) return 'warning';
    return 'danger';
  }
  if (String(value).includes('available') || String(value).includes('passed') || String(value).includes('learning')) return 'positive';
  return 'warning';
}

export default function HomeWorkspace({ overview, status, onNavigate }) {
  const { t } = useLanguage();
  const useMockData = import.meta.env.VITE_HOME_MOCK_DATA !== 'false';
  const performance = useMockData ? HOME_MOCK_DASHBOARD : (overview?.performance_dashboard || {});
  const health = overview?.operational_health || {};
  const scheduleTiming = overview?.meta?.schedule_timing || {};
  const lastUpdated = overview?.meta?.generated_at || status?.lastUpdated || null;
  const snapshotSignature = overview?.meta?.latest_snapshot_signature || 'n/a';
  const refreshProfile = overview?.meta?.refresh_policy?.profile || 'n/a';
  const unitAssumptionPct = performance.unit_assumption_pct ?? 2;
  const methodNote = t('home.methodNote').replace('{unit}', pct(unitAssumptionPct, 0));
  const performanceWindows = performance.performance_windows || [];
  const [selectedWindowKey, setSelectedWindowKey] = useState(performanceWindows[1]?.key || performanceWindows[0]?.key || '30d');
  const selectedWindow = performanceWindows.find((window) => window.key === selectedWindowKey) || performanceWindows[0] || null;

  const performanceTiles = [
    {
      label: t('home.primaryAllocationAccuracy'),
      display: performance.primary_allocation?.accuracy === null || performance.primary_allocation?.accuracy === undefined
        ? 'n/a'
        : pct(performance.primary_allocation.accuracy, 1),
      status: metricStatus(performance.primary_allocation?.accuracy),
    },
    {
      label: t('home.highConvictionAccuracy'),
      display: performance.high_conviction?.accuracy === null || performance.high_conviction?.accuracy === undefined
        ? 'n/a'
        : pct(performance.high_conviction.accuracy, 1),
      status: metricStatus(performance.high_conviction?.accuracy),
    },
    {
      label: t('home.performanceRoi'),
      display: performance.realized_roi_pct === null || performance.realized_roi_pct === undefined
        ? 'n/a'
        : pct(performance.realized_roi_pct, 2),
      status: performance.realized_roi_pct >= 0 ? 'healthy' : 'degraded',
    },
    {
      label: t('home.sampleSizeLabel'),
      display: performance.sample_size === null || performance.sample_size === undefined ? 'n/a' : fmt(performance.sample_size, 0),
      status: performance.sample_size > 0 ? 'healthy' : 'unknown',
    },
  ];

  const trustRows = [
    {
      label: t('home.decisionLedgerCoverage'),
      value: `${fmt(performance.trust?.ledger_coverage, 1)}%`,
      tone: statusTone(performance.trust?.ledger_coverage),
      helper: t('home.decisionLedgerCoverageHelp'),
    },
    {
      label: t('home.contractValidation'),
      value: performance.trust?.contract_validation || 'n/a',
      tone: performance.trust?.contract_validation === 'passed' ? 'healthy' : 'degraded',
      helper: t('home.contractValidationHelp'),
    },
    {
      label: t('home.learningStatus'),
      value: performance.trust?.learning_status || 'n/a',
      tone: performance.trust?.learning_status === 'learning' ? 'healthy' : performance.trust?.learning_status === 'collecting_evidence' ? 'degraded' : 'unknown',
      helper: t('home.learningStatusHelp'),
    },
    {
      label: t('home.policyFeedback'),
      value: performance.trust?.policy_feedback_status || 'n/a',
      tone: performance.trust?.policy_feedback_status === 'available' ? 'healthy' : 'unknown',
      helper: `${fmt(performance.trust?.recommendation_count, 0)} ${t('home.recommendations')}`,
    },
  ];

  const quickLinks = [
    { id: 'decision-panel', label: t('home.goAllocation'), note: t('home.goAllocationNote') },
    { id: 'research', label: t('home.goResearch'), note: t('home.goResearchNote') },
    { id: 'ops-health', label: t('home.goHealth'), note: t('home.goHealthNote') },
  ];

  return (
    <div className="grid gap-5">
      <PanelFrame className="border border-sky-300/15 bg-slate-950/55 p-3 lg:p-4">
        <div>
          <div className="inline-flex rounded-md border border-sky-300/25 bg-sky-300/8 px-3 py-1 mono text-[11px] uppercase tracking-[0.3em] text-sky-200">
            {t('home.performanceDashboard')}
          </div>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-3xl">
              <h2 className="text-2xl font-semibold tracking-tight text-white lg:text-[2.1rem]">{t('home.title')}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {t('home.lead')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {useMockData && <SignalPill tone="info">{t('home.mockMode')}</SignalPill>}
              <SignalPill tone={performance.status === 'tracking_results' ? 'positive' : performance.status === 'collecting_evidence' ? 'info' : 'warning'}>
                {t(`home.status.${performance.status || 'not_started'}`)}
              </SignalPill>
              <SignalPill tone={health.pipeline_health_score >= 65 ? 'positive' : 'warning'}>
                {t('home.pipelineHealth')}: {fmt(health.pipeline_health_score, 1)}
              </SignalPill>
              <SignalPill tone={performance.unit_assumption_pct ? 'info' : 'warning'}>
                {t('home.unitAssumption')}: {pct(unitAssumptionPct, 0)}
              </SignalPill>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <div className="rounded-lg border border-slate-700/35 bg-slate-950/35 px-3 py-2">
              <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{t('home.lastRefresh')}</div>
              <div className="mt-1 text-sm text-white">{timestampFull(lastUpdated)}</div>
            </div>
            <div className="rounded-lg border border-slate-700/35 bg-slate-950/35 px-3 py-2">
              <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{t('home.snapshotSignature')}</div>
              <div className="mt-1 max-w-[300px] break-all text-sm text-white">{snapshotSignature}</div>
            </div>
            <div className="rounded-lg border border-slate-700/35 bg-slate-950/35 px-3 py-2">
              <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{t('home.refreshPolicy')}</div>
              <div className="mt-1 text-sm text-white">{refreshProfile}</div>
            </div>
          </div>
        </div>
        {useMockData && (
          <div className="mt-4 rounded-2xl border border-sky-300/20 bg-sky-300/6 px-4 py-3 text-sm text-slate-300">
            {t('home.mockBanner')}
          </div>
        )}
      </PanelFrame>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {performanceTiles.map((metric) => (
          <MetricTile key={metric.label} metric={metric} />
        ))}
      </section>

      <PanelFrame
        title={t('home.timeframeContext')}
        subtitle={t('home.timeframeContextSubtitle')}
        className="border border-sky-300/25 bg-slate-950/55 p-5 lg:p-6"
      >
        <div className="flex flex-wrap gap-2">
          {performanceWindows.map((window) => (
            <button
              key={window.key}
              type="button"
              onClick={() => setSelectedWindowKey(window.key)}
              className={`mono rounded-md border px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition ${
                selectedWindowKey === window.key
                  ? 'border-sky-300/40 bg-sky-300/10 text-sky-50'
                  : 'border-slate-700/35 bg-slate-950/35 text-slate-400 hover:border-slate-500/45 hover:text-slate-200'
              }`}
            >
              {window.label}
            </button>
          ))}
        </div>
        {selectedWindow && (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
              <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{t('home.timeframePeriod')}</div>
              <div className="mt-1 text-lg font-semibold text-white">{selectedWindow.label}</div>
              <div className="mt-1 text-xs text-slate-400">{selectedWindow.span}</div>
            </div>
            <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
              <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{t('home.timeframeAccuracy')}</div>
              <div className="mt-1 text-lg font-semibold text-white">{pct(selectedWindow.accuracy, 1)}</div>
              <div className="mt-1 text-xs text-slate-400">{t('home.primaryAllocationAccuracy')}</div>
            </div>
            <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
              <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{t('home.timeframeRoi')}</div>
              <div className="mt-1 text-lg font-semibold text-white">{pct(selectedWindow.roi_pct, 2)}</div>
              <div className="mt-1 text-xs text-slate-400">{t('home.performanceRoi')}</div>
            </div>
            <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
              <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{t('home.timeframeSample')}</div>
              <div className="mt-1 text-lg font-semibold text-white">{fmt(selectedWindow.sample_size, 0)}</div>
              <div className="mt-1 text-xs text-slate-400">{t('home.timeframeComplete')}: {fmt(selectedWindow.complete, 0)} / {t('home.timeframePending')}: {fmt(selectedWindow.pending, 0)}</div>
            </div>
          </div>
        )}
        {selectedWindow && (
          <div className="mt-4 rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3 text-sm text-slate-300">
            <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{t('home.timeframeNote')}</div>
            <div className="mt-1">{selectedWindow.note}</div>
          </div>
        )}
      </PanelFrame>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <PanelFrame
          title={t('home.performanceSnapshot')}
          subtitle={t('home.performanceSnapshotSubtitle')}
          className="border border-sky-300/20 bg-slate-950/50 p-5 lg:p-6"
        >
          <CompactStatGrid
            items={[
              {
                label: t('home.overallAccuracy'),
                value: performance.overall?.accuracy,
                render: (value) => (value === null || value === undefined ? 'n/a' : pct(value, 1)),
                helper: t('home.overallAccuracyHelp'),
              },
              {
                label: t('home.overallRoi'),
                value: performance.realized_roi_pct,
                render: (value) => (value === null || value === undefined ? 'n/a' : pct(value, 2)),
                helper: t('home.overallRoiHelp'),
              },
              {
                label: t('home.primaryAllocationAccuracy'),
                value: performance.primary_allocation?.accuracy,
                render: (value) => (value === null || value === undefined ? 'n/a' : pct(value, 1)),
                helper: t('home.primaryAllocationHelp'),
              },
              {
                label: t('home.highConvictionAccuracy'),
                value: performance.high_conviction?.accuracy,
                render: (value) => (value === null || value === undefined ? 'n/a' : pct(value, 1)),
                helper: t('home.highConvictionHelp'),
              },
            ]}
            columns="sm:grid-cols-2"
          />
          <div className="mt-4 rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3 text-sm text-slate-300">
            {methodNote}
          </div>
        </PanelFrame>

        <PanelFrame
          title={t('home.trustLayer')}
          subtitle={t('home.trustLayerSubtitle')}
          className="border border-slate-700/35 bg-slate-950/35 p-5 lg:p-6"
        >
          <div className="grid gap-3">
            {trustRows.map((row) => (
              <div key={row.label} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{row.label}</div>
                    <div className="mt-1 text-sm text-slate-400">{row.helper}</div>
                  </div>
                  <SignalPill tone={row.tone}>{row.value}</SignalPill>
                </div>
              </div>
            ))}
          </div>
        </PanelFrame>
      </section>

      <PanelFrame title={t('home.quickAccess')} subtitle={t('home.quickAccessSubtitle')}>
        <div className="grid gap-3 md:grid-cols-3">
          {quickLinks.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => onNavigate(link.id)}
              className="rounded-2xl border border-slate-700/40 bg-slate-950/30 px-4 py-4 text-left transition hover:border-sky-300/35 hover:bg-sky-300/6"
            >
              <div className="text-sm font-semibold text-white">{link.label}</div>
              <div className="mt-1 text-xs text-slate-400">{link.note}</div>
            </button>
          ))}
        </div>
      </PanelFrame>
    </div>
  );
}
