const ACTIONS = {
  VALIDATED_EDGE: 'Validated Edge',
  WATCHLIST: 'Watchlist',
  PASS: 'Pass',
};

const POLICY_CODES = {
  NO_EDGE: 'NO_EDGE',
  EDGE_COLLAPSED: 'EDGE_COLLAPSED',
  HIGH_VOLATILITY_WATCHLIST: 'HIGH_VOLATILITY_WATCHLIST',
  VALIDATED_EDGE_CONFIRMED: 'VALIDATED_EDGE_CONFIRMED',
};

function parseExposure(exposure) {
  const numeric = Number.parseFloat(exposure);
  return Number.isFinite(numeric) ? numeric : 0;
}

function actionPriority(action) {
  if (action === ACTIONS.VALIDATED_EDGE) return 4;
  if (action === ACTIONS.WATCHLIST) return 1;
  if (action === ACTIONS.PASS) return 0;
  // Legacy action names — map to new ontology for backward compat
  if (action === 'Execute Now') return 4;
  if (action === 'Wait for Confirmation') return 4;
  if (action === 'Reduced Quality') return 1;
  return 0;
}

function tierPriority(tier) {
  if (tier === 'Supportive') return 4;
  if (tier === 'Watchlist' || tier === 'Speculative') return 2;
  return 0;
}

function passedGate(code, evidence = {}) {
  return { code, status: 'passed', effect: 'none', severity: 'info', evidence };
}

function activeGate(code, effect, severity, evidence = {}) {
  return { code, status: 'active', effect, severity, evidence };
}

function evaluateStructurePolicies(structure, aggressionState) {
  const exposure = parseExposure(structure.exposure);

  // Gate 1: No edge from Kelly sizing → Pass
  if (exposure <= 0) {
    return {
      action: ACTIONS.PASS,
      gates: [activeGate(POLICY_CODES.NO_EDGE, 'pass', 'critical', {
        exposure: structure.exposure,
        fair_probability: structure.fair_probability ?? null,
        market_probability: structure.market_probability ?? null,
      })],
    };
  }

  // Gate 2: Edge is dead (collapsing or rejected validation) → Pass
  if (structure.lifecycle === 'collapsing' || structure.validation_bucket === 'rejected') {
    return {
      action: ACTIONS.PASS,
      gates: [activeGate(POLICY_CODES.EDGE_COLLAPSED, 'pass', 'critical', {
        lifecycle: structure.lifecycle || null,
        validation_bucket: structure.validation_bucket || null,
      })],
    };
  }

  // Gate 3: High volatility or restricted aggression → Watchlist (monitor, no commitment)
  const volatilityScore = Number(structure.volatility_score || 0);
  if (volatilityScore >= 14 || aggressionState === 'Restricted') {
    return {
      action: ACTIONS.WATCHLIST,
      gates: [activeGate(POLICY_CODES.HIGH_VOLATILITY_WATCHLIST, 'watchlist', 'warning', {
        volatility_score: structure.volatility_score ?? null,
        aggression_state: aggressionState,
      })],
    };
  }

  // Validated Edge: positive Kelly edge, not collapsed, stable volatility
  return {
    action: ACTIONS.VALIDATED_EDGE,
    gates: [passedGate(POLICY_CODES.VALIDATED_EDGE_CONFIRMED, {
      exposure: structure.exposure,
      fair_probability: structure.fair_probability ?? null,
      market_probability: structure.market_probability ?? null,
      volatility_score: structure.volatility_score ?? null,
    })],
  };
}

function selectPrimaryAllocation(allocationRows) {
  return [...(allocationRows || [])]
    .filter((row) => actionPriority(row.action) >= 4 && parseExposure(row.executive_exposure) > 0)
    .sort((a, b) => (
      parseExposure(b.executive_exposure) - parseExposure(a.executive_exposure)
      || tierPriority(b.conviction_tier) - tierPriority(a.conviction_tier)
      || Number(b.operational_conviction || 0) - Number(a.operational_conviction || 0)
    ))[0] || null;
}

function evaluateExecutivePolicyGates({ allocationRows, primaryAllocation }) {
  const primaryCandidate = primaryAllocation || selectPrimaryAllocation(allocationRows);
  const hasValidatedEdge = allocationRows.some((row) => row.action === ACTIONS.VALIDATED_EDGE);
  const watchlistRows = allocationRows.filter((row) => row.action === ACTIONS.WATCHLIST);

  return [
    hasValidatedEdge
      ? passedGate(POLICY_CODES.VALIDATED_EDGE_CONFIRMED, {
          primary_team: primaryCandidate?.team || null,
          primary_action: primaryCandidate?.action || null,
        })
      : activeGate(POLICY_CODES.NO_EDGE, 'no_primary_allocation', 'warning', {
          primary_team: primaryCandidate?.team || null,
        }),
    watchlistRows.length
      ? activeGate(POLICY_CODES.HIGH_VOLATILITY_WATCHLIST, 'monitoring_only', 'info', {
          affected_structures: watchlistRows.map((row) => row.team),
        })
      : passedGate(POLICY_CODES.HIGH_VOLATILITY_WATCHLIST, {}),
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
