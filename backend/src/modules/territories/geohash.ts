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
export function encodeGeohash(lat: number, lng: number, precision: number = GEOHASH_PRECISION): string {
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
