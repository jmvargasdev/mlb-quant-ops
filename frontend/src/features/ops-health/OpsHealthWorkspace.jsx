import PanelFrame from '../../shared/components/PanelFrame';
import CompactStatGrid from '../../shared/components/CompactStatGrid';
import SignalPill from '../../shared/components/SignalPill';
import { fmt, humanizeFlag, timeAgo, timestampFull } from '../../shared/lib/formatters';
import WorkspaceShell from '../../layouts/WorkspaceShell';
import SnapshotFreshness from '../../shared/components/SnapshotFreshness';

export default function OpsHealthWorkspace({ overview, status }) {
  const health = overview.operational_health || {};
  const scheduleTiming = overview?.meta?.schedule_timing || {};
  const bootstrapStatus = overview?.meta?.bootstrap_status || null;
  const operationalChecklist = overview?.meta?.operational_checklist || null;
  const research = overview?.research || {};
  const latestSnapshotAt = scheduleTiming.last_snapshot_captured_at || overview?.meta?.latest_snapshot_time || status?.latestSnapshotAt || null;
  const processUpdatedAt = latestSnapshotAt || overview?.meta?.generated_at || scheduleTiming.process_updated_at || status?.lastUpdated || null;
  const scheduledPayloads = overview?.meta?.scheduled_payloads || [];
  const timelineProgress = health.timeline_progress || { total: 0, completed: 0, current: 0, pending: 0, completion_pct: 0 };
  const metrics = [
    { label: 'Pipeline Health', value: health.pipeline_health_score, digits: 1 },
    { label: 'Source Reliability', value: health.source_reliability_score, digits: 1 },
    { label: 'Schema Consistency', value: health.schema_consistency_score, digits: 1 },
    { label: 'Market Data Quality', value: health.market_data_quality_score, digits: 1 },
    { label: 'Snapshot Density', value: health.snapshot_density_score, digits: 1 },
    { label: 'Extraction Success', value: health.extraction_success_rate, digits: 1 },
  ];

  return (
    <WorkspaceShell
      main={
        <>
          <PanelFrame title="Operational Heartbeat" subtitle="Live refresh state, freshness and current operational posture.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/55 p-4 md:col-span-2 xl:col-span-2">
                <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Operational Pulse</div>
                <div className="mt-2 text-lg font-semibold text-white">Latest data update: {timestampFull(processUpdatedAt)}</div>
                <div className="mt-1 text-xs text-slate-400">{timeAgo(processUpdatedAt)}</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 p-3">
                    <SnapshotFreshness at={latestSnapshotAt} scheduleTiming={scheduleTiming} />
                  </div>
                  <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 p-3">
                    <div className="mono text-[10px] uppercase tracking-[0.22em] text-slate-500">Next snapshot</div>
                    <div className="mt-1 text-sm text-white">{scheduleTiming.next_scheduled_snapshot || 'n/a'}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      lag {scheduleTiming.schedule_lag_minutes === null || scheduleTiming.schedule_lag_minutes === undefined ? 'n/a' : `${scheduleTiming.schedule_lag_minutes}m`}
                      {' '}
                      / {scheduleTiming.schedule_lag_windows === null || scheduleTiming.schedule_lag_windows === undefined ? 'n/a' : `${scheduleTiming.schedule_lag_windows} windows`}
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/55 p-4">
                <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Pipeline Health</div>
                <div className="mt-2 text-2xl font-semibold text-white">{fmt(health.pipeline_health_score, 1)}</div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/55 p-4">
                <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Snapshot Density</div>
                <div className="mt-2 text-2xl font-semibold text-white">{fmt(health.snapshot_density_score, 1)}</div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/55 p-4">
                <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Timeline Status</div>
                <div className="mt-2 text-lg font-semibold text-white">{timelineProgress.completed + timelineProgress.current} / {timelineProgress.total}</div>
                <div className="mt-1 text-xs text-slate-400">{timelineProgress.completion_pct}% complete</div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/55 p-4">
                <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Schedule State</div>
                <div className="mt-2 text-lg font-semibold text-white">{scheduleTiming.schedule_state || 'n/a'}</div>
                <div className="mt-1 text-xs text-slate-400">window {overview?.meta?.current_schedule_window || 'n/a'}</div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/55 p-4">
                <div className="mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Daily Bootstrap</div>
                <div className="mt-2 text-lg font-semibold text-white">{bootstrapStatus?.status || 'n/a'}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {bootstrapStatus?.ready_for_today ? 'ready for today' : bootstrapStatus ? `window ${bootstrapStatus.active_window || 'n/a'}` : 'not recorded'}
                </div>
              </div>
            </div>
          </PanelFrame>

          <PanelFrame
            title="Scheduled Payloads"
            subtitle={`Current schedule window: ${overview?.meta?.current_schedule_window || 'n/a'}`}
          >
            <div className="grid gap-3 xl:grid-cols-2">
              {scheduledPayloads.map((payload) => {
                const tone = payload.status === 'current'
                  ? 'positive'
                  : payload.status === 'captured'
                    ? 'info'
                    : payload.status === 'pending'
                      ? 'neutral'
                      : 'warning';
                return (
                  <div key={payload.label} className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{payload.label}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          source {payload.source_label || 'n/a'} / auto {payload.auto_label || 'n/a'}
                        </div>
                      </div>
                      <SignalPill tone={tone}>{payload.status}</SignalPill>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
                      <div>
                        <div className="mono uppercase tracking-[0.22em] text-slate-500">Observed</div>
                        <div className="mt-1 text-white">{timestampFull(payload.timestamp)}</div>
                      </div>
                      <div>
                        <div className="mono uppercase tracking-[0.22em] text-slate-500">Age</div>
                        <div className="mt-1 text-white">{payload.age_minutes === null ? 'n/a' : `${payload.age_minutes}m`}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </PanelFrame>

          <PanelFrame title="Pipeline Health" subtitle="Operational health, extraction quality and overall control plane health.">
            <CompactStatGrid items={metrics} columns="md:grid-cols-2 xl:grid-cols-3" />
            <div className="mt-4 flex flex-wrap gap-2">
              {(health.operational_flags || []).map((flag) => (
                <SignalPill key={flag} tone="warning">{humanizeFlag(flag)}</SignalPill>
              ))}
              {!health.operational_flags?.length && <SignalPill tone="positive">no operational flags</SignalPill>}
            </div>
          </PanelFrame>
        </>
      }
      rail={
        <>
          <PanelFrame title="Timeline Completeness" subtitle={`Current window: ${overview?.meta?.current_schedule_window || 'n/a'}`}>
            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-700/35 p-4">
                <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Captured Payloads</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {scheduledPayloads.filter((payload) => payload.status === 'captured' || payload.status === 'current').map((payload) => (
                    <SignalPill key={payload.label} tone={payload.status === 'current' ? 'positive' : 'info'}>{payload.label}</SignalPill>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 p-4">
                <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Pending Windows</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {scheduledPayloads.filter((payload) => payload.status === 'pending').map((payload) => (
                    <SignalPill key={payload.label} tone="neutral">{payload.label}</SignalPill>
                  ))}
                </div>
              </div>
            </div>
          </PanelFrame>

          <PanelFrame title="Source Reliability" subtitle="Current extraction confidence by source.">
            <div className="grid gap-3">
              {(health.source_rows || []).map((row) => (
                <div key={row.source} className="flex items-center justify-between rounded-2xl border border-slate-700/35 px-4 py-3">
                  <div>
                    <div className="text-sm text-white">{row.source}</div>
                    <div className="mt-1 text-xs text-slate-400">successes {row.successes} / failures {row.failures}</div>
                  </div>
                  <div className="mono text-sm text-white">{row.reliability_score?.toFixed?.(1) ?? row.reliability_score}</div>
                </div>
              ))}
            </div>
          </PanelFrame>

          <PanelFrame title="Operational Checklist" subtitle="Single source of truth for daily posture and hardening state.">
            {operationalChecklist ? (
              <div className="grid gap-3">
                <div className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3">
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Current Phase</div>
                  <div className="mt-1 text-white">{operationalChecklist.current_operational_phase || 'n/a'}</div>
                  <div className="mt-1 text-xs text-slate-400">{operationalChecklist.classification?.description || 'n/a'}</div>
                </div>
                <div className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3">
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Next Window</div>
                  <div className="mt-1 text-white">{operationalChecklist.next_expected_window || 'n/a'}</div>
                </div>
                <div className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3">
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Posture</div>
                  <div className="mt-1 text-white">{operationalChecklist.operational_posture || 'n/a'}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {(operationalChecklist.operational_warnings || []).map((item) => (
                      <SignalPill key={item} tone="warning">{humanizeFlag(item)}</SignalPill>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <SignalPill tone="neutral">checklist unavailable</SignalPill>
            )}
          </PanelFrame>

          <PanelFrame title="Research Summary" subtitle="Persistence, timing and market memory from the daily research layer.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3">
                <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Edge Survival</div>
                <div className="mt-1 text-white">{research.persistence?.edge_survival_rate === null || research.persistence?.edge_survival_rate === undefined ? 'n/a' : `${fmt(research.persistence.edge_survival_rate * 100, 1)}%`}</div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3">
                <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Timing Quality</div>
                <div className="mt-1 text-white">{research.timing?.average_timing_quality_score === null || research.timing?.average_timing_quality_score === undefined ? 'n/a' : fmt(research.timing.average_timing_quality_score, 1)}</div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3">
                <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Half-Life</div>
                <div className="mt-1 text-white">{research.persistence?.average_edge_half_life_hours === null || research.persistence?.average_edge_half_life_hours === undefined ? 'n/a' : fmt(research.persistence.average_edge_half_life_hours, 2)}</div>
              </div>
              <div className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-3">
                <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Memory File</div>
                <div className="mt-1 text-white">historical/research/{overview?.meta?.date || 'n/a'}</div>
              </div>
            </div>
          </PanelFrame>
        </>
      }
    />
  );
}
