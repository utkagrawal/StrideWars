import { encodeGeohash, decodeGeohash, getGeohashNeighbors, getBboxForGeohash } from '../geohash';

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

  describe('getGeohashNeighbors', () => {
    it('returns an array of 8 neighbors', () => {
      const neighbors = getGeohashNeighbors('9q8yyk8');
      expect(neighbors).toBeInstanceOf(Array);
      expect(neighbors.length).toBe(8);
      
      // Ensure all neighbors have the same precision
      neighbors.forEach(n => {
        expect(n.length).toBe(7);
      });
    });
  });

  describe('getBboxForGeohash', () => {
    it('returns a valid bounding box', () => {
      const bbox = getBboxForGeohash('9q8yyk8');
      expect(bbox).toHaveProperty('minLat');
      expect(bbox).toHaveProperty('minLng');
      expect(bbox).toHaveProperty('maxLat');
      expect(bbox).toHaveProperty('maxLng');
      
      expect(bbox.minLat).toBeLessThan(bbox.maxLat);
      expect(bbox.minLng).toBeLessThan(bbox.maxLng);
    });
  });
});
