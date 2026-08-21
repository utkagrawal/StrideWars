import { describe, it, expect } from 'vitest';
import {
  destinationPoint,
  calculateHaversineDistance,
  calculateTotalDistance,
  traceClusterPerimeter,
  generateRandomLoop,
} from '../geo';

describe('Geo Utilities', () => {
  describe('destinationPoint', () => {
    it('calculates the correct destination point given distance and bearing', () => {
      // Start in San Francisco
      const startLat = 37.7749;
      const startLng = -122.4194;
      const distance = 1000; // 1km
      const bearing = 90; // Due East

      const dest = destinationPoint(startLat, startLng, bearing, distance);

      // Expected: latitude should be roughly the same (slightly different due to great circle),
      // longitude should be roughly 1km east.
      // 1 degree of longitude at 37.77 lat is ~111km * cos(37.77) = ~87.8km.
      // So 1km is roughly 0.0113 degrees.

      expect(dest.lat).toBeCloseTo(37.7749, 3);
      expect(dest.lng).toBeCloseTo(-122.408, 3); // -122.4194 + 0.0114 = -122.408

      // Verify distance is approximately 1000m using haversine
      const calculatedDistance = calculateHaversineDistance(startLat, startLng, dest.lat, dest.lng);
      expect(calculatedDistance).toBeCloseTo(distance, 0);
    });

    it('calculates correct destination moving Due North', () => {
      const startLat = 0;
      const startLng = 0;
      const distance = 111320; // Roughly 1 degree of latitude
      const bearing = 0; // Due North

      const dest = destinationPoint(startLat, startLng, bearing, distance);

      expect(dest.lat).toBeCloseTo(1, 1);
      expect(dest.lng).toBeCloseTo(0, 1);
    });
  });

  describe('calculateTotalDistance', () => {
    it('sums the distance of a path', () => {
      const path = [
        { lat: 37.7749, lng: -122.4194 },
        destinationPoint(37.7749, -122.4194, 90, 100),
        destinationPoint(37.7749, -122.4194, 90, 200), // Note: this calculates from start, let's make a real path
      ];

      const realPath = [
        { lat: 37.7749, lng: -122.4194 },
        destinationPoint(37.7749, -122.4194, 90, 100),
      ];
      realPath.push(destinationPoint(realPath[1].lat, realPath[1].lng, 180, 50));

      // total distance should be 100 + 50 = 150m
      const total = calculateTotalDistance(realPath);
      expect(total).toBeCloseTo(150, 0);
    });
  });

  describe('traceClusterPerimeter', () => {
    it('returns empty array for empty input', () => {
      expect(traceClusterPerimeter([])).toEqual([]);
    });

    it('traces a single geohash into a rectangular polygon', () => {
      // Just test that it gives one ring with 5 points (closed loop of 4 corners)
      const rings = traceClusterPerimeter(['9q8yyk8']);
      expect(rings.length).toBe(1);
      expect(rings[0].length).toBe(5);

      // Ensure it is closed
      const first = rings[0][0];
      const last = rings[0][4];
      expect(first[0]).toBeCloseTo(last[0], 5);
      expect(first[1]).toBeCloseTo(last[1], 5);
    });

    it('merges two adjacent geohashes into a single polygon', () => {
      // Two hashes that share an edge
      const rings = traceClusterPerimeter(['9q8yyk8', '9q8yyk9']);
      expect(rings.length).toBe(1);

      // A rectangle of 2 cells has 6 outer edges, so 7 points to close it
      expect(rings[0].length).toBe(7);
    });
  });

  describe('generateRandomLoop', () => {
    it('generates a closed loop of the correct length with timestamps', () => {
      const numPoints = 8;
      const loop = generateRandomLoop(0, 0, numPoints, 100);

      expect(loop.length).toBe(numPoints + 1); // +1 for closing point

      // Check closure
      expect(loop[0].lat).toBe(loop[loop.length - 1].lat);
      expect(loop[0].lng).toBe(loop[loop.length - 1].lng);

      // Check timestamps are valid ISO strings
      loop.forEach((pt) => {
        expect(new Date(pt.recordedAt).getTime()).not.toBeNaN();
      });
    });
  });
});
