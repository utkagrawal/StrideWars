import { extractAndSortUniqueTerritories } from '../runs.service';

describe('Runs Service Utilities', () => {
  describe('extractAndSortUniqueTerritories', () => {
    it('extracts unique geohashes and sorts them lexicographically', () => {
      // Points that map to various cells. Some points overlap in the same cell.
      // We rely on the encodeGeohash function internally.
      // E.g., points very close to each other.
      const points = [
        { lat: 37.7749, lng: -122.4194 }, // cell 1
        { lat: 37.7749, lng: -122.4194 }, // duplicate cell 1
        { lat: 34.0522, lng: -118.2437 }, // cell 2
        { lat: 40.7128, lng: -74.0060 },  // cell 3
      ];

      const uniqueSorted = extractAndSortUniqueTerritories(points);
      
      // Should remove the duplicate
      expect(uniqueSorted.length).toBe(3);
      
      // Should be sorted alphabetically/lexicographically
      const copy = [...uniqueSorted].sort();
      expect(uniqueSorted).toEqual(copy);
    });

    it('returns empty array when no points are provided', () => {
      expect(extractAndSortUniqueTerritories([])).toEqual([]);
    });
  });
});
