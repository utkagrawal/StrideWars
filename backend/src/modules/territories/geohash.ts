import ngeohash from 'ngeohash';

export const GEOHASH_PRECISION = 7; // ~150m x 150m cells

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Encodes a latitude and longitude into a geohash string.
 * Uses precision 7 by default for ~150m x 150m map cells.
 */
export function encodeGeohash(
  lat: number,
  lng: number,
  precision: number = GEOHASH_PRECISION
): string {
  return ngeohash.encode(lat, lng, precision);
}

/**
 * Decodes a geohash string back into a central latitude and longitude coordinate.
 */
export function decodeGeohash(geohash: string): Coordinates {
  const decoded = ngeohash.decode(geohash);
  return { lat: decoded.latitude, lng: decoded.longitude };
}

/**
 * Returns all geohash strings of the specified precision that intersect the given bounding box.
 */
export function getGeohashesInBbox(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number,
  precision: number = GEOHASH_PRECISION
): string[] {
  return ngeohash.bboxes(minLat, minLng, maxLat, maxLng, precision);
}

import { getPolygonBoundingBox, isPointInPolygon } from '../../utils/geo';
import type { Point } from '../../utils/geo';

/**
 * Computes all geohashes whose center points fall within the given closed polygon track.
 * Returns a lexicographically sorted array of geohashes (to prevent deadlocks when locking).
 */
export function computeIntersectingGeohashes(
  closedPoints: Point[],
  precision: number = GEOHASH_PRECISION
): string[] {
  if (closedPoints.length < 4) return [];

  const bbox = getPolygonBoundingBox(closedPoints);
  const candidateHashes = getGeohashesInBbox(
    bbox.minLat,
    bbox.minLng,
    bbox.maxLat,
    bbox.maxLng,
    precision
  );

  const insideHashes: string[] = [];
  for (const hash of candidateHashes) {
    const center = decodeGeohash(hash);
    if (isPointInPolygon(center, closedPoints)) {
      insideHashes.push(hash);
    }
  }

  // Sort lexicographically to prevent deadlocks!
  insideHashes.sort();
  return insideHashes;
}
