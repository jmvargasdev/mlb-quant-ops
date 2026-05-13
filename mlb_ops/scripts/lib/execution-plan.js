const EXECUTION_STEPS = [
  {
    name: 'collect',
    stage_name: 'collector',
    framework_reference: ['Plan-and-Execute', 'Temporal workflow semantics'],
    input_artifacts: [],
    output_artifacts: ['mlb_ops/processed/latest_matchups.json'],
    retryable: true,
  },
  {
    name: 'score',
    stage_name: 'scoring',
    framework_reference: ['Plan-and-Execute', 'Dagster asset materialization'],
    input_artifacts: ['mlb_ops/processed/latest_matchups.json'],
    output_artifacts: ['mlb_ops/processed/scored_matchups.json'],
    retryable: true,
  },
  {
    name: 'snapshot',
    stage_name: 'snapshot',
    framework_reference: ['Temporal workflow semantics', 'Dagster asset lineage'],
    input_artifacts: ['mlb_ops/processed/latest_matchups.json'],
    output_artifacts: ['mlb_ops/snapshots/{date}/{snapshot_label}.json'],
    retryable: true,
  },
  {
    name: 'temporal',
    stage_name: 'temporal',
    framework_reference: ['Plan-and-Execute', 'Event Sourcing projection'],
    input_artifacts: ['mlb_ops/snapshots/{date}/*.json'],
    output_artifacts: ['mlb_ops/processed/temporal_market_state.json'],
    retryable: true,
  },
  {
    name: 'replay',
    stage_name: 'replay',
    framework_reference: ['ReAct verify step', 'Dagster lineage'],
    input_artifacts: ['mlb_ops/processed/temporal_market_state.json'],
    output_artifacts: ['mlb_ops/processed/replay_data/{date}_replay_data.json'],
    retryable: true,
  },
  {
    name: 'clv_research',
    stage_name: 'clv_research',
    framework_reference: ['ML evaluation loop', 'Dagster asset materialization'],
    input_artifacts: [
      'mlb_ops/processed/edge_validation.json',
      'mlb_ops/processed/temporal_market_state.json',
    ],
    output_artifacts: ['mlb_ops/processed/clv_research.json'],
    retryable: true,
  },
  {
    name: 'decision_panel',
    stage_name: 'contract_validation',
    framework_reference: ['LangGraph decision graph', 'Plan-and-Execute'],
    input_artifacts: [
      'mlb_ops/processed/scored_matchups.json',
      'mlb_ops/processed/temporal_market_state.json',
      'mlb_ops/processed/edge_validation.json',
    ],
    output_artifacts: ['api:/api/portal/decision-panel'],
    retryable: false,
  },
  {
    name: 'contract_validation',
    stage_name: 'contract_validation',
    framework_reference: ['Pydantic', 'JSON Schema', 'AJV-compatible schema'],
    input_artifacts: [
      'contracts/schemas/executive_allocation.schema.json',
      'api:/api/portal/decision-panel',
    ],
    output_artifacts: ['contract:executive_allocation'],
    retryable: false,
  },
  {
    name: 'policy_validation',
    stage_name: 'contract_validation',
    framework_reference: ['OPA', 'Policy-as-code', 'Approval gate pattern'],
    input_artifacts: ['contract:executive_allocation'],
    output_artifacts: ['policy:PASS_CANNOT_BE_PRIMARY'],
    retryable: false,
  },
  {
    name: 'decision_ledger_write',
    stage_name: 'contract_validation',
    framework_reference: ['Event Sourcing', 'Temporal history model'],
    input_artifacts: ['api:/api/portal/decision-panel'],
    output_artifacts: ['mlb_ops/historical/decision_ledger/{date}.jsonl'],
    retryable: false,
  },
  {
    name: 'outcome_attribution',
    stage_name: 'outcome_attribution',
    framework_reference: ['Event Sourcing projection', 'ML evaluation / backtesting loop'],
    input_artifacts: [
      'mlb_ops/historical/decision_ledger/{date}.jsonl',
      'mlb_ops/raw/{date}/*/schedule.json',
    ],
    output_artifacts: [
      'mlb_ops/historical/outcome_attribution/{date}.jsonl',
      'mlb_ops/processed/outcome_attribution.json',
    ],
    retryable: true,
  },
];

function materializeTemplate(value, context) {
  return value
    .replaceAll('{date}', context.date)
    .replaceAll('{snapshot_label}', context.snapshotLabel || 'unknown');
}

function validationResultFor(status) {
  if (status === 'ok') return 'passed';
  if (status === 'skipped') return 'not_run';
  if (status === 'failed') return 'failed';
  return 'unknown';
}

function buildExecutionPlan({ date, snapshotLabel, generatedAt, stageResults }) {
  const stageByName = new Map((stageResults || []).map((stage) => [stage.name, stage]));
  const context = { date, snapshotLabel };
  const steps = EXECUTION_STEPS.map((definition, index) => {
    const stage = stageByName.get(definition.stage_name) || null;
    const status = stage?.status || 'pending';
    return {
      order: index + 1,
      name: definition.name,
      framework_reference: definition.framework_reference,
      status,
      started_at: stage?.started_at || null,
      ended_at: stage?.ended_at || null,
      input_artifacts: definition.input_artifacts.map((artifact) => materializeTemplate(artifact, context)),
      output_artifacts: definition.output_artifacts.map((artifact) => materializeTemplate(artifact, context)),
      validation_result: validationResultFor(status),
      retryable: definition.retryable,
      failure_reason: status === 'failed' ? (stage?.stderr || stage?.stdout || 'stage failed') : null,
    };
  });
  const completed = steps.filter((step) => step.status === 'ok').length;
  const failed = steps.filter((step) => step.status === 'failed').length;
  const skipped = steps.filter((step) => step.status === 'skipped').length;

  return {
    date,
    generated_at: generatedAt,
    snapshot_label: snapshotLabel,
    framework_reference: ['Plan-and-Execute', 'Temporal workflow semantics', 'Prefect orchestration model'],
    status: failed ? 'failed' : steps.some((step) => step.status === 'pending') ? 'pending' : 'completed',
    summary: {
      total_steps: steps.length,
      completed,
      failed,
      skipped,
      pending: steps.length - completed - failed - skipped,
    },
    steps,
  };
}

module.exports = {
  EXECUTION_STEPS,
  buildExecutionPlan,
};
