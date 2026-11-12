import React from 'react';
import { Link } from 'react-router-dom';
import { formatArea } from '../../utils/format';
import { colorForRunner, YOU_COLOR } from '../../utils/colors';
import type { VisibleOwner } from './TerritoryLayer';

/** Top-left: your standing at a glance. */
export const StatsHud = ({
  rank,
  areaSquareMeters,
}: {
  rank: number | null;
  areaSquareMeters: number;
}) => (
  <Link to="/leaderboards" className="panel hud" title="Open the leaderboard">
    <div className="figure">
      <div className="figure-value">{rank ?? '–'}</div>
      <div className="figure-label">Rank</div>
    </div>
    <div className="hud-divider" />
    <div className="figure">
      <div className="figure-value">{formatArea(areaSquareMeters)}</div>
      <div className="figure-label">Your ground</div>
    </div>
  </Link>
);

/** Top-right: who owns the area currently on screen. */
export const OwnersLegend = ({
  owners,
  currentUserId,
  zoomedOut,
}: {
  owners: VisibleOwner[];
  currentUserId?: string;
  zoomedOut: boolean;
}) => {
  const you = owners.find((o) => o.userId === currentUserId);
  const rivals = owners.filter((o) => o.userId !== currentUserId).slice(0, 5);

  return (
    <div className="panel legend">
      <div className="legend-head">
        <span>On screen</span>
        <span>cells</span>
      </div>
      {zoomedOut ? (
        <p className="legend-note">Zoom in to see who owns what.</p>
      ) : (
        <>
          <div className="legend-row">
            <span className="swatch" style={{ background: YOU_COLOR }} />
            <span>You</span>
            <span className="count">{you?.cells ?? 0}</span>
          </div>
          {rivals.map((o) => (
            <div className="legend-row" key={o.userId}>
              <span className="swatch" style={{ background: colorForRunner(o.username) }} />
              <span>{o.username}</span>
              <span className="count">{o.cells}</span>
            </div>
          ))}
          {rivals.length === 0 && <p className="legend-note">Nobody else has run here yet.</p>}
        </>
      )}
    </div>
  );
};
