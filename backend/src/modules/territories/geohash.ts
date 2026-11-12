import ngeohash from 'ngeohash';

/**
 * Map cell size. Precision 8 ≈ 38 m × 19 m at the equator (≈ 34 m × 19 m in Guwahati):
 * small enough that a 1 km loop claims ~100 cells and the territory hugs the route.
 * (Precision 7 would be about 150 m × 150 m, too coarse for a single run.)
 */
export const GEOHASH_PRECISION = 8;

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Encodes a latitude and longitude into a geohash string.
 * Uses GEOHASH_PRECISION (8) by default.
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

/** Area of one geohash cell in m² (a lat/lng rectangle; narrower away from the equator). */
export function geohashCellArea(geohash: string): number {
  const [minLat, minLng, maxLat, maxLng] = ngeohash.decode_bbox(geohash);
  const metersPerDegree = 111_320;
  const midLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180;
  const height = (maxLat - minLat) * metersPerDegree;
  const width = (maxLng - minLng) * metersPerDegree * Math.cos(midLatRad);
  return height * width;
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
