import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import PanelFrame from '../../../shared/components/PanelFrame';
import { signedPoints, timestampLabel } from '../../../shared/lib/formatters';

function formatAmerican(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  const numeric = Number(value);
  return numeric > 0 ? `+${numeric}` : String(numeric);
}

function formatTotal(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  const numeric = Number(value);
  return numeric.toFixed(Number.isInteger(numeric) ? 0 : 1);
}

function formatSigned(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  const numeric = Number(value);
  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${numeric.toFixed(digits)}`;
}

function buildRows(snapshots) {
  const baseRows = snapshots || [];
  const firstAway = baseRows.find((row) => row.away_american !== null && row.away_american !== undefined)?.away_american ?? null;
  const firstHome = baseRows.find((row) => row.home_american !== null && row.home_american !== undefined)?.home_american ?? null;
  const firstTotal = baseRows.find((row) => row.total_current !== null && row.total_current !== undefined)?.total_current ?? null;

  return baseRows.map((snapshot, index) => ({
    ...snapshot,
    update_number: index + 1,
    timeline_label: timestampLabel(snapshot.timestamp),
    away_line: snapshot.away_american,
    home_line: snapshot.home_american,
    total_line: snapshot.total_current,
    away_move: firstAway === null || snapshot.away_american === null || snapshot.away_american === undefined ? null : Number(snapshot.away_american) - Number(firstAway),
    home_move: firstHome === null || snapshot.home_american === null || snapshot.home_american === undefined ? null : Number(snapshot.home_american) - Number(firstHome),
    total_move: firstTotal === null || snapshot.total_current === null || snapshot.total_current === undefined ? null : Number(snapshot.total_current) - Number(firstTotal),
  }));
}

function movementDomain(rows, keys, floor = 1) {
  const values = rows
    .flatMap((row) => keys.map((key) => row[key]))
    .filter((value) => value !== null && value !== undefined && !Number.isNaN(Number(value)))
    .map((value) => Math.abs(Number(value)));
  const max = Math.max(floor, ...values);
  const padded = max * 1.25;
  return [-padded, padded];
}

function lastMovement(rows, key) {
  const valid = rows.filter((row) => row[key] !== null && row[key] !== undefined && !Number.isNaN(Number(row[key])));
  if (valid.length < 2) return null;
  const first = Number(valid[0][key]);
  const latest = Number(valid[valid.length - 1][key]);
  return latest - first;
}

function MovementPill({ label, value, formatter = formatSigned }) {
  const tone = value === null ? 'border-slate-500/25 text-slate-400' : value > 0 ? 'border-emerald-300/25 text-emerald-200' : value < 0 ? 'border-rose-300/25 text-rose-200' : 'border-slate-500/25 text-slate-300';
  const display = value === null ? 'n/a' : formatter(value);

  return (
    <div className={`rounded-2xl border bg-slate-950/35 px-3 py-2 ${tone}`}>
      <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold">{display}</div>
    </div>
  );
}

function SnapshotRail({ rows, frame }) {
  if (!rows.length) return null;
  const active = rows[Math.min(Math.max(frame, 0), rows.length - 1)] || rows[rows.length - 1];
  const previous = rows[Math.max(0, Math.min(frame - 1, rows.length - 2))] || null;
  const awayDelta = previous && active !== previous ? active.away_edge - previous.away_edge : null;
  const homeDelta = previous && active !== previous ? active.home_edge - previous.home_edge : null;

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr]">
      <MovementPill label="Away line move" value={lastMovement(rows, 'away_line')} />
      <MovementPill label="Home line move" value={lastMovement(rows, 'home_line')} />
      <MovementPill label="Total move" value={lastMovement(rows, 'total_line')} formatter={(value) => formatSigned(value, 1)} />
      <div className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-3 py-2 lg:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Active replay frame</div>
            <div className="mt-1 text-sm text-white">
              #{active.update_number} · {active.source_label || active.label || 'snapshot'} · {timestampLabel(active.timestamp)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-sky-300/25 px-2.5 py-1 text-sky-200">Away move {formatSigned(active.away_move)}</span>
            <span className="rounded-full border border-emerald-300/25 px-2.5 py-1 text-emerald-200">Home move {formatSigned(active.home_move)}</span>
            <span className="rounded-full border border-amber-300/25 px-2.5 py-1 text-amber-200">Total move {formatSigned(active.total_move, 1)}</span>
            <span className="rounded-full border border-slate-500/25 px-2.5 py-1 text-slate-300">Total {formatTotal(active.total_line)}</span>
            <span className="rounded-full border border-slate-500/25 px-2.5 py-1 text-slate-300">
              Edge drift {awayDelta === null ? 'n/a' : signedPoints(awayDelta)} / {homeDelta === null ? 'n/a' : signedPoints(homeDelta)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LineMovementTimeline({ detail, frame = 0, setFrame }) {
  const rows = buildRows(detail?.charts?.snapshots);
  const showDots = rows.length <= 8;
  const activeFrame = Math.min(Math.max(frame, 0), Math.max(rows.length - 1, 0));
  const activeUpdate = activeFrame + 1;
  const moneylineDomain = movementDomain(rows, ['away_move', 'home_move'], 4);
  const totalDomain = movementDomain(rows, ['total_move'], 0.5);
  const handleChartClick = (payload) => {
    const updateNumber = payload?.activePayload?.[0]?.payload?.update_number;
    if (updateNumber) setFrame?.(updateNumber - 1);
  };

  return (
    <PanelFrame title="Synchronized Line Movement" subtitle="Movement lens tied to the replay frame, scaled against the first captured line so small shifts remain visible.">
      {!rows.length && (
        <div className="rounded-2xl border border-slate-700/35 bg-slate-950/45 px-4 py-5 text-sm text-slate-400">
          No timeline snapshots are available for this matchup yet.
        </div>
      )}

      {!!rows.length && (
        <div className="grid gap-4">
          <SnapshotRail rows={rows} frame={activeFrame} />

          <div className="grid gap-4 2xl:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-2xl border border-slate-700/35 bg-slate-950/20 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">Moneyline Movement Lens</div>
                  <div className="text-xs text-slate-500">Relative move from first capture, synchronized with replay playback.</div>
                </div>
                <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Frame {activeUpdate}/{rows.length}</div>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows} margin={{ top: 8, right: 18, bottom: 8, left: 0 }} onClick={handleChartClick}>
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="update_number" stroke="#8ca2b8" tick={{ fontSize: 11 }} tickFormatter={(value) => `#${value}`} />
                    <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} domain={moneylineDomain} tickFormatter={(value) => formatSigned(value)} />
                    <Tooltip
                      contentStyle={{ background: '#071018', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 12 }}
                      labelFormatter={(value) => {
                        const row = rows.find((item) => item.update_number === value);
                        return row ? `#${value} · ${row.timeline_label}` : `#${value}`;
                      }}
                      formatter={(value, name, payload) => {
                        const row = payload?.payload || {};
                        if (name === 'away_move') return [formatSigned(value), `Away ML ${formatAmerican(row.away_line)}`];
                        return [formatSigned(value), `Home ML ${formatAmerican(row.home_line)}`];
                      }}
                    />
                    <Legend />
                    <ReferenceLine y={0} stroke="rgba(148,163,184,0.34)" strokeDasharray="4 4" />
                    <ReferenceLine x={activeUpdate} stroke="rgba(250,204,21,0.82)" strokeWidth={2} />
                    <Line type="monotone" dataKey="away_move" name="Away move" stroke="#71c7ff" strokeWidth={3} dot={showDots} activeDot={{ r: 6 }} connectNulls />
                    <Line type="monotone" dataKey="home_move" name="Home move" stroke="#3ddc97" strokeWidth={3} dot={showDots} activeDot={{ r: 6 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700/35 bg-slate-950/20 p-4">
              <div className="mb-3">
                <div className="text-sm font-semibold text-white">Total Movement Lens</div>
                <div className="text-xs text-slate-500">Relative total movement from the first available line.</div>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows} margin={{ top: 8, right: 18, bottom: 8, left: 0 }} onClick={handleChartClick}>
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="update_number" stroke="#8ca2b8" tick={{ fontSize: 11 }} tickFormatter={(value) => `#${value}`} />
                    <YAxis stroke="#8ca2b8" tick={{ fontSize: 11 }} domain={totalDomain} tickFormatter={(value) => formatSigned(value, 1)} />
                    <Tooltip
                      contentStyle={{ background: '#071018', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 12 }}
                      labelFormatter={(value) => {
                        const row = rows.find((item) => item.update_number === value);
                        return row ? `#${value} · ${row.timeline_label}` : `#${value}`;
                      }}
                      formatter={(value, name, payload) => [formatSigned(value, 1), `Total ${formatTotal(payload?.payload?.total_line)}`]}
                    />
                    <ReferenceLine y={0} stroke="rgba(148,163,184,0.34)" strokeDasharray="4 4" />
                    <ReferenceLine x={activeUpdate} stroke="rgba(250,204,21,0.82)" strokeWidth={2} />
                    <Line type="stepAfter" dataKey="total_move" name="Total move" stroke="#f5b942" strokeWidth={3} dot={showDots} activeDot={{ r: 6 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-700/35">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[72px_minmax(0,1fr)_96px_96px_82px_88px_88px] gap-3 border-b border-slate-700/35 px-4 py-2 mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                <div>Frame</div>
                <div>Captured</div>
                <div>Away ML</div>
                <div>Home ML</div>
                <div>Total</div>
                <div>Away Edge</div>
                <div>Home Edge</div>
              </div>
              <div className="divide-y divide-slate-700/25">
                {rows.slice(-6).map((row) => (
                  <button
                    type="button"
                    key={`${row.timestamp}-${row.update_number}`}
                    onClick={() => setFrame?.(row.update_number - 1)}
                    className={`grid w-full grid-cols-[72px_minmax(0,1fr)_96px_96px_82px_88px_88px] gap-3 px-4 py-3 text-left text-sm transition ${
                      row.update_number === activeUpdate ? 'bg-sky-300/8 text-white' : 'hover:bg-slate-800/35'
                    }`}
                  >
                    <div className="mono text-slate-400">#{row.update_number}</div>
                    <div className="min-w-0">
                      <div className="truncate text-white">{row.source_label || row.label || 'snapshot'}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{timestampLabel(row.timestamp)}</div>
                    </div>
                    <div className="text-slate-200">{formatAmerican(row.away_line)}</div>
                    <div className="text-slate-200">{formatAmerican(row.home_line)}</div>
                    <div className="text-slate-200">{formatTotal(row.total_line)}</div>
                    <div className="text-slate-200">{signedPoints(row.away_edge)}</div>
                    <div className="text-slate-200">{signedPoints(row.home_edge)}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </PanelFrame>
  );
}
