import React from 'react';
import { Link } from 'react-router-dom';
import { Icon, Spinner } from '../ui';
import { formatArea, formatDistance, formatDuration } from '../../utils/format';

export type RunMode = 'idle' | 'drawing' | 'recording' | 'replaying' | 'submitting' | 'result';

export interface CaptureSummary {
  runId: string;
  cellsClaimed: number;
  stolenFrom: { username: string; cells: number }[];
  enclosedAreaSquareMeters: number;
  rankBefore: number | null;
  rankAfter: number | null;
}

/** One raw reading from the browser's Geolocation API. */
export interface GpsFix {
  lat: number;
  lng: number;
  accuracy: number; // metres
  time: number; // epoch ms
}

interface Props {
  mode: RunMode;
  /** Distance of the route so far (drawing / recording / replaying). */
  distanceMeters: number;
  elapsedSeconds: number;
  waypointCount: number;
  gpsLog: GpsFix[];
  gpsWeak: boolean;
  summary: CaptureSummary | null;
  busy: boolean;
  onStartGps: () => void;
  onStartDrawing: () => void;
  onQuickLoop: () => void;
  onUndoWaypoint: () => void;
  onCaptureDrawn: () => void;
  onFinishGps: () => void;
  onCancel: () => void;
  onDone: () => void;
}

const Figure = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="figure">
    <div className="figure-value">{value}</div>
    <div className="figure-label">{label}</div>
  </div>
);

/** The panel at the bottom of the map: every step of "run a loop, claim ground" lives here. */
export const RunDock = (p: Props) => (
  <div className="panel dock" data-testid="run-dock">
    {p.mode === 'idle' && (
      <>
        <h3 className="dock-title">Claim ground</h3>
        <p className="dock-sub">
          Close a loop and every cell inside it is yours, including cells other runners own.
        </p>
        <div className="dock-actions">
          <button className="btn btn-primary" onClick={p.onStartDrawing}>
            <Icon name="pen" /> Draw a route
          </button>
          <button className="btn btn-secondary" onClick={p.onQuickLoop} disabled={p.busy}>
            <Icon name="bolt" /> Quick loop
          </button>
          <button className="btn btn-secondary" onClick={p.onStartGps}>
            <Icon name="play" /> Record with GPS
          </button>
        </div>
      </>
    )}

    {p.mode === 'drawing' && (
      <>
        <h3 className="dock-title">Draw your route</h3>
        <p className="dock-sub">
          Click the map to add waypoints. The loop closes back to your first point.
        </p>
        <div className="figures">
          <Figure label="Waypoints" value={p.waypointCount} />
          <Figure label="Loop" value={formatDistance(p.distanceMeters)} />
          <Figure label="At 5:30 /km" value={formatDuration(p.elapsedSeconds)} />
        </div>
        <div className="dock-actions">
          <button className="btn btn-ghost" onClick={p.onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-secondary"
            onClick={p.onUndoWaypoint}
            disabled={p.waypointCount === 0}
          >
            <Icon name="undo" /> Undo
          </button>
          <button
            className="btn btn-primary"
            onClick={p.onCaptureDrawn}
            disabled={p.waypointCount < 3}
          >
            <Icon name="flag" /> Run it
          </button>
        </div>
      </>
    )}

    {p.mode === 'recording' && (
      <>
        <h3 className="dock-title">
          <span className="recording-dot" /> Recording
        </h3>
        <div className="figures">
          <Figure label="Time" value={formatDuration(p.elapsedSeconds)} />
          <Figure label="Distance" value={formatDistance(p.distanceMeters)} />
          <Figure label="Track points" value={p.waypointCount} />
        </div>
        <GpsReadout fixes={p.gpsLog} weak={p.gpsWeak} />
        <div className="dock-actions">
          <button className="btn btn-ghost" onClick={p.onCancel}>
            Discard
          </button>
          <button className="btn btn-primary" onClick={p.onFinishGps}>
            <Icon name="flag" /> Finish and claim
          </button>
        </div>
      </>
    )}

    {(p.mode === 'replaying' || p.mode === 'submitting') && (
      <div className="dock-busy">
        <Spinner />
        <div>
          <h3 className="dock-title">
            {p.mode === 'replaying' ? 'Running the loop' : 'Claiming ground'}
          </h3>
          <p className="dock-sub">
            {p.mode === 'replaying'
              ? `${formatDistance(p.distanceMeters)} so far`
              : 'Locking cells and updating the leaderboard'}
          </p>
        </div>
      </div>
    )}

    {p.mode === 'result' && p.summary && <ResultView summary={p.summary} onDone={p.onDone} />}
  </div>
);

const fmtCoord = (v: number, pos: string, neg: string) =>
  `${Math.abs(v).toFixed(5)}° ${v >= 0 ? pos : neg}`;

/** The three most recent raw GPS fixes, newest on top. Proves GPS is live without running. */
const GpsReadout = ({ fixes, weak }: { fixes: GpsFix[]; weak: boolean }) => (
  <div className="gps-log" aria-live="polite">
    <div className="gps-log-head">
      <span>{weak ? 'Weak GPS signal, retrying…' : 'Live GPS'}</span>
      <span>accuracy</span>
      <span>time</span>
    </div>
    {fixes.length === 0 ? (
      <div className="gps-log-row waiting">
        Waiting for the first fix. If the browser asks, allow location access.
      </div>
    ) : (
      fixes.map((f, i) => (
        <div key={`${f.time}-${i}`} className={`gps-log-row${i === 0 ? ' latest' : ''}`}>
          <span>
            {fmtCoord(f.lat, 'N', 'S')}, {fmtCoord(f.lng, 'E', 'W')}
          </span>
          <span>±{Math.round(f.accuracy)} m</span>
          <span>
            {new Date(f.time).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
        </div>
      ))
    )}
  </div>
);

/** "kabir", "kabir and meera", "kabir, meera, zoya and 2 others" (biggest losses first). */
const victimList = (stolenFrom: { username: string; cells: number }[]) => {
  const names = [...stolenFrom].sort((a, b) => b.cells - a.cells).map((s) => s.username);
  if (names.length <= 2) return names.join(' and ');
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} others`;
};

const ResultView = ({ summary, onDone }: { summary: CaptureSummary; onDone: () => void }) => {
  const stolen = summary.stolenFrom.reduce((n, s) => n + s.cells, 0);
  const climbed =
    summary.rankAfter !== null &&
    summary.rankBefore !== null &&
    summary.rankAfter < summary.rankBefore;

  if (summary.cellsClaimed === 0) {
    return (
      <>
        <h3 className="dock-title">Run saved, no ground claimed</h3>
        <p className="dock-sub">
          The loop didn&apos;t enclose a full cell (about 34 × 19 m). Try a wider loop.
        </p>
        <div className="dock-actions">
          <button className="btn btn-primary" onClick={onDone}>
            Try again
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="result">
        <div className="result-big">+{summary.cellsClaimed}</div>
        <div>
          <h3 className="dock-title">cells claimed</h3>
          <p className="dock-sub">
            {formatArea(summary.enclosedAreaSquareMeters)} inside the loop
            {stolen > 0 && (
              <>
                {'. '}
                <span className="text-danger">
                  {stolen} taken from {victimList(summary.stolenFrom)}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {summary.rankAfter !== null && (
        <div className="rank-change">
          {climbed ? (
            <>
              Rank {summary.rankBefore} <span className="arrow">→</span>{' '}
              <strong>{summary.rankAfter}</strong>
            </>
          ) : (
            <>
              You&apos;re ranked <strong>{summary.rankAfter}</strong>
            </>
          )}
        </div>
      )}

      <div className="dock-actions">
        <Link to="/leaderboards" className="btn btn-secondary">
          Leaderboard
        </Link>
        <Link to={`/runs/${summary.runId}`} className="btn btn-secondary">
          Run details
        </Link>
        <button className="btn btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    </>
  );
};
