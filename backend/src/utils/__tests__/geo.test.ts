import { calculateHaversineDistance, douglasPeucker } from '../geo';

describe('Geo Utilities', () => {
  describe('calculateHaversineDistance', () => {
    it('calculates the distance between two distinct points', () => {
      const p1 = { lat: 37.7749, lng: -122.4194 }; // SF
      const p2 = { lat: 34.0522, lng: -118.2437 }; // LA
      
      const distance = calculateHaversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
      // Distance is roughly 559 km (559000 meters)
      expect(distance).toBeGreaterThan(550000);
      expect(distance).toBeLessThan(570000);
    });

    it('returns 0 for the exact same point', () => {
      const p = { lat: 51.5074, lng: -0.1278 };
      expect(calculateHaversineDistance(p.lat, p.lng, p.lat, p.lng)).toBe(0);
    });
  });

  describe('douglasPeucker (Simplify Path)', () => {
    const p1 = { lat: 0, lng: 0 };
    const p2 = { lat: 0, lng: 0.0001 }; // Very close to the line p1-p3
    const p3 = { lat: 0, lng: 0.0005 };
    const p4 = { lat: 0.01, lng: 0.0002 }; // Spike
    const p5 = { lat: 0, lng: 0.001 };

    it('returns the same array if it has less than 3 points', () => {
      expect(douglasPeucker([], 10)).toEqual([]);
      expect(douglasPeucker([p1], 10)).toEqual([p1]);
      expect(douglasPeucker([p1, p2], 10)).toEqual([p1, p2]);
    });

    it('removes points that are within the tolerance distance', () => {
      const path = [p1, p2, p3]; // p2 is on the straight line between p1 and p3
      const simplified = douglasPeucker(path, 10);
      
      expect(simplified.length).toBe(2);
      expect(simplified[0]).toEqual(p1);
      expect(simplified[1]).toEqual(p3);
    });

    it('keeps points that deviate beyond the tolerance', () => {
      const path = [p1, p4, p5]; // p4 is a huge spike
      const simplified = douglasPeucker(path, 10); // 10 meters tolerance
      
      expect(simplified.length).toBe(3);
      expect(simplified).toEqual(path);
    });
  });
});

import { autoClosePath, polygonArea, isPointInPolygon, getPolygonBoundingBox } from '../geo';

describe('Polygon Geometry Utilities', () => {
  describe('autoClosePath', () => {
    it('returns the same path if less than 2 points', () => {
      const p1 = { lat: 0, lng: 0 };
      expect(autoClosePath([p1])).toEqual([p1]);
    });

    it('returns the same path if distance is within threshold', () => {
      const p1 = { lat: 0, lng: 0 };
      const p2 = { lat: 0, lng: 0.0001 }; // Very close
      const path = [p1, p2];
      expect(autoClosePath(path, 30)).toEqual(path);
    });

    it('appends the first point if distance exceeds threshold', () => {
      const p1 = { lat: 0, lng: 0 };
      const p2 = { lat: 1, lng: 1 }; // Far
      const path = [p1, p2];
      const closed = autoClosePath(path, 30);
      expect(closed.length).toBe(3);
      expect(closed[2]).toEqual(p1);
    });
  });

  describe('polygonArea', () => {
    it('returns 0 for paths with less than 4 points', () => {
      const p1 = { lat: 0, lng: 0 };
      const p2 = { lat: 0, lng: 0.001 };
      const p3 = { lat: 0, lng: 0 };
      expect(polygonArea([p1, p2, p3])).toBe(0);
    });

    it('calculates the area of a square', () => {
      // 1 degree latitude = ~111.32 km. Let's use small numbers so the earth curvature doesn't skew it too much
      // A roughly 111m x 111m square
      const latDist = 0.001; // ~111m
      const lngDist = 0.001;
      const p1 = { lat: 0, lng: 0 };
      const p2 = { lat: latDist, lng: 0 };
      const p3 = { lat: latDist, lng: lngDist };
      const p4 = { lat: 0, lng: lngDist };
      const p5 = { lat: 0, lng: 0 }; // Closed
      
      const area = polygonArea([p1, p2, p3, p4, p5]);
      // Should be around (111.32^2) = ~12392 sq meters
      expect(area).toBeGreaterThan(12000);
      expect(area).toBeLessThan(13000);
    });
  });

  describe('isPointInPolygon', () => {
    const square = [
      { lat: 0, lng: 0 },
      { lat: 10, lng: 0 },
      { lat: 10, lng: 10 },
      { lat: 0, lng: 10 },
      { lat: 0, lng: 0 }
    ];

    it('returns true for a point strictly inside', () => {
      expect(isPointInPolygon({ lat: 5, lng: 5 }, square)).toBe(true);
    });

    it('returns false for a point strictly outside', () => {
      expect(isPointInPolygon({ lat: 15, lng: 5 }, square)).toBe(false);
      expect(isPointInPolygon({ lat: 5, lng: -5 }, square)).toBe(false);
    });

    it('returns true for a point on the boundary', () => {
      expect(isPointInPolygon({ lat: 5, lng: 0 }, square)).toBe(true);
      expect(isPointInPolygon({ lat: 10, lng: 5 }, square)).toBe(true);
    });

    it('returns true for a point on a vertex', () => {
      expect(isPointInPolygon({ lat: 10, lng: 10 }, square)).toBe(true);
    });
  });

  describe('getPolygonBoundingBox', () => {
    it('returns the correct min and max lat/lng', () => {
      const square = [
        { lat: 0, lng: 0 },
        { lat: 10, lng: 0 },
        { lat: 10, lng: 10 },
        { lat: 0, lng: 10 },
        { lat: 0, lng: 0 }
      ];
      const bbox = getPolygonBoundingBox(square);
      expect(bbox).toEqual({
        minLat: 0,
        maxLat: 10,
        minLng: 0,
        maxLng: 10
      });
    });
  });
});

import { generateRoadLoop } from '../geo';

describe('generateRoadLoop', () => {
  let originalFetch: typeof global.fetch;

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('generates a loop from OSM data', async () => {
    const mockOsmData = {
      elements: [
        { type: 'node', id: 1, lat: 0.0, lon: 0.0 },
        { type: 'node', id: 2, lat: 0.001, lon: 0.001 },
        { type: 'node', id: 3, lat: 0.002, lon: 0.002 },
        { type: 'way', id: 10, nodes: [1, 2, 3] }
      ]
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockOsmData
    });

    const loop = await generateRoadLoop(0.0, 0.0, 100, 200);
    expect(loop.length).toBeGreaterThan(1);
    expect(loop[0].lat).toBe(loop[loop.length - 1].lat); // closed loop
  });

  it('falls back to circular loop on Overpass API error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429
    });

    const loop = await generateRoadLoop(0.0, 0.0, 100, 200);
    // circular generator generates 12 points + 1 closing = 13 points
    expect(loop.length).toBe(13);
    expect(loop[0].lat).toBe(loop[loop.length - 1].lat); // closed
  });
});
