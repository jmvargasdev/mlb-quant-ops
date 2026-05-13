const ACTIONS = {
  EXECUTE_NOW: 'Execute Now',
  REDUCED_QUALITY: 'Reduced Quality',
  WAIT_FOR_CONFIRMATION: 'Wait for Confirmation',
  PASS: 'Pass',
};

const POLICY_CODES = {
  PASS_CANNOT_BE_PRIMARY: 'PASS_CANNOT_BE_PRIMARY',
  UNSTABLE_CANNOT_FULL_DEPLOY: 'UNSTABLE_CANNOT_FULL_DEPLOY',
  LOW_TIMING_REQUIRES_CONFIRMATION: 'LOW_TIMING_REQUIRES_CONFIRMATION',
  HIGH_VOLATILITY_REDUCES_QUALITY: 'HIGH_VOLATILITY_REDUCES_QUALITY',
};

function parseExposure(exposure) {
  const numeric = Number.parseFloat(exposure);
  return Number.isFinite(numeric) ? numeric : 0;
}

function actionPriority(action) {
  if (action === ACTIONS.EXECUTE_NOW) return 4;
  if (action === ACTIONS.WAIT_FOR_CONFIRMATION) return 3;
  if (action === ACTIONS.REDUCED_QUALITY) return 2;
  if (action === ACTIONS.PASS) return 0;
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

function passedGate(code, evidence = {}) {
  return {
    code,
    status: 'passed',
    effect: 'none',
    severity: 'info',
    evidence,
  };
}

function activeGate(code, effect, severity, evidence = {}) {
  return {
    code,
    status: 'active',
    effect,
    severity,
    evidence,
  };
}

function evaluateStructurePolicies(structure, aggressionState) {
  const gates = [];
  const exposure = parseExposure(structure.exposure);
  const reasonCodes = structure.reason_codes || [];
  const timingScore = Number(structure.timing_quality_score || 0);
  const volatilityScore = Number(structure.volatility_score || 0);
  const disagreementScore = Number(structure.disagreement_score || 0);

  if (exposure <= 0 || structure.lifecycle === 'collapsing' || structure.validation_bucket === 'rejected') {
    gates.push(activeGate('STRUCTURE_NOT_DEPLOYABLE', 'pass', 'critical', {
      exposure: structure.exposure,
      lifecycle: structure.lifecycle || null,
      validation_bucket: structure.validation_bucket || null,
    }));
    return {
      action: ACTIONS.PASS,
      gates,
    };
  }

  if (reasonCodes.includes('LATE_CONFIRMATION_REQUIRED') || timingScore < 20) {
    gates.push(activeGate(POLICY_CODES.LOW_TIMING_REQUIRES_CONFIRMATION, 'downgrade_to_wait', 'warning', {
      timing_quality_score: structure.timing_quality_score ?? null,
      reason_codes: reasonCodes,
    }));
    return {
      action: ACTIONS.WAIT_FOR_CONFIRMATION,
      gates,
    };
  }

  if (volatilityScore >= 14) {
    gates.push(activeGate(POLICY_CODES.HIGH_VOLATILITY_REDUCES_QUALITY, 'downgrade_to_reduced_quality', 'warning', {
      volatility_score: structure.volatility_score ?? null,
    }));
  }

  if (aggressionState === 'Restricted') {
    gates.push(activeGate(POLICY_CODES.UNSTABLE_CANNOT_FULL_DEPLOY, 'downgrade_to_reduced_quality', 'warning', {
      aggression_state: aggressionState,
    }));
  }

  if (disagreementScore >= 0.05) {
    gates.push(activeGate('HIGH_DISAGREEMENT_REDUCES_QUALITY', 'downgrade_to_reduced_quality', 'warning', {
      disagreement_score: structure.disagreement_score ?? null,
    }));
  }

  if (gates.some((gate) => gate.status === 'active')) {
    return {
      action: ACTIONS.REDUCED_QUALITY,
      gates,
    };
  }

  return {
    action: ACTIONS.EXECUTE_NOW,
    gates: [
      passedGate(POLICY_CODES.LOW_TIMING_REQUIRES_CONFIRMATION, {
        timing_quality_score: structure.timing_quality_score ?? null,
      }),
      passedGate(POLICY_CODES.HIGH_VOLATILITY_REDUCES_QUALITY, {
        volatility_score: structure.volatility_score ?? null,
      }),
    ],
  };
}

function selectPrimaryAllocation(allocationRows) {
  return [...(allocationRows || [])]
    .filter((row) => row.action !== ACTIONS.PASS && parseExposure(row.executive_exposure) > 0)
    .sort((a, b) => (
      actionPriority(b.action) - actionPriority(a.action)
      || parseExposure(b.executive_exposure) - parseExposure(a.executive_exposure)
      || tierPriority(b.conviction_tier) - tierPriority(a.conviction_tier)
      || Number(b.operational_conviction || 0) - Number(a.operational_conviction || 0)
    ))[0] || null;
}

function evaluateExecutivePolicyGates({ allocationRows, primaryAllocation }) {
  const primaryCandidate = primaryAllocation || selectPrimaryAllocation(allocationRows);
  const passPrimaryViolation = primaryCandidate?.action === ACTIONS.PASS;
  const activeRows = allocationRows.filter((row) => row.action !== ACTIONS.PASS);
  const waitRows = allocationRows.filter((row) => row.action === ACTIONS.WAIT_FOR_CONFIRMATION);
  const reducedRows = allocationRows.filter((row) => row.action === ACTIONS.REDUCED_QUALITY);

  return [
    passPrimaryViolation
      ? activeGate(POLICY_CODES.PASS_CANNOT_BE_PRIMARY, 'block_primary_allocation', 'critical', {
        primary_game_id: primaryCandidate?.game_id || null,
        primary_team: primaryCandidate?.team || null,
        primary_action: primaryCandidate?.action || null,
      })
      : passedGate(POLICY_CODES.PASS_CANNOT_BE_PRIMARY, {
        primary_game_id: primaryCandidate?.game_id || null,
        primary_team: primaryCandidate?.team || null,
        primary_action: primaryCandidate?.action || null,
      }),
    waitRows.length
      ? activeGate(POLICY_CODES.LOW_TIMING_REQUIRES_CONFIRMATION, 'requires_confirmation_before_full_deployment', 'warning', {
        affected_structures: waitRows.map((row) => row.team),
      })
      : passedGate(POLICY_CODES.LOW_TIMING_REQUIRES_CONFIRMATION, {
        active_structures: activeRows.length,
      }),
    reducedRows.length
      ? activeGate(POLICY_CODES.HIGH_VOLATILITY_REDUCES_QUALITY, 'compress_or_reduce_quality', 'warning', {
        affected_structures: reducedRows.map((row) => row.team),
      })
      : passedGate(POLICY_CODES.HIGH_VOLATILITY_REDUCES_QUALITY, {
        active_structures: activeRows.length,
      }),
  ];
}

module.exports = {
  ACTIONS,
  POLICY_CODES,
  actionPriority,
  evaluateExecutivePolicyGates,
  evaluateStructurePolicies,
  parseExposure,
  selectPrimaryAllocation,
  tierPriority,
};
