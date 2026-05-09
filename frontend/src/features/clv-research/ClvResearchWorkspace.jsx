import PanelFrame from '../../shared/components/PanelFrame';
import SignalPill from '../../shared/components/SignalPill';
import CompactStatGrid from '../../shared/components/CompactStatGrid';
import { humanizeFlag } from '../../shared/lib/formatters';
import WorkspaceShell from '../../layouts/WorkspaceShell';

export default function ClvResearchWorkspace({ overview, detail }) {
  const card = detail?.card || {};
  const metrics = [
    { label: 'Persistence Score', value: card.persistence_score, digits: 1 },
    { label: 'Timing Quality', value: card.timing_quality_score, digits: 1 },
    { label: 'CLV Ready', value: card.clv_ready ? 'yes' : 'no', render: (value) => value },
    { label: 'Close Missing', value: card.close_snapshot_missing ? 'yes' : 'no', render: (value) => value },
  ];

  return (
    <WorkspaceShell
      main={
        <>
          <PanelFrame title="CLV Research Context" subtitle="Focused validation layer for persistence, timing and close readiness.">
            <CompactStatGrid items={metrics} />
          </PanelFrame>

          <PanelFrame title="Validation Buckets" subtitle="Close-proxy research state from the operational validation layer.">
            <div className="flex flex-wrap gap-3">
              {Object.entries(overview.clv_preparation?.validation_buckets || {}).map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-700/35 px-4 py-3">
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
                  <div className="mt-2 text-xl font-semibold text-white">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(card.risk_flags || []).map((flag) => (
                <SignalPill key={flag} tone={flag.includes('survived') ? 'positive' : 'warning'}>
                  {humanizeFlag(flag)}
                </SignalPill>
              ))}
            </div>
          </PanelFrame>
        </>
      }
      rail={
        <PanelFrame title="Slate CLV Readiness" subtitle="Global readiness of pregame and close research infrastructure.">
          <CompactStatGrid
            items={[
              { label: 'Ready Records', value: overview.clv_preparation?.ready_records, digits: 0 },
              { label: 'Missing Close', value: overview.clv_preparation?.missing_close, digits: 0 },
              { label: 'Missing Pregame', value: overview.clv_preparation?.missing_pregame, digits: 0 },
              { label: 'Avg Timing Quality', value: overview.clv_preparation?.average_timing_quality, digits: 1 },
            ]}
          />
        </PanelFrame>
      }
    />
  );
}
