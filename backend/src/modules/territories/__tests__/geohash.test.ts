import { encodeGeohash, decodeGeohash, getGeohashesInBbox } from '../geohash';

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
});
