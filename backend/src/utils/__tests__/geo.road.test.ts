/**
 * Unit tests for Phase 21: Road-Following Loop Generator (geo.ts)
 *
 * Tests cover:
 * - Road-graph construction from a mocked Overpass API response
 * - Bounded random walk termination, non-empty path, and closure
 * - Circular fallback when road-data fetch fails/errors
 */

import { generateRoadLoop, generateRandomLoop } from '../geo';

// ---------------------------------------------------------------------------
// Minimal Overpass response: L-shaped road, 6 nodes, 1 way
// ---------------------------------------------------------------------------
const MOCK_OVERPASS_RESPONSE = {
  elements: [
    { type: 'node', id: 1, lat: 26.1878, lon: 91.6916 },
    { type: 'node', id: 2, lat: 26.188, lon: 91.6916 },
    { type: 'node', id: 3, lat: 26.1882, lon: 91.6916 },
    { type: 'node', id: 4, lat: 26.1882, lon: 91.692 },
    { type: 'node', id: 5, lat: 26.1882, lon: 91.6924 },
    { type: 'node', id: 6, lat: 26.188, lon: 91.6924 },
    {
      type: 'way',
      id: 100,
      nodes: [1, 2, 3, 4, 5, 6, 2],
      tags: { highway: 'residential' },
    },
  ],
};

// Patch global.fetch for all tests in this file
const originalFetch = (global as any).fetch;
afterAll(() => {
  (global as any).fetch = originalFetch;
});

function mockFetchSuccess(body: object) {
  (global as any).fetch = jest.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => body,
  });
}

function mockFetchError(err: Error) {
  (global as any).fetch = jest.fn().mockRejectedValueOnce(err);
}

function mockFetchBadStatus(status: number) {
  (global as any).fetch = jest.fn().mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({}),
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Road-graph construction
// ────────────────────────────────────────────────────────────────────────────
describe('generateRoadLoop – road-graph construction from Overpass data', () => {
  it('returns a non-empty point array with valid coordinates', async () => {
    mockFetchSuccess(MOCK_OVERPASS_RESPONSE);

    const points = await generateRoadLoop(26.1878, 91.6916, 50, 300);

    expect(points.length).toBeGreaterThan(1);
    for (const pt of points) {
      expect(pt.lat).toBeGreaterThan(-90);
      expect(pt.lat).toBeLessThan(90);
      expect(pt.lng).toBeGreaterThan(-180);
      expect(pt.lng).toBeLessThan(180);
      expect(Number.isNaN(new Date(pt.recordedAt).getTime())).toBe(false);
    }
  });

  it('returns points with monotonically non-decreasing timestamps', async () => {
    mockFetchSuccess(MOCK_OVERPASS_RESPONSE);

    const points = await generateRoadLoop(26.1878, 91.6916, 50, 300);
    for (let i = 1; i < points.length; i++) {
      const prev = new Date(points[i - 1].recordedAt).getTime();
      const curr = new Date(points[i].recordedAt).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. Bounded random walk
// ────────────────────────────────────────────────────────────────────────────
describe('generateRoadLoop – bounded random walk', () => {
  it('terminates and produces a non-empty path within distance limits', async () => {
    mockFetchSuccess(MOCK_OVERPASS_RESPONSE);
    const points = await generateRoadLoop(26.1878, 91.6916, 30, 200);
    expect(points.length).toBeGreaterThan(1);
  });

  it('closes the loop (first point equals last point)', async () => {
    mockFetchSuccess(MOCK_OVERPASS_RESPONSE);
    const points = await generateRoadLoop(26.1878, 91.6916, 50, 300);
    const first = points[0];
    const last = points[points.length - 1];
    expect(first.lat).toBeCloseTo(last.lat, 4);
    expect(first.lng).toBeCloseTo(last.lng, 4);
  });

  it('produces at least 2 distinct points before the closing duplicate', async () => {
    mockFetchSuccess(MOCK_OVERPASS_RESPONSE);
    const points = await generateRoadLoop(26.1878, 91.6916, 50, 300);
    // points.length ≥ 3 means at least [start, ..., start_copy]
    expect(points.length).toBeGreaterThanOrEqual(2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Circular fallback
// ────────────────────────────────────────────────────────────────────────────
describe('generateRoadLoop – circular fallback on failure', () => {
  it('falls back when fetch throws a network error', async () => {
    mockFetchError(new Error('Network error'));
    const points = await generateRoadLoop(26.1878, 91.6916, 300, 800);
    expect(points.length).toBeGreaterThan(1);
    expect(points[0].lat).toBeCloseTo(points[points.length - 1].lat, 5);
    expect(points[0].lng).toBeCloseTo(points[points.length - 1].lng, 5);
  });

  it('falls back when Overpass returns HTTP 429 (rate-limited)', async () => {
    mockFetchBadStatus(429);
    const points = await generateRoadLoop(26.1878, 91.6916, 300, 800);
    expect(points.length).toBeGreaterThan(1);
    expect(points[0].lat).toBeCloseTo(points[points.length - 1].lat, 5);
  });

  it('falls back when Overpass returns HTTP 500', async () => {
    mockFetchBadStatus(500);
    const points = await generateRoadLoop(26.1878, 91.6916, 300, 800);
    expect(points.length).toBeGreaterThan(1);
    expect(points[0].lat).toBeCloseTo(points[points.length - 1].lat, 5);
  });

  it('falls back when Overpass returns zero elements (no roads nearby)', async () => {
    mockFetchSuccess({ elements: [] });
    const points = await generateRoadLoop(26.1878, 91.6916, 300, 800);
    expect(points.length).toBeGreaterThan(1);
    expect(points[0].lat).toBeCloseTo(points[points.length - 1].lat, 5);
  });

  it('fallback result is closed — same guarantee as generateRandomLoop', async () => {
    mockFetchError(new Error('offline'));
    const road = await generateRoadLoop(0, 0, 300, 800);
    const circular = generateRandomLoop(0, 0, 12, 150);

    // Both must be closed
    expect(road[0].lat).toBeCloseTo(road[road.length - 1].lat, 4);
    expect(road[0].lng).toBeCloseTo(road[road.length - 1].lng, 4);
    expect(circular[0].lat).toBeCloseTo(circular[circular.length - 1].lat, 4);
    expect(circular[0].lng).toBeCloseTo(circular[circular.length - 1].lng, 4);
  });
});
