// Earth's mean radius in meters
const R = 6371e3;

export interface Point {
  lat: number;
  lng: number;
}

/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula.
 *
 * @param lat1 Latitude of point 1 in degrees
 * @param lon1 Longitude of point 1 in degrees
 * @param lat2 Latitude of point 2 in degrees
 * @param lon2 Longitude of point 2 in degrees
 * @returns Distance in meters
 */
export function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
 *
 * @param points Array of coordinate points
 * @returns Total distance in meters
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
 * Calculates the average pace in seconds per kilometer.
 * 
 * @param distanceMeters Total distance in meters
 * @param durationSeconds Total duration in seconds
 * @returns Average pace in seconds per km (null if distance is 0 to avoid Infinity)
 */
export function calculatePace(distanceMeters: number, durationSeconds: number): number | null {
  if (distanceMeters === 0) return null;
  const distanceKm = distanceMeters / 1000;
  return durationSeconds / distanceKm;
}

/**
 * Calculates the orthogonal distance from a point to a line segment defined by start/end.
 * Uses a flat-earth approximation scaled by latitude, which is highly accurate for small distances.
 * 
 * @param pt The point
 * @param lineStart The start of the line segment
 * @param lineEnd The end of the line segment
 * @returns Distance in meters
 */
export function perpendicularDistance(pt: Point, lineStart: Point, lineEnd: Point): number {
  // Average latitude of the segment to scale longitude degrees to roughly match latitude meters
  const avgLat = (lineStart.lat + lineEnd.lat) / 2;
  const latScale = Math.cos((avgLat * Math.PI) / 180);

  // Convert to meters relative to an arbitrary origin (0,0) for the local calculation
  // 1 degree of latitude is roughly 111,320 meters
  const degToMeters = 111320;
  
  const x = pt.lng * latScale * degToMeters;
  const y = pt.lat * degToMeters;
  
  const x1 = lineStart.lng * latScale * degToMeters;
  const y1 = lineStart.lat * degToMeters;
  
  const x2 = lineEnd.lng * latScale * degToMeters;
  const y2 = lineEnd.lat * degToMeters;

  const dx = x2 - x1;
  const dy = y2 - y1;
  
  // If lineStart == lineEnd
  if (dx === 0 && dy === 0) {
    return Math.sqrt(Math.pow(x - x1, 2) + Math.pow(y - y1, 2));
  }

  // Calculate the t that minimizes the distance
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);

  // See if this represents one of the endpoints
  // If so, the orthogonal projection is outside the line segment, so use distance to nearest endpoint
  if (t < 0) {
    return Math.sqrt(Math.pow(x - x1, 2) + Math.pow(y - y1, 2));
  }
  if (t > 1) {
    return Math.sqrt(Math.pow(x - x2, 2) + Math.pow(y - y2, 2));
  }

  // Projection falls on the segment
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return Math.sqrt(Math.pow(x - projX, 2) + Math.pow(y - projY, 2));
}

/**
 * Douglas-Peucker line simplification algorithm.
 * Recursively reduces the number of points in a curve that is approximated by a series of points.
 * 
 * @param points Array of ordered points
 * @param tolerance Tolerance in meters
 * @returns Array of simplified points
 */
export function douglasPeucker<T extends Point>(points: T[], tolerance: number): T[] {
  if (points.length <= 2) {
    return points;
  }

  let maxDistance = 0;
  let index = 0;

  const startPoint = points[0];
  const endPoint = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], startPoint, endPoint);
    if (dist > maxDistance) {
      index = i;
      maxDistance = dist;
    }
  }

  // If max distance is greater than tolerance, recursively simplify
  if (maxDistance > tolerance) {
    const leftLine = douglasPeucker(points.slice(0, index + 1), tolerance);
    const rightLine = douglasPeucker(points.slice(index), tolerance);
    
    // Concat, avoiding duplicating the point at `index`
    return [...leftLine.slice(0, leftLine.length - 1), ...rightLine];
  } else {
    // Drop all points between start and end
    return [startPoint, endPoint];
  }
}
