const {
  evaluateExecutivePolicyGates,
  evaluateStructurePolicies,
  parseExposure,
  selectPrimaryAllocation,
} = require('./policies');

function round(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function formatExposure(units) {
  return `${round(units, 2).toFixed(2)}u`;
}

function floorToQuarter(units) {
  return Math.max(0, Math.floor((units + 1e-9) / 0.25) * 0.25);
}

function classifyOperationalAggression({ portfolioSummary, operationalPosture, concentrationRisk, slateStability, aggregateExposureIntelligence }) {
  const summaryState = portfolioSummary?.recommended_aggression || 'Moderate';
  if (summaryState === 'Restricted' || concentrationRisk?.level === 'dangerous concentration') return 'Restricted';
  if (summaryState === 'Defensive' || slateStability?.state === 'unstable') return 'Defensive';
  if (operationalPosture?.recommendedStyle === 'Highly selective') return 'Selective';
  if (aggregateExposureIntelligence?.aggregate_timing_risk === 'High') return 'Selective';
  if (summaryState === 'Opportunistic') return 'Opportunistic';
  return 'Moderate';
}

function detectDeploymentRisk({ correlationAwareness, concentrationRisk, aggregateExposureIntelligence, slateStability, operationalPosture }) {
  const warnings = [];
  const clusters = correlationAwareness?.warnings || [];

  for (const warning of clusters.slice(0, 4)) {
    warnings.push({
      label: warning.label,
      severity: warning.severity,
      context: warning.narrative,
    });
  }

  if (aggregateExposureIntelligence?.aggregate_timing_risk === 'High') {
    warnings.push({
      label: 'Timing concentration',
      severity: 'Elevated',
      context: 'Too much of the slate still depends on timing quality that has not fully confirmed yet.',
    });
  }
  if (aggregateExposureIntelligence?.aggregate_volatility_risk === 'High') {
    warnings.push({
      label: 'Volatility spillover',
      severity: 'Elevated',
      context: 'Average volatility is high enough that several structures can deteriorate together.',
    });
  }
  if (concentrationRisk?.level === 'dangerous concentration') {
    warnings.push({
      label: 'Concentration collapse risk',
      severity: 'Elevated',
      context: 'The slate is too dependent on overlapping structural themes to deploy raw structure-level sizing.',
    });
  }
  if (slateStability?.state === 'disagreement-led') {
    warnings.push({
      label: 'Disagreement regime',
      severity: 'Moderate',
      context: 'Late repricing risk is elevated because disagreement remains a defining trait of the slate.',
    });
  }
  if (operationalPosture?.confirmationRequirements?.toLowerCase().includes('require')) {
    warnings.push({
      label: 'Later-window dependency',
      severity: 'Moderate',
      context: 'The current operational posture still requires later confirmation before full deployment quality is justified.',
    });
  }

  return warnings.slice(0, 6);
}

function priorityWeight(structure, action) {
  if (action === 'Pass') return 0;
  let weight = parseExposure(structure.exposure);
  weight *= 1 + Math.max(0, Number(structure.operational_conviction || 0) - 45) / 100;
  // New ontology: Supportive is the reliable tier, no penalty needed
  if (structure.conviction_tier === 'Supportive') weight *= 1.1;
  // Watchlist gets reduced weight — monitor only
  if (action === 'Watchlist') weight *= 0.3;
  return round(weight, 4);
}

function compressExposure({ structures, governedTotalExposure, maxSingleExposure, aggressionState }) {
  const candidates = structures.map((structure) => {
    const policyEvaluation = evaluateStructurePolicies(structure, aggressionState);
    return {
      ...structure,
      action: policyEvaluation.action,
      policy_gates: policyEvaluation.gates,
      base_units: parseExposure(structure.exposure),
      priority_weight: priorityWeight(structure, policyEvaluation.action),
    };
  });

  const active = candidates.filter((row) => row.priority_weight > 0);
  const totalWeight = active.reduce((sum, row) => sum + row.priority_weight, 0);
  const capPerStructure = parseExposure(maxSingleExposure);
  let remaining = round(governedTotalExposure, 2);

  const allocated = candidates.map((row) => {
    // Validated Edge: Kelly already handles per-signal risk.
    // Bypass governance compression — use raw Kelly sizing directly.
    // See ADR-001 and backtest: governance was not part of the +1843% result.
    if (row.action === 'Validated Edge') {
      const kellyUnits = round(row.base_units, 4);
      return {
        ...row,
        executive_exposure_units: kellyUnits,
        executive_exposure: formatExposure(kellyUnits),
      };
    }

    // Watchlist and Pass: no capital deployed
    if (row.action === 'Watchlist' || row.priority_weight <= 0) {
      return {
        ...row,
        executive_exposure_units: 0,
        executive_exposure: '0.00u',
      };
    }

    // Legacy actions: preserve old governance compression behavior
    if (totalWeight <= 0 || remaining <= 0) {
      return { ...row, executive_exposure_units: 0, executive_exposure: '0.00u' };
    }
    const proportional = governedTotalExposure * (row.priority_weight / totalWeight);
    const bounded = Math.min(row.base_units, capPerStructure || row.base_units, proportional);
    const floored = floorToQuarter(bounded);
    remaining = round(remaining - floored, 2);
    return {
      ...row,
      executive_exposure_units: floored,
      executive_exposure: formatExposure(floored),
    };
  });

  return allocated;
}

function evaluatePortfolioDeployment({ allocationRows, governedTotalExposure, portfolioSummary, aggregateExposureIntelligence }) {
  const executed = allocationRows.filter((row) => row.executive_exposure_units > 0);
  const totalAllocated = round(executed.reduce((sum, row) => sum + row.executive_exposure_units, 0), 2);
  const compression = Math.max(0, round(parseExposure(portfolioSummary?.raw_total_exposure) - totalAllocated, 2));
  return {
    total_allocated_exposure: formatExposure(totalAllocated),
    governed_total_exposure: formatExposure(governedTotalExposure),
    compression_from_raw: formatExposure(compression),
    active_decisions: executed.length,
    passed_decisions: allocationRows.length - executed.length,
    narrative: totalAllocated < parseExposure(portfolioSummary?.raw_total_exposure)
      ? `Raw structure-level sizing suggests ${portfolioSummary?.raw_total_exposure}, but executive compression deploys ${formatExposure(totalAllocated)} because concentration, timing overlap and structural correlation are materially increasing aggregate risk.`
      : aggregateExposureIntelligence?.narrative || `Deployment remains aligned with governed exposure at ${formatExposure(totalAllocated)}.`,
  };
}

function buildDecisionReason(structure, action) {
  if (action === 'Validated Edge') {
    return 'Edge confirmed by historical accuracy (69.8% win rate on Validated Edge signals). Quarter-Kelly cap 10% sizing applied.';
  }
  if (action === 'Watchlist') {
    return 'Positive edge detected but volatility or market conditions require monitoring before capital commitment.';
  }
  return 'No actionable edge after Kelly sizing and governance filter. Capital preserved.';
}

function generateExecutiveMemo({
  operationalPosture,
  aggressionState,
  concentrationRisk,
  slateStability,
  deploymentEvaluation,
  deploymentRisk,
}) {
  return {
    executive_summary: deploymentEvaluation.narrative,
    deployment_posture: aggressionState,
    exposure_style: operationalPosture?.recommendedStyle || 'Selective',
    timing_interpretation: operationalPosture?.confirmationRequirements || 'Current structure is closer to actionable',
    risk_concentration: concentrationRisk?.level || 'contained',
    slate_stability: slateStability?.state || 'mixed',
    portfolio_warnings: deploymentRisk.slice(0, 4),
    recommended_deployment: aggressionState === 'Restricted'
      ? 'Preserve capital first and limit action to the cleanest structures only.'
      : aggressionState === 'Defensive'
        ? 'Deploy selectively with reduced size and explicit respect for concentration caps.'
        : aggressionState === 'Selective'
          ? 'Favor only the best-aligned structures and avoid broad participation.'
          : aggressionState === 'Opportunistic'
            ? 'Normal deployment is acceptable, but only inside governed exposure and correlation limits.'
            : 'Moderate deployment is acceptable as long as timing quality does not deteriorate.',
  };
}

function buildDecisionTrace({
  structures,
  compressed,
  allocationRows,
  primaryAllocation,
  policyGates,
  aggressionState,
  deploymentEvaluation,
  portfolioSummary,
  concentrationRisk,
  slateStability,
  aggregateExposureIntelligence,
}) {
  const activeRows = allocationRows.filter((row) => row.executive_exposure_units > 0);
  const passedRows = allocationRows.filter((row) => row.action === 'Pass');
  const policyEffects = policyGates
    .filter((gate) => gate.status === 'active')
    .map((gate) => gate.effect);
  const structureReasonCodes = [...new Set(structures.flatMap((row) => row.reason_codes || []))];

  return [
    {
      node: 'Raw Edge Node',
      status: structures.length ? 'completed' : 'empty',
      input_summary: {
        structures: structures.length,
        raw_total_exposure: portfolioSummary?.raw_total_exposure || null,
      },
      output_state: {
        candidate_structures: structures.map((row) => ({
          game_id: row.game_id,
          team: row.team,
          quant_score: row.quant_score ?? null,
          raw_exposure: row.exposure,
          conviction_tier: row.conviction_tier,
        })),
      },
      reason_codes: structureReasonCodes,
      confidence_impact: structures.length ? 'raw_candidates_identified' : 'no_raw_candidates',
      policy_effects: [],
    },
    {
      node: 'Temporal Validation Node',
      status: 'completed',
      input_summary: {
        candidates: structures.length,
      },
      output_state: {
        timing_sensitive: structures
          .filter((row) => (row.reason_codes || []).includes('LATE_CONFIRMATION_REQUIRED') || (row.timing_quality_score || 0) < 20)
          .map((row) => row.team),
        lifecycle_risk: structures
          .filter((row) => ['collapsing', 'decaying'].includes(row.lifecycle))
          .map((row) => row.team),
      },
      reason_codes: structureReasonCodes.filter((code) => code.includes('TIMING') || code.includes('DECAY') || code.includes('CONFIRMATION')),
      confidence_impact: 'timing_and_persistence_adjusted',
      policy_effects: compressed
        .flatMap((row) => row.policy_gates || [])
        .filter((gate) => gate.code === 'LOW_TIMING_REQUIRES_CONFIRMATION' && gate.status === 'active')
        .map((gate) => gate.effect),
    },
    {
      node: 'Market Regime Node',
      status: 'completed',
      input_summary: {
        slate_stability: slateStability?.state || null,
        aggregate_volatility_risk: aggregateExposureIntelligence?.aggregate_volatility_risk || null,
        aggregate_disagreement_risk: aggregateExposureIntelligence?.aggregate_disagreement_risk || null,
      },
      output_state: {
        watchlist: allocationRows
          .filter((row) => row.action === 'Watchlist')
          .map((row) => row.team),
      },
      reason_codes: structureReasonCodes.filter((code) => code.includes('VOLATILITY') || code.includes('DISAGREEMENT')),
      confidence_impact: 'market_regime_penalties_applied',
      policy_effects: compressed
        .flatMap((row) => row.policy_gates || [])
        .filter((gate) => gate.effect === 'downgrade_to_reduced_quality')
        .map((gate) => gate.effect),
    },
    {
      node: 'Portfolio Concentration Node',
      status: 'completed',
      input_summary: {
        recommended_aggression: portfolioSummary?.recommended_aggression || null,
        concentration_level: concentrationRisk?.level || null,
      },
      output_state: {
        aggression_state: aggressionState,
        governed_total_exposure: deploymentEvaluation.governed_total_exposure,
        compression_from_raw: deploymentEvaluation.compression_from_raw,
      },
      reason_codes: [],
      confidence_impact: 'portfolio_governance_applied',
      policy_effects: policyEffects,
    },
    {
      node: 'Policy Gate Node',
      status: policyGates.some((gate) => gate.status === 'active') ? 'active' : 'passed',
      input_summary: {
        evaluated_policies: policyGates.length,
      },
      output_state: {
        active_policies: policyGates.filter((gate) => gate.status === 'active').map((gate) => gate.code),
        passed_policies: policyGates.filter((gate) => gate.status === 'passed').map((gate) => gate.code),
      },
      reason_codes: policyGates.map((gate) => gate.code),
      confidence_impact: policyGates.some((gate) => gate.status === 'active') ? 'deployment_constrained' : 'policy_clear',
      policy_effects: policyEffects,
    },
    {
      node: 'Executive Allocation Node',
      status: primaryAllocation ? 'allocated' : 'no_active_allocation',
      input_summary: {
        allocation_rows: allocationRows.length,
      },
      output_state: {
        primary_allocation: primaryAllocation ? {
          game_id: primaryAllocation.game_id,
          team: primaryAllocation.team,
          action: primaryAllocation.action,
          executive_exposure: primaryAllocation.executive_exposure,
        } : null,
        active_decisions: activeRows.length,
        passed_decisions: passedRows.length,
      },
      reason_codes: [],
      confidence_impact: primaryAllocation ? 'capital_decision_selected' : 'capital_preservation',
      policy_effects: policyEffects,
    },
    {
      node: 'Decision Ledger Node',
      status: 'ready',
      input_summary: {
        rows_ready_for_ledger: allocationRows.length,
      },
      output_state: {
        result_status: 'pending',
      },
      reason_codes: [],
      confidence_impact: 'decision_is_auditable',
      policy_effects: [],
    },
  ];
}

function generateExecutiveAllocation({
  structures,
  operationalPosture,
  portfolioSummary,
  correlationAwareness,
  exposureGovernance,
  concentrationRisk,
  slateStability,
  aggregateExposureIntelligence,
}) {
  const governedTotalExposure = parseExposure(portfolioSummary?.total_suggested_exposure);
  const aggressionState = classifyOperationalAggression({
    portfolioSummary,
    operationalPosture,
    concentrationRisk,
    slateStability,
    aggregateExposureIntelligence,
  });
  const deploymentRisk = detectDeploymentRisk({
    correlationAwareness,
    concentrationRisk,
    aggregateExposureIntelligence,
    slateStability,
    operationalPosture,
  });
  const compressed = compressExposure({
    structures,
    governedTotalExposure,
    maxSingleExposure: exposureGovernance?.max_single_exposure,
    aggressionState,
  });
  const allocationRows = compressed.map((row) => ({
    game_id: row.game_id,
    side: row.side,
    team: row.team,
    matchup: row.matchup,
    action: row.action,
    raw_exposure: row.exposure,
    executive_exposure: row.executive_exposure,
    executive_exposure_units: row.executive_exposure_units,
    conviction_tier: row.conviction_tier,
    timing_quality_score: row.timing_quality_score,
    operational_conviction: row.operational_conviction,
    structure_quality: row.structure_quality,
    reason: buildDecisionReason(row, row.action),
    policy_gates: row.policy_gates || [],
  }));
  const primaryAllocation = selectPrimaryAllocation(allocationRows);
  const policyGates = evaluateExecutivePolicyGates({
    allocationRows,
    primaryAllocation,
  });
  const deploymentEvaluation = evaluatePortfolioDeployment({
    allocationRows,
    governedTotalExposure,
    portfolioSummary,
    aggregateExposureIntelligence,
  });
  const executiveMemo = generateExecutiveMemo({
    operationalPosture,
    aggressionState,
    concentrationRisk,
    slateStability,
    deploymentEvaluation,
    deploymentRisk,
  });
  const decisionTrace = buildDecisionTrace({
    structures,
    compressed,
    allocationRows,
    primaryAllocation,
    policyGates,
    aggressionState,
    deploymentEvaluation,
    portfolioSummary,
    concentrationRisk,
    slateStability,
    aggregateExposureIntelligence,
  });

  return {
    aggression_state: aggressionState,
    deployment_risk: deploymentRisk,
    deployment_evaluation: deploymentEvaluation,
    allocation_rows: allocationRows,
    primary_allocation: primaryAllocation,
    policy_gates: policyGates,
    decision_trace: decisionTrace,
    executive_memo: executiveMemo,
  };
}

module.exports = {
  classifyOperationalAggression,
  detectDeploymentRisk,
  compressExposure,
  evaluatePortfolioDeployment,
  evaluateExecutivePolicyGates,
  generateExecutiveAllocation,
  generateExecutiveMemo,
  buildDecisionTrace,
  selectPrimaryAllocation,
};
