const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'operational_hardening.json');

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function getWindowIndex(label, windows) {
  return windows.indexOf(label);
}

function classifyOperationalState({ fresh, snapshotCount, timelineProgress, scheduleTiming, operationalFlags, staleness }, config = readConfig()) {
  const freshEnough = !staleness?.minutes_since_last_snapshot || staleness.minutes_since_last_snapshot <= config.freshness_threshold_minutes;
  const stale = !!staleness?.stale_timeline || !freshEnough;
  const timelineComplete = Number(timelineProgress?.total || 0) > 0
    && Number(timelineProgress?.pending || 0) === 0
    && Number(timelineProgress?.current || 0) > 0;
  const currentWindow = scheduleTiming?.current_schedule_window || 'unknown';
  const expectedIndex = getWindowIndex(currentWindow, config.expected_windows);
  const nextWindowPending = expectedIndex >= 0 && expectedIndex < config.expected_windows.length - 1
    ? config.expected_windows[expectedIndex + 1]
    : null;

  const broken = !!fresh?.failed || (operationalFlags || []).some((flag) => ['failed_extractions', 'schema_drift'].includes(flag));

  let posture = 'degraded';
  if (broken) posture = 'broken';
  else if (timelineComplete && freshEnough && currentWindow !== 'unknown') posture = 'ready_for_today';
  else if (!timelineComplete && currentWindow !== 'unknown' && !stale) posture = 'incomplete_timelines';
  else if (currentWindow !== 'unknown' && !stale) posture = 'on_schedule';

  const warnings = [];
  if (!freshEnough) warnings.push('freshness_lag');
  if (!timelineComplete) warnings.push('timeline_incomplete');
  if (scheduleTiming?.schedule_lag_windows > 0) warnings.push('next_window_pending');
  if ((operationalFlags || []).includes('schedule_drift')) warnings.push('schedule_drift');
  if ((operationalFlags || []).includes('stale_timeline')) warnings.push('stale_state');

  const reasons = [];
  if (broken) reasons.push('broken');
  if (!freshEnough) reasons.push('stale_state');
  if (!timelineComplete) reasons.push('incomplete_timelines');
  if (scheduleTiming?.schedule_lag_windows > 0) reasons.push('next_window_pending');
  if ((operationalFlags || []).includes('schedule_drift')) reasons.push('schedule_drift');

  return {
    posture,
    current_phase: currentWindow,
    next_expected_window: nextWindowPending,
    timeline_complete: timelineComplete,
    stale_state: stale,
    ready_for_today: posture === 'ready_for_today',
    warnings: [...new Set(warnings)],
    reasons: [...new Set(reasons)],
    threshold_minutes: config.freshness_threshold_minutes,
  };
}

function buildOperationalChecklist({ date, generatedAt, scheduleTiming, timelineProgress, staleness, operationalFlags, snapshotDensityScore, pipelineHealthScore, sourceReliabilityScore }) {
  const config = readConfig();
  const state = classifyOperationalState({
    fresh: { failed: false },
    timelineProgress,
    scheduleTiming,
    operationalFlags,
    staleness,
  }, config);

  return {
    date,
    generated_at: generatedAt,
    current_operational_phase: state.current_phase,
    next_expected_window: state.next_expected_window,
    timeline_completeness: {
      total: timelineProgress?.total || 0,
      completed: timelineProgress?.completed || 0,
      current: timelineProgress?.current || 0,
      pending: timelineProgress?.pending || 0,
      completion_pct: timelineProgress?.completion_pct || 0,
      complete: state.timeline_complete,
    },
    freshness_status: {
      process_updated_at: scheduleTiming?.process_updated_at || null,
      last_snapshot_captured_at: scheduleTiming?.last_snapshot_captured_at || null,
      minutes_since_last_snapshot: staleness?.minutes_since_last_snapshot ?? null,
      stale_state: state.stale_state,
      freshness_threshold_minutes: state.threshold_minutes,
    },
    snapshot_continuity: {
      snapshot_density_score: snapshotDensityScore ?? null,
      expected_windows: config.expected_windows,
      current_window: scheduleTiming?.current_schedule_window || 'unknown',
      continuity_ok: state.timeline_complete && !state.stale_state,
      missing_reason: state.reasons.includes('incomplete_timelines') ? 'missing_windows' : null,
    },
    pending_actions: state.warnings,
    operational_warnings: state.reasons,
    operational_posture: state.posture,
    classification: config.status_taxonomy[state.posture] || config.status_taxonomy.degraded,
    health: {
      pipeline_health_score: pipelineHealthScore ?? null,
      source_reliability_score: sourceReliabilityScore ?? null,
    },
  };
}

module.exports = {
  readConfig,
  classifyOperationalState,
  buildOperationalChecklist,
};
