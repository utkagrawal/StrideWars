import { encodeGeohash, decodeGeohash, getGeohashesInBbox, computeIntersectingGeohashes } from '../geohash';

describe('Geohash Utilities', () => {
  describe('encodeGeohash / decodeGeohash', () => {
    it('encodes and decodes coordinates correctly', () => {
      const lat = 37.7749;
      const lng = -122.4194;
      const precision = 7;
      
      const hash = encodeGeohash(lat, lng, precision);
      expect(hash.length).toBe(precision);
      
      const decoded = decodeGeohash(hash);
      // It should be close to the original coordinates
      expect(decoded.lat).toBeCloseTo(lat, 1);
      expect(decoded.lng).toBeCloseTo(lng, 1);
    });
  });

  describe('getGeohashesInBbox', () => {
    it('returns an array of geohashes', () => {
      const hashes = getGeohashesInBbox(37.7, -122.5, 37.8, -122.4);
      expect(hashes).toBeInstanceOf(Array);
      expect(hashes.length).toBeGreaterThan(0);
      expect(hashes[0].length).toBe(7);
    });
  });

  describe('computeIntersectingGeohashes', () => {
    it('returns empty array if less than 4 points', () => {
      expect(computeIntersectingGeohashes([])).toEqual([]);
      expect(computeIntersectingGeohashes([{ lat: 0, lng: 0 }])).toEqual([]);
      expect(computeIntersectingGeohashes([
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
        { lat: 0, lng: 0 }
      ])).toEqual([]);
    });

    it('returns empty array if track does not intersect any cell center', () => {
      // Extremely small polygon that doesn't cover any geohash center at precision 7
      const p1 = { lat: 37.7749, lng: -122.4194 };
      const p2 = { lat: 37.774900001, lng: -122.4194 };
      const p3 = { lat: 37.774900001, lng: -122.419400001 };
      const p4 = { lat: 37.7749, lng: -122.4194 };
      
      const hashes = computeIntersectingGeohashes([p1, p2, p3, p4], 7);
      expect(hashes).toEqual([]);
    });

    it('returns lexicographically sorted geohashes for a large polygon', () => {
      // Large polygon that should cover multiple geohash centers
      const p1 = { lat: 37.7, lng: -122.5 };
      const p2 = { lat: 37.8, lng: -122.5 };
      const p3 = { lat: 37.8, lng: -122.4 };
      const p4 = { lat: 37.7, lng: -122.4 };
      const p5 = { lat: 37.7, lng: -122.5 };
      
      const hashes = computeIntersectingGeohashes([p1, p2, p3, p4, p5], 7);
      expect(hashes.length).toBeGreaterThan(1);
      
      // Verify sorting (important for lock order)
      const isSorted = hashes.slice(1).every((item, i) => hashes[i] <= item);
      expect(isSorted).toBe(true);
    });
  });
});
