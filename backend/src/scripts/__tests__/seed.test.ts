/**
 * Unit tests for the demo seed's route builder.
 * The seed must produce loops the real API accepts: closed, a realistic size,
 * and (once timestamped) a believable running pace.
 */
import { buildLoop, DEMO_CENTER } from '../seed';
import {
  stampAtPace,
  polygonArea,
  calculateTotalDistance,
  calculateHaversineDistance,
  calculatePace,
} from '../../utils/geo';

describe('demo seed: buildLoop', () => {
  it('produces a closed, densely sampled loop', () => {
    const loop = buildLoop(DEMO_CENTER, 300, 1);
    const first = loop[0];
    const last = loop[loop.length - 1];

    expect(loop.length).toBeGreaterThan(50);
    expect(calculateHaversineDistance(first.lat, first.lng, last.lat, last.lng)).toBeLessThan(1);
  });

  it('encloses a sensible area (well under the 5 km² cap)', () => {
    const area = polygonArea(buildLoop(DEMO_CENTER, 300, 2));
    expect(area).toBeGreaterThan(150_000);
    expect(area).toBeLessThan(5_000_000);
  });

  it('is deterministic for a given seed', () => {
    expect(buildLoop(DEMO_CENTER, 250, 7)).toEqual(buildLoop(DEMO_CENTER, 250, 7));
  });

  it('passes the anti-spoofing pace check once timestamped', () => {
    const points = stampAtPace(buildLoop(DEMO_CENTER, 300, 3), 330);
    const distance = calculateTotalDistance(points);
    const seconds =
      (new Date(points[points.length - 1].recordedAt).getTime() -
        new Date(points[0].recordedAt).getTime()) /
      1000;

    const pace = calculatePace(distance, seconds)!;
    expect(pace).toBeGreaterThan(90); // server rejects anything faster than 90 s/km
    expect(pace).toBeGreaterThan(300);
    expect(pace).toBeLessThan(400);
  });
});
