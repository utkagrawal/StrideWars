// Earth's mean radius in meters
const R = 6371e3;

export interface Point {
  lat: number;
  lng: number;
}

/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δφ = toRadians(lat2 - lat1);
  const Δλ = toRadians(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Iterates over an array of points in O(n) time, computing the sum of the
 * consecutive segment distances.
 */
export function calculateTotalDistance(points: Point[]): number {
  if (points.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    totalDistance += calculateHaversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
  }
  return totalDistance;
}

/**
 * Given a start point, initial bearing, and distance, this will calculate the
 * destination point using the spherical destination-point formula.
 *
 * @param lat Start latitude in degrees
 * @param lng Start longitude in degrees
 * @param bearingDeg Initial bearing in degrees (0 = North, 90 = East, etc.)
 * @param distanceMeters Distance to travel in meters
 * @returns Destination point {lat, lng} in degrees
 */
export function destinationPoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceMeters: number
): Point {
  const delta = distanceMeters / R; // angular distance in radians
  const theta = (bearingDeg * Math.PI) / 180; // bearing in radians

  const phi1 = (lat * Math.PI) / 180;
  const lambda1 = (lng * Math.PI) / 180;

  // Destination latitude
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  );

  // Destination longitude
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );

  // Normalize longitude to -180 to +180 (optional but good practice)
  let lngResult = (lambda2 * 180) / Math.PI;
  lngResult = ((lngResult + 540) % 360) - 180;

  return {
    lat: (phi2 * 180) / Math.PI,
    lng: lngResult,
  };
}

import ngeohash from 'ngeohash';

/**
 * Traces the perimeter of a set of contiguous geohashes by extracting all
 * outer edges (canceling out internal shared edges) and forming closed rings.
 */
export function traceClusterPerimeter(hashes: string[]): [number, number][][] {
  if (hashes.length === 0) return [];

  const edges = new Map<string, { start: [number, number]; end: [number, number] }>();

  const toKey = (lat: number, lng: number) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

  for (const hash of hashes) {
    const [minLat, minLng, maxLat, maxLng] = ngeohash.decode_bbox(hash);

    // CCW directed edges for the cell
    const e1 = {
      start: [minLat, minLng] as [number, number],
      end: [minLat, maxLng] as [number, number],
    }; // South
    const e2 = {
      start: [minLat, maxLng] as [number, number],
      end: [maxLat, maxLng] as [number, number],
    }; // East
    const e3 = {
      start: [maxLat, maxLng] as [number, number],
      end: [maxLat, minLng] as [number, number],
    }; // North
    const e4 = {
      start: [maxLat, minLng] as [number, number],
      end: [minLat, minLng] as [number, number],
    }; // West

    for (const e of [e1, e2, e3, e4]) {
      const edgeKey = `${toKey(e.start[0], e.start[1])}->${toKey(e.end[0], e.end[1])}`;
      const reverseKey = `${toKey(e.end[0], e.end[1])}->${toKey(e.start[0], e.start[1])}`;

      if (edges.has(reverseKey)) {
        edges.delete(reverseKey); // Cancel out internal edge
      } else {
        edges.set(edgeKey, e);
      }
    }
  }

  const startToEdge = new Map<string, { start: [number, number]; end: [number, number] }>();
  for (const [key, e] of edges.entries()) {
    startToEdge.set(toKey(e.start[0], e.start[1]), e);
  }

  const rings: [number, number][][] = [];

  while (startToEdge.size > 0) {
    const firstKey = startToEdge.keys().next().value as string;
    const ring: [number, number][] = [];
    let currentKey = firstKey;

    while (startToEdge.has(currentKey)) {
      const edge = startToEdge.get(currentKey)!;
      startToEdge.delete(currentKey);
      ring.push(edge.start);
      currentKey = toKey(edge.end[0], edge.end[1]);
    }

    if (ring.length > 0) {
      ring.push(ring[0]); // close the loop explicitly for Leaflet/GeoJSON
      rings.push(ring);
    }
  }

  return rings;
}

/** Typical easy-run pace (5:30 min/km) used when turning a drawn route into a "run". */
export const DEMO_PACE_SEC_PER_KM = 330;

/** Returns the path with its first point appended, if it isn't already closed. */
export function closeLoop<T extends Point>(points: T[]): T[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (calculateHaversineDistance(first.lat, first.lng, last.lat, last.lng) < 1) return points;
  return [...points, { ...first }];
}

/**
 * Inserts intermediate points so no two consecutive samples are more than
 * `stepMeters` apart, so a hand-drawn route looks like a GPS recording.
 */
export function densifyPath(points: Point[], stepMeters = 20): Point[] {
  if (points.length < 2) return points;
  const out: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const d = calculateHaversineDistance(a.lat, a.lng, b.lat, b.lng);
    const steps = Math.max(1, Math.ceil(d / stepMeters));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * Timestamps a path as if it had just been run at a steady pace (finishing now),
 * so it passes the server's anti-spoofing pace check.
 */
export function stampAtPace(
  points: Point[],
  secPerKm = DEMO_PACE_SEC_PER_KM,
  endTime = new Date()
): (Point & { recordedAt: string })[] {
  const offsets: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const d = calculateHaversineDistance(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng
    );
    offsets.push(offsets[i - 1] + Math.max(1, Math.round((d / 1000) * secPerKm)));
  }
  const startMs = endTime.getTime() - offsets[offsets.length - 1] * 1000;
  return points.map((p, i) => ({
    lat: p.lat,
    lng: p.lng,
    recordedAt: new Date(startMs + offsets[i] * 1000).toISOString(),
  }));
}
