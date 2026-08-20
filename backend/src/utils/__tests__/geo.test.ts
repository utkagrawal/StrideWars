import { haversineDistance, simplifyPath, BoundingBox } from '../geo';

describe('Geo Utilities', () => {
  describe('haversineDistance', () => {
    it('calculates the distance between two distinct points', () => {
      const p1 = { lat: 37.7749, lng: -122.4194 }; // SF
      const p2 = { lat: 34.0522, lng: -118.2437 }; // LA
      
      const distance = haversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
      // Distance is roughly 559 km (559000 meters)
      expect(distance).toBeGreaterThan(550000);
      expect(distance).toBeLessThan(570000);
    });

    it('returns 0 for the exact same point', () => {
      const p = { lat: 51.5074, lng: -0.1278 };
      expect(haversineDistance(p.lat, p.lng, p.lat, p.lng)).toBe(0);
    });
  });

  describe('simplifyPath (Douglas-Peucker)', () => {
    const p1 = { lat: 0, lng: 0 };
    const p2 = { lat: 0, lng: 0.0001 }; // Very close to the line p1-p3
    const p3 = { lat: 0, lng: 0.0005 };
    const p4 = { lat: 0.01, lng: 0.0002 }; // Spike
    const p5 = { lat: 0, lng: 0.001 };

    it('returns the same array if it has less than 3 points', () => {
      expect(simplifyPath([])).toEqual([]);
      expect(simplifyPath([p1])).toEqual([p1]);
      expect(simplifyPath([p1, p2])).toEqual([p1, p2]);
    });

    it('removes points that are within the tolerance distance', () => {
      const path = [p1, p2, p3]; // p2 is on the straight line between p1 and p3
      const simplified = simplifyPath(path, 10);
      
      expect(simplified.length).toBe(2);
      expect(simplified[0]).toEqual(p1);
      expect(simplified[1]).toEqual(p3);
    });

    it('keeps points that deviate beyond the tolerance', () => {
      const path = [p1, p4, p5]; // p4 is a huge spike
      const simplified = simplifyPath(path, 10); // 10 meters tolerance
      
      expect(simplified.length).toBe(3);
      expect(simplified).toEqual(path);
    });
  });
});
