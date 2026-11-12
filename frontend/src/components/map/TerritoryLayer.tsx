import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Polygon, Tooltip, useMapEvents } from 'react-leaflet';
import { getTerritoriesInBbox, Territory } from '../../api/territories';
import { traceClusterPerimeter } from '../../utils/geo';
import { colorForRunner } from '../../utils/colors';
import { timeAgo } from '../../utils/format';

/** Below this zoom the cells (~34 m × 19 m) are too small to see, so we stop drawing them. */
const MIN_ZOOM_FOR_CELLS = 13;

export interface VisibleOwner {
  userId: string;
  username: string;
  cells: number;
}

interface Props {
  currentUserId?: string;
  /** Bump this number to force a refetch (e.g. right after a capture). */
  refreshKey: number;
  onOwnersChange: (owners: VisibleOwner[]) => void;
  onZoomedOutChange?: (zoomedOut: boolean) => void;
}

/**
 * Draws territory ownership for the current viewport.
 *
 * The map is a grid of geohash cells (~34 m × 19 m). We ask the API which cells in view are owned,
 * group them by owner, and trace each owner's outer boundary so a cluster of cells
 * renders as one clean shape instead of hundreds of little squares.
 */
export const TerritoryLayer = ({
  currentUserId,
  refreshKey,
  onOwnersChange,
  onZoomedOutChange,
}: Props) => {
  const [territories, setTerritories] = useState<Territory[]>([]);

  const map = useMapEvents({
    moveend: () => load(),
  });

  const load = useCallback(async () => {
    const zoomedOut = map.getZoom() < MIN_ZOOM_FOR_CELLS;
    onZoomedOutChange?.(zoomedOut);
    if (zoomedOut) {
      setTerritories([]);
      return;
    }

    const b = map.getBounds();
    try {
      const data = await getTerritoriesInBbox(b.getSouth(), b.getWest(), b.getNorth(), b.getEast());
      setTerritories(data.territories);
    } catch {
      /* a failed refresh just keeps the previous view */
    }
  }, [map, onZoomedOutChange]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const byOwner = useMemo(() => {
    const groups = new Map<string, { username: string; hashes: string[]; lastCaptured: string }>();
    for (const t of territories) {
      const g = groups.get(t.owner_id) ?? {
        username: t.owner_username,
        hashes: [],
        lastCaptured: t.captured_at,
      };
      g.hashes.push(t.geohash);
      if (t.captured_at > g.lastCaptured) g.lastCaptured = t.captured_at;
      groups.set(t.owner_id, g);
    }
    return groups;
  }, [territories]);

  useEffect(() => {
    onOwnersChange(
      [...byOwner.entries()]
        .map(([userId, g]) => ({ userId, username: g.username, cells: g.hashes.length }))
        .sort((a, b) => b.cells - a.cells)
    );
  }, [byOwner, onOwnersChange]);

  return (
    <>
      {[...byOwner.entries()].map(([ownerId, g]) => {
        const isYou = ownerId === currentUserId;
        const color = colorForRunner(g.username, isYou);
        return (
          <Polygon
            key={`${ownerId}-${g.hashes.length}`}
            positions={traceClusterPerimeter(g.hashes)}
            pathOptions={{
              color: isYou ? '#5e7d00' : color,
              weight: isYou ? 2 : 1.5,
              fillColor: color,
              fillOpacity: isYou ? 0.5 : 0.32,
            }}
          >
            <Tooltip sticky className="territory-tip">
              <strong>{isYou ? 'Your ground' : `${g.username}'s ground`}</strong>
              <br />
              {g.hashes.length} cells on screen, last claimed {timeAgo(g.lastCaptured)}
            </Tooltip>
          </Polygon>
        );
      })}
    </>
  );
};
