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
  if (structure.conviction_tier === 'Elite Conviction') weight *= 1.2;
  if (structure.conviction_tier === 'High Conviction') weight *= 1.1;
  if (action === 'Wait for Confirmation') weight *= 0.6;
  if (action === 'Reduced Quality') weight *= 0.78;
  if ((structure.reason_codes || []).includes('HIGH_VOLATILITY_PENALTY')) weight *= 0.88;
  if ((structure.reason_codes || []).includes('LOW_TIMING_QUALITY')) weight *= 0.72;
  if ((structure.reason_codes || []).includes('STRONG_OPERATIONAL_ALIGNMENT')) weight *= 1.05;
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
    if (row.priority_weight <= 0 || totalWeight <= 0 || remaining <= 0) {
      return {
        ...row,
        executive_exposure_units: 0,
        executive_exposure: '0.00u',
      };
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

  let residual = round(governedTotalExposure - allocated.reduce((sum, row) => sum + row.executive_exposure_units, 0), 2);
  if (residual >= 0.24) {
    for (const row of allocated) {
      if (residual < 0.24) break;
      const current = row.executive_exposure_units;
      const cap = Math.min(row.base_units, capPerStructure || row.base_units);
      if (row.action === 'Pass' || current + 0.25 > cap + 1e-9) continue;
      row.executive_exposure_units = round(current + 0.25, 2);
      row.executive_exposure = formatExposure(row.executive_exposure_units);
      residual = round(residual - 0.25, 2);
    }
  }

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
  if (action === 'Execute Now') {
    return 'Persistence, timing and portfolio governance are aligned enough to justify immediate deployment.';
  }
  if (action === 'Wait for Confirmation') {
    return 'Raw edge is present, but timing quality still requires later confirmation before full deployment quality is justified.';
  }
  if (action === 'Reduced Quality') {
    return 'The structure remains usable, but volatility, disagreement or portfolio compression is reducing its execution quality.';
  }
  return 'Current structural quality does not justify capital deployment after portfolio-level governance is applied.';
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

  return {
    aggression_state: aggressionState,
    deployment_risk: deploymentRisk,
    deployment_evaluation: deploymentEvaluation,
    allocation_rows: allocationRows,
    primary_allocation: primaryAllocation,
    policy_gates: policyGates,
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
  selectPrimaryAllocation,
};
