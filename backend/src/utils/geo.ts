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

/**
 * Auto-closes a path if the distance between the first and last point exceeds the threshold.
 * @param points Array of ordered points
 * @param closeThresholdMeters Threshold in meters (default 30m)
 * @returns A new array of points that is guaranteed to be closed (first == last) if it wasn't already.
 */
export function autoClosePath<T extends Point>(points: T[], closeThresholdMeters: number = 30): T[] {
  if (points.length < 2) return [...points];
  
  const first = points[0];
  const last = points[points.length - 1];
  
  const dist = calculateHaversineDistance(first.lat, first.lng, last.lat, last.lng);
  if (dist > closeThresholdMeters) {
    return [...points, { ...first }]; // Append a synthetic point equal to the first point
  }
  return [...points];
}

/**
 * Calculates the enclosed area of a polygon using the Shoelace formula.
 * It first projects the lat/lng coordinates to a local Cartesian plane (in meters)
 * using an equirectangular approximation centered on the polygon's centroid.
 * @param points Array of points forming a closed polygon
 * @returns Area in square meters
 */
export function polygonArea(points: Point[]): number {
  if (points.length < 4) return 0; // A closed polygon needs at least 4 points (triangle + closing point)

  // 1. Find the centroid to use as the center of projection
  let sumLat = 0;
  let sumLng = 0;
  // We don't include the duplicated last point in the centroid calculation
  const uniquePoints = points.length - 1;
  for (let i = 0; i < uniquePoints; i++) {
    sumLat += points[i].lat;
    sumLng += points[i].lng;
  }
  const centroidLat = sumLat / uniquePoints;
  
  // 2. Project points to local planar meters
  const centroidLatRad = (centroidLat * Math.PI) / 180;
  const cosLat = Math.cos(centroidLatRad);
  
  const projected = points.map(pt => {
    const latRad = (pt.lat * Math.PI) / 180;
    const lngRad = (pt.lng * Math.PI) / 180;
    return {
      x: R * lngRad * cosLat,
      y: R * latRad
    };
  });

  // 3. Apply Shoelace formula
  let area = 0;
  for (let i = 0; i < projected.length - 1; i++) {
    const curr = projected[i];
    const next = projected[i + 1];
    area += (curr.x * next.y) - (next.x * curr.y);
  }
  
  return Math.abs(area) / 2;
}

/**
 * Ray-casting algorithm to determine if a point is inside a polygon.
 * Boundary points are considered inside.
 * @param pt The point to test
 * @param polygon The closed polygon points
 * @returns true if inside, false if outside
 */
export function isPointInPolygon(pt: Point, polygon: Point[]): boolean {
  let inside = false;
  const x = pt.lng;
  const y = pt.lat;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    // Check if point is exactly on a vertex
    if (xi === x && yi === y) return true;

    // Check if point is exactly on a horizontal edge
    if (yi === y && yj === y && x >= Math.min(xi, xj) && x <= Math.max(xi, xj)) {
      return true;
    }

    // Check if point is on a non-horizontal edge using cross product (collinearity)
    const crossProduct = (y - yi) * (xj - xi) - (x - xi) * (yj - yi);
    if (Math.abs(crossProduct) < 1e-9) {
      if (x >= Math.min(xi, xj) && x <= Math.max(xi, xj) && y >= Math.min(yi, yj) && y <= Math.max(yi, yj)) {
        return true; // On boundary
      }
    }

    // Ray casting check (horizontal ray pointing in +x direction)
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  
  return inside;
}

/**
 * Computes the bounding box of a polygon.
 */
export function getPolygonBoundingBox(points: Point[]): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const pt of points) {
    if (pt.lat < minLat) minLat = pt.lat;
    if (pt.lat > maxLat) maxLat = pt.lat;
    if (pt.lng < minLng) minLng = pt.lng;
    if (pt.lng > maxLng) maxLng = pt.lng;
  }

  return { minLat, maxLat, minLng, maxLng };
}

import ngeohash from 'ngeohash';

/**
 * Traces the perimeter of a set of contiguous geohashes by extracting all 
 * outer edges (canceling out internal shared edges) and forming closed rings.
 */
export function traceClusterPerimeter(hashes: string[]): [number, number][][] {
  if (hashes.length === 0) return [];
  
  const edges = new Map<string, { start: [number, number], end: [number, number] }>();
  
  const toKey = (lat: number, lng: number) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

  for (const hash of hashes) {
    const [minLat, minLng, maxLat, maxLng] = ngeohash.decode_bbox(hash);
    
    // CCW directed edges for the cell
    const e1 = { start: [minLat, minLng] as [number, number], end: [minLat, maxLng] as [number, number] }; // South
    const e2 = { start: [minLat, maxLng] as [number, number], end: [maxLat, maxLng] as [number, number] }; // East
    const e3 = { start: [maxLat, maxLng] as [number, number], end: [maxLat, minLng] as [number, number] }; // North
    const e4 = { start: [maxLat, minLng] as [number, number], end: [minLat, minLng] as [number, number] }; // West
    
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
  
  const startToEdge = new Map<string, { start: [number, number], end: [number, number] }>();
  for (const e of edges.values()) {
    startToEdge.set(toKey(e.start[0], e.start[1]), e);
  }
  
  const rings: [number, number][][] = [];
  
  while (startToEdge.size > 0) {
    const firstKey = startToEdge.keys().next().value;
    if (!firstKey) break;
    const ring: [number, number][] = [];
    let currentKey = firstKey;
    
    while (startToEdge.has(currentKey)) {
      const edge = startToEdge.get(currentKey)!;
      startToEdge.delete(currentKey);
      ring.push(edge.start);
      currentKey = toKey(edge.end[0], edge.end[1]);
    }
    
    if (ring.length > 0) {
      ring.push(ring[0]); // close the loop explicitly
      rings.push(ring);
    }
  }
  
  return rings;
}

/**
 * Given a start point, initial bearing, and distance, this will calculate the
 * destination point using the spherical destination-point formula.
 */
export function destinationPoint(lat: number, lng: number, bearingDeg: number, distanceMeters: number): Point {
  const delta = distanceMeters / R; // angular distance in radians
  const theta = (bearingDeg * Math.PI) / 180; // bearing in radians
  
  const phi1 = (lat * Math.PI) / 180;
  const lambda1 = (lng * Math.PI) / 180;
  
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) +
    Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  );
  
  const lambda2 = lambda1 + Math.atan2(
    Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
    Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
  );
  
  let lngResult = (lambda2 * 180) / Math.PI;
  lngResult = (lngResult + 540) % 360 - 180;

  return {
    lat: (phi2 * 180) / Math.PI,
    lng: lngResult,
  };
}

/**
 * Generates a random closed loop of points around a center for demo purposes.
 */
export function generateRandomLoop(centerLat: number, centerLng: number, numPoints = 12, baseRadius = 150): (Point & { recordedAt: string })[] {
  const points: (Point & { recordedAt: string })[] = [];
  const now = new Date();
  
  for (let i = 0; i < numPoints; i++) {
    const angle = (360 / numPoints) * i;
    const jitteredAngle = angle + (Math.random() * 20 - 10);
    const jitteredRadius = baseRadius + (Math.random() * 100 - 50);
    
    const pt = destinationPoint(centerLat, centerLng, jitteredAngle, jitteredRadius);
    points.push({ ...pt, recordedAt: new Date(now.getTime() + i * 1000).toISOString() });
  }
  
  points.push({ 
    lat: points[0].lat, 
    lng: points[0].lng, 
    recordedAt: new Date(now.getTime() + numPoints * 1000).toISOString() 
  });
  
  return points;
}

/**
 * Generates a pseudo-path along actual roads by fetching OSM data and 
 * performing a bounded random walk. Falls back to a circular loop on failure.
 */
export async function generateRoadLoop(centerLat: number, centerLng: number, minDistance = 300, maxDistance = 800): Promise<(Point & { recordedAt: string })[]> {
  try {
    const radius = 500;
    const query = `[out:json];way(around:${radius},${centerLat},${centerLng})["highway"~"primary|secondary|tertiary|residential|unclassified|pedestrian"];(._;>;);out;`;
    
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status}`);
    }

    const data = await response.json() as any;
    
    const nodes = new Map<number, Point>();
    const edges = new Map<number, number[]>();

    for (const el of data.elements) {
      if (el.type === 'node') {
        nodes.set(el.id, { lat: el.lat, lng: el.lon });
      }
    }

    for (const el of data.elements) {
      if (el.type === 'way' && el.nodes) {
        for (let i = 0; i < el.nodes.length - 1; i++) {
          const u = el.nodes[i];
          const v = el.nodes[i + 1];
          
          if (!edges.has(u)) edges.set(u, []);
          if (!edges.has(v)) edges.set(v, []);
          
          edges.get(u)!.push(v);
          edges.get(v)!.push(u);
        }
      }
    }

    if (nodes.size === 0 || edges.size === 0) {
      throw new Error('No roads found in vicinity');
    }

    let nearestNodeId = -1;
    let minDistanceToCenter = Infinity;
    
    for (const [id, pt] of nodes.entries()) {
      if (edges.has(id) && edges.get(id)!.length > 0) {
        const dist = calculateHaversineDistance(centerLat, centerLng, pt.lat, pt.lng);
        if (dist < minDistanceToCenter) {
          minDistanceToCenter = dist;
          nearestNodeId = id;
        }
      }
    }

    if (nearestNodeId === -1) {
      throw new Error('No connected road nodes found');
    }

    const pathIds: number[] = [nearestNodeId];
    let currentDistance = 0;
    let currId = nearestNodeId;
    const targetDistance = minDistance + Math.random() * (maxDistance - minDistance);
    let lastId = -1;

    for (let steps = 0; steps < 500; steps++) {
      const neighbors = edges.get(currId)!;
      let validNeighbors = neighbors.filter(n => n !== lastId);
      if (validNeighbors.length === 0) {
        validNeighbors = neighbors;
      }
      
      const nextId = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
      
      const p1 = nodes.get(currId)!;
      const p2 = nodes.get(nextId)!;
      
      currentDistance += calculateHaversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
      
      pathIds.push(nextId);
      lastId = currId;
      currId = nextId;
      
      if (currentDistance >= targetDistance) {
        break;
      }
    }

    const now = new Date();
    const points: (Point & { recordedAt: string })[] = [];
    
    for (let i = 0; i < pathIds.length; i++) {
      const pt = nodes.get(pathIds[i])!;
      points.push({
        lat: pt.lat,
        lng: pt.lng,
        recordedAt: new Date(now.getTime() + i * 1000).toISOString()
      });
    }

    points.push({
      lat: points[0].lat,
      lng: points[0].lng,
      recordedAt: new Date(now.getTime() + pathIds.length * 1000).toISOString()
    });

    return points;
  } catch (err) {
    console.warn('Road loop generation failed, falling back to circular loop:', err);
    return generateRandomLoop(centerLat, centerLng, 12, 150);
  }
}
