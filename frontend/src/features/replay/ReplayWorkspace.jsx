import { useEffect, useState } from 'react';
import PanelFrame from '../../shared/components/PanelFrame';
import ReplayViewer from '../../components/ReplayViewer';
import CompactStatGrid from '../../shared/components/CompactStatGrid';
import WorkspaceShell from '../../layouts/WorkspaceShell';
import LineMovementTimeline from './components/LineMovementTimeline';

export default function ReplayWorkspace({ detail }) {
  const replay = detail?.replay || {};
  const summary = replay?.replay_summary || {};
  const awayFrames = replay?.away?.snapshots || [];
  const homeFrames = replay?.home?.snapshots || [];
  const chartFrames = detail?.charts?.snapshots || [];
  const totalFrames = Math.max(awayFrames.length, homeFrames.length, chartFrames.length, 1);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const metrics = [
    { label: 'Snapshot Count', value: replay?.snapshot_count, digits: 0 },
    { label: 'Disagreement Delta', value: summary.overall_disagreement_delta, digits: 3 },
    { label: 'Away Max Vol', value: replay?.away?.max_volatility, digits: 1 },
    { label: 'Home Max Vol', value: replay?.home?.max_volatility, digits: 1 },
  ];

  useEffect(() => {
    setFrame(0);
    setPlaying(false);
  }, [detail?.meta?.game_id]);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setFrame((current) => (current >= totalFrames - 1 ? 0 : current + 1));
    }, 1400);
    return () => window.clearInterval(timer);
  }, [playing, totalFrames]);

  return (
    <WorkspaceShell
      main={
        <>
          <PanelFrame title="Replay Control" subtitle="Temporal reconstruction of market state, edge path and volatility.">
            <CompactStatGrid items={metrics} />
          </PanelFrame>
          <ReplayViewer
            detail={detail}
            frame={frame}
            setFrame={setFrame}
            playing={playing}
            setPlaying={setPlaying}
            totalFrames={totalFrames}
          />
          <LineMovementTimeline detail={detail} frame={frame} setFrame={setFrame} />
        </>
      }
      rail={
        <PanelFrame title="Replay Context" subtitle="Use the selected matchup to reconstruct market microstructure.">
          <div className="grid gap-3 text-sm text-slate-300">
            <div className="rounded-2xl border border-slate-700/35 px-4 py-3">
              <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Focused Game</div>
              <div className="mt-1 text-white">{detail?.card?.matchup || 'n/a'}</div>
            </div>
            <div className="rounded-2xl border border-slate-700/35 px-4 py-3">
              <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Current Edge Trend</div>
              <div className="mt-1 text-white">{detail?.card?.edge_trend || 'n/a'}</div>
            </div>
            <div className="rounded-2xl border border-slate-700/35 px-4 py-3">
              <div className="mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Timeline Frames</div>
              <div className="mt-1 text-white">{detail?.timeline?.snapshots?.length || 0}</div>
            </div>
          </div>
        </PanelFrame>
      }
    />
  );
}
