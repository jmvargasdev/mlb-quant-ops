const assert = require('node:assert/strict');

const {
  isValidatedEdgeSignal,
  signalClassification,
} = require('../../backend/data-service');

assert.equal(isValidatedEdgeSignal({ action: 'Wait for Confirmation' }), true);
assert.equal(isValidatedEdgeSignal({ conviction_tier: 'Supportive' }), true);

const governedWatchlistEdge = {
  action: 'Watchlist',
  fair_probability: 0.4507,
  market_probability: 0.4000,
  policy_gates: [
    { code: 'HIGH_VOLATILITY', status: 'active', effect: 'monitor_only' },
  ],
};

assert.equal(isValidatedEdgeSignal(governedWatchlistEdge), true);
assert.equal(signalClassification(governedWatchlistEdge), 'Validated Edge');

assert.equal(isValidatedEdgeSignal({
  action: 'Pass',
  fair_probability: 0.3900,
  market_probability: 0.4000,
  policy_gates: [
    { code: 'NO_EDGE', status: 'active', effect: 'pass' },
  ],
}), false);

assert.equal(signalClassification({
  action: 'Pass',
  policy_gates: [
    { code: 'NO_EDGE', status: 'active', effect: 'pass' },
  ],
}), 'Pass');

console.log('validated-edge ontology tests passed');
