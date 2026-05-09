export const WORKSPACES = [
  {
    id: 'daily-ops',
    label: 'Daily Ops',
    shortLabel: 'Ops',
    question: 'Que juegos son accionables ahora?',
    description: 'Bettable leans, watchlist, fades y riesgo actual.',
  },
  {
    id: 'decision-panel',
    label: 'Decision Panel',
    shortLabel: 'Decision',
    question: 'Como debe comportarse el operador hoy?',
    description: 'Operational posture, exposure, conviction tiers y portfolio risk.',
  },
  {
    id: 'market-structure',
    label: 'Market Structure',
    shortLabel: 'Structure',
    question: 'Como esta evolucionando el mercado?',
    description: 'Timeline temporal, presion, desacuerdo y movimiento de linea.',
  },
  {
    id: 'replay',
    label: 'Replay',
    shortLabel: 'Replay',
    question: 'Que ocurrio durante el dia?',
    description: 'Reconstruccion intradia de precio, edge y volatilidad.',
  },
  {
    id: 'research',
    label: 'Research',
    shortLabel: 'RQ',
    question: 'Que dice la memoria temporal del mercado?',
    description: 'Persistence, timing quality, correction behavior y market memory.',
  },
  {
    id: 'ops-health',
    label: 'Ops Health',
    shortLabel: 'Health',
    question: 'El pipeline esta sano?',
    description: 'Health operacional, densidad, calidad y confiabilidad.',
  },
];

export function workspaceById(id) {
  return WORKSPACES.find((workspace) => workspace.id === id) || WORKSPACES[0];
}
