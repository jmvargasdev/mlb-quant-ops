const express = require('express');
const {
  buildDecisionPanel,
  buildDecisionLedgerStatus,
  buildHistoricalSelections,
  buildModelAnalysis,
  buildOverview,
  buildQuantReportMarkdown,
  buildResearchWorkspace,
  gameDetail,
  listSnapshots,
  rawArtifact,
} = require('../backend/data-service');

const router = express.Router();

router.get('/overview', (req, res) => {
  res.json(buildOverview());
});

router.get('/decision-panel', (req, res) => {
  res.json(buildDecisionPanel());
});

router.get('/decision-ledger', (req, res) => {
  res.json(buildDecisionLedgerStatus(req.query.date));
});

router.get('/historical-selections', (req, res) => {
  res.json(buildHistoricalSelections());
});

router.get('/games/:gameId', (req, res) => {
  const payload = gameDetail(req.params.gameId);
  if (!payload) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }
  res.json(payload);
});

router.get('/model-analysis', (req, res) => {
  res.json(buildModelAnalysis());
});

router.get('/research', (req, res) => {
  res.json(buildResearchWorkspace());
});

router.get('/quant-report', (req, res) => {
  res.json(buildQuantReportMarkdown());
});

router.get('/quant-report/download', (req, res) => {
  const payload = buildQuantReportMarkdown();
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${payload.meta.date}_downloadable_quant_report.md"`);
  res.send(payload.markdown);
});

router.get('/snapshots/:date', (req, res) => {
  res.json({
    date: req.params.date,
    snapshots: listSnapshots(req.params.date),
  });
});

router.get('/raw/:artifact', (req, res) => {
  const payload = rawArtifact(req.params.artifact);
  if (!payload) {
    res.status(404).json({ error: 'Artifact not found.' });
    return;
  }
  res.json(payload);
});

module.exports = router;
