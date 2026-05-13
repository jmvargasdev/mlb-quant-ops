import PanelFrame from '../../shared/components/PanelFrame';
import SignalPill from '../../shared/components/SignalPill';
import WorkspaceShell from '../../layouts/WorkspaceShell';
import { fmt, timeAgo, timestampFull } from '../../shared/lib/formatters';
import ClvPreparationSection from './clv/ClvPreparationSection';
import HistoricalMemorySection from './historical-memory/HistoricalMemorySection';
import MarketCorrectionSection from './market-correction/MarketCorrectionSection';
import PersistenceEvolutionSection from './persistence/PersistenceEvolutionSection';
import PersistenceSummarySection from './persistence/PersistenceSummarySection';
import SurvivedRejectedSection from './persistence/SurvivedRejectedSection';
import RankingExplainabilitySection from './ranking-explainability/RankingExplainabilitySection';
import TimingQualitySection from './timing-quality/TimingQualitySection';
import { useResearchWorkspace } from './useResearchWorkspace';
import VolatilitySection from './volatility/VolatilitySection';
import { researchPct } from './shared/ui';
import { useQuantReport } from './useQuantReport';
import { apiPath } from '../../shared/lib/runtime';

export default function ResearchWorkspace({ overview, status, active }) {
  const refreshMs = overview?.meta?.refresh_policy?.interval_ms || 120000;
  const { data, status: researchStatus } = useResearchWorkspace(active, refreshMs);
  const { report, status: reportStatus } = useQuantReport(active, refreshMs);

  if (researchStatus.loading && !data) {
    return (
      <PanelFrame title="Research Workspace" subtitle="Loading temporal research bundle, persistence memory and timing cohorts.">
        <div className="text-sm text-slate-300">Reading persisted research artifacts...</div>
      </PanelFrame>
    );
  }

  if (researchStatus.error && !data) {
    return (
      <PanelFrame title="Research Workspace" subtitle="Temporal intelligence workspace could not be materialized from current artifacts.">
        <div className="text-sm text-rose-300">{researchStatus.error}</div>
      </PanelFrame>
    );
  }

  const meta = data?.meta || {};
  const persistence = data?.persistence || {};
  const timingQuality = data?.timing_quality || {};
  const correction = data?.market_correction || {};
  const volatility = data?.volatility || {};
  const clvPreparation = data?.clv_preparation || {};
  const historicalMemory = data?.historical_memory || {};
  const rankingExplainability = data?.ranking_explainability || {};

  const researchRun = meta.research_status?.step || null;
  const lastUpdated = meta.generated_at || researchStatus.lastUpdated || status?.lastUpdated || null;
  const reportPreview = report?.preview || '';

  return (
    <WorkspaceShell
      main={
        <>
          <PanelFrame
            title="Quant Report"
            subtitle="Downloadable institutional memo with operational posture, temporal research and market structure."
            action={(
              <a
                href={apiPath('/api/portal/quant-report/download')}
                className="rounded-xl border border-sky-300/35 bg-sky-300/10 px-3 py-2 text-sm font-semibold text-sky-100 transition hover:border-sky-300/55 hover:bg-sky-300/15"
              >
                Download
              </a>
            )}
          >
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                <div>
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Report Status</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <SignalPill tone={reportStatus.error ? 'danger' : 'positive'}>{reportStatus.error ? 'Error' : 'Ready'}</SignalPill>
                    {reportStatus.refreshing && <SignalPill tone="neutral">Refreshing</SignalPill>}
                  </div>
                </div>
                <div className="min-w-[180px] text-right">
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Generated</div>
                  <div className="mt-1 text-sm text-white">{timestampFull(report?.meta?.generated_at)}</div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Current File</div>
                  <div className="mt-2 break-all text-xs text-slate-300">{report?.meta?.current_relative_path || 'mlb_ops/reports/downloadable_quant_report.md'}</div>
                </div>
                <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Versioned File</div>
                  <div className="mt-2 break-all text-xs text-slate-300">{report?.meta?.dated_relative_path || 'mlb_ops/reports/quant_reports/<date>_downloadable_quant_report.md'}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35">
                <div className="flex items-center justify-between gap-3 border-b border-slate-700/35 px-4 py-3">
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Markdown Preview</div>
                  <div className="text-xs text-slate-500">{reportPreview ? 'first section preview' : 'pending generation'}</div>
                </div>
                {reportStatus.error ? (
                  <div className="px-4 py-3 text-sm text-rose-300">{reportStatus.error}</div>
                ) : (
                  <pre className="scrollbar-thin max-h-[260px] overflow-auto whitespace-pre-wrap px-4 py-3 text-xs leading-6 text-slate-300">
                    {reportPreview || 'Generating markdown intelligence memo...'}
                  </pre>
                )}
              </div>
            </div>
          </PanelFrame>

          <PersistenceSummarySection data={persistence} />
          <RankingExplainabilitySection data={rankingExplainability} />
          <TimingQualitySection data={timingQuality} />
          <SurvivedRejectedSection data={data?.survived_vs_rejected} />
          <MarketCorrectionSection data={correction} />
          <VolatilitySection data={volatility} />
          <PersistenceEvolutionSection data={data?.persistence_evolution} memory={historicalMemory} />
          <ClvPreparationSection data={clvPreparation} />
          <HistoricalMemorySection data={historicalMemory} />
        </>
      }
      rail={
        <>
          <PanelFrame title="Research Pulse" subtitle="Current state of the temporal research layer.">
            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3">
                <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Last Research Refresh</div>
                <div className="mt-1 text-white">{timestampFull(lastUpdated)}</div>
                <div className="mt-1 text-xs text-slate-400">{timeAgo(lastUpdated)}</div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3">
                <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Research Status</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <SignalPill tone={meta.research_status?.status === 'ok' ? 'positive' : 'warning'}>{meta.research_status?.status || 'n/a'}</SignalPill>
                  <SignalPill tone="info">{meta.research_status?.active_window || 'n/a'}</SignalPill>
                  {researchStatus.refreshing && <SignalPill tone="neutral">refreshing</SignalPill>}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3">
                <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Pipeline Step</div>
                <div className="mt-1 text-white">{researchRun?.script || 'n/a'}</div>
                <div className="mt-1 text-xs text-slate-400">duration {researchRun?.duration_seconds === undefined ? 'n/a' : `${fmt(researchRun.duration_seconds, 3)}s`}</div>
              </div>
            </div>
          </PanelFrame>

          <PanelFrame title="Research Summary" subtitle="Topline answers from the temporal intelligence layer.">
            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3">
                <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Edge Survival</div>
                <div className="mt-1 text-lg font-semibold text-white">{researchPct(persistence.summary?.edge_survival_rate, 2)}</div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3">
                <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Best Timing Window</div>
                <div className="mt-1 text-lg font-semibold text-white">{timingQuality.best_window?.window || 'n/a'}</div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3">
                <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Stable vs Unstable</div>
                <div className="mt-1 text-white">{volatility.summary?.stable_markets ?? 'n/a'} stable / {volatility.summary?.unstable_markets ?? 'n/a'} unstable</div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3">
                <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Memory Depth</div>
                <div className="mt-1 text-white">{historicalMemory.accumulated_research_days ?? 0} day(s) / {historicalMemory.research_runs ?? 0} run(s)</div>
              </div>
            </div>
          </PanelFrame>

          <PanelFrame title="Research Workspace Logic" subtitle="Why this view exists operationally.">
            <div className="grid gap-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3">
                Makes persistence, decay, timing quality and correction behavior visible without adding new engines.
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3">
                Converts `history.jsonl` and research bundles into usable temporal memory, survival curves and regime history.
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3">
                Keeps CLV preparation bounded to close-proxy observability, not ROI claims or predictive outputs.
              </div>
            </div>
          </PanelFrame>
        </>
      }
    />
  );
}
