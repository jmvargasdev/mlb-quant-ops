export const WORKSPACE_DEFINITIONS = [
  {
    id: 'home',
    labelKey: 'workspace.home.label',
    shortLabelKey: 'workspace.home.short',
    questionKey: 'workspace.home.question',
    descriptionKey: 'workspace.home.description',
  },
  {
    id: 'decision-panel',
    labelKey: 'workspace.decision.label',
    shortLabelKey: 'workspace.decision.short',
    questionKey: 'workspace.decision.question',
    descriptionKey: 'workspace.decision.description',
  },
  {
    id: 'historical-selections',
    labelKey: 'workspace.historicalSelections.label',
    shortLabelKey: 'workspace.historicalSelections.short',
    questionKey: 'workspace.historicalSelections.question',
    descriptionKey: 'workspace.historicalSelections.description',
  },
  {
    id: 'daily-ops',
    labelKey: 'workspace.daily.label',
    shortLabelKey: 'workspace.daily.short',
    questionKey: 'workspace.daily.question',
    descriptionKey: 'workspace.daily.description',
  },
  {
    id: 'research',
    labelKey: 'workspace.research.label',
    shortLabelKey: 'workspace.research.short',
    questionKey: 'workspace.research.question',
    descriptionKey: 'workspace.research.description',
  },
  {
    id: 'market-structure',
    labelKey: 'workspace.market.label',
    shortLabelKey: 'workspace.market.short',
    questionKey: 'workspace.market.question',
    descriptionKey: 'workspace.market.description',
  },
  {
    id: 'replay',
    labelKey: 'workspace.replay.label',
    shortLabelKey: 'workspace.replay.short',
    questionKey: 'workspace.replay.question',
    descriptionKey: 'workspace.replay.description',
  },
  {
    id: 'ops-health',
    labelKey: 'workspace.health.label',
    shortLabelKey: 'workspace.health.short',
    questionKey: 'workspace.health.question',
    descriptionKey: 'workspace.health.description',
  },
  {
    id: 'responsible-use',
    labelKey: 'workspace.responsible.label',
    shortLabelKey: 'workspace.responsible.short',
    questionKey: 'workspace.responsible.question',
    descriptionKey: 'workspace.responsible.description',
  },
  {
    id: 'analytics',
    labelKey: 'workspace.analytics.label',
    shortLabelKey: 'workspace.analytics.short',
    questionKey: 'workspace.analytics.question',
    descriptionKey: 'workspace.analytics.description',
  },
];

export const WORKSPACES = WORKSPACE_DEFINITIONS.map((workspace) => ({
  id: workspace.id,
  label: workspace.labelKey,
  shortLabel: workspace.shortLabelKey,
  question: workspace.questionKey,
  description: workspace.descriptionKey,
}));

export function localizeWorkspace(workspace, t) {
  return {
    ...workspace,
    label: t(workspace.labelKey || workspace.label),
    shortLabel: t(workspace.shortLabelKey || workspace.shortLabel),
    question: t(workspace.questionKey || workspace.question),
    description: t(workspace.descriptionKey || workspace.description),
  };
}

export function workspaceById(id) {
  return WORKSPACE_DEFINITIONS.find((workspace) => workspace.id === id) || WORKSPACE_DEFINITIONS[0];
}
