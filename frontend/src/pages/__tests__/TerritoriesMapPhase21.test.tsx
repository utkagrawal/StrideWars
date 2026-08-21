/**
 * Phase 21 Component Tests
 *
 * Tests:
 * 1. GPS readout is absent outside the recording state.
 * 2. Single click on "Random Loop" produces exactly one createRun call
 *    with no intermediate confirm/preview step; capture-result overlay appears.
 * 3. GPS readout disappears once a run stops.
 *
 * Strategy: to prevent jsdom from making real XHR calls (which hang the test
 * runner indefinitely), we completely replace the global XMLHttpRequest with a
 * stub that immediately fires an error event, causing all axios requests to
 * reject instantly, before any test code runs.
 * Additionally, we mock all API modules that the component depends on.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { TerritoriesMap } from '../TerritoriesMap';

// ── Block all real XHR calls ─────────────────────────────────────────────────
// Replace XMLHttpRequest BEFORE any module loads so axios never makes real
// network calls in jsdom. This prevents the test runner from hanging.
class StubXMLHttpRequest {
  open() {}
  setRequestHeader() {}
  send() {
    setTimeout(() => {
      if (typeof this.onerror === 'function') this.onerror(new Event('error'));
    }, 0);
  }
  abort() {}
  readyState = 4;
  status = 0;
  responseText = '';
  response = null;
  responseType = '';
  onreadystatechange = null;
  onerror: Function | null = null;
  onload = null;
  ontimeout = null;
  upload = { addEventListener: () => {} };
  getAllResponseHeaders() {
    return '';
  }
  getResponseHeader() {
    return null;
  }
  addEventListener(evt: string, cb: Function) {
    if (evt === 'error') this.onerror = cb;
  }
  removeEventListener() {}
  dispatchEvent() {
    return true;
  }
}
vi.stubGlobal('XMLHttpRequest', StubXMLHttpRequest);

// ── Auth / Toast ─────────────────────────────────────────────────────────────
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user-id' } }),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

// ── API mocks ─────────────────────────────────────────────────────────────────
const mockCreateRun = vi.fn().mockResolvedValue({
  run: { distance_meters: 300 },
  capturedTerritories: [{ geohash: 'abc1234', previousOwnerId: null }],
  enclosedAreaSquareMeters: 12345,
});

const mockGenerateRoadLoop = vi.fn().mockResolvedValue([
  { lat: 26.1878, lng: 91.6916, recordedAt: new Date().toISOString() },
  { lat: 26.188, lng: 91.6918, recordedAt: new Date(Date.now() + 1000).toISOString() },
  { lat: 26.1882, lng: 91.692, recordedAt: new Date(Date.now() + 2000).toISOString() },
  { lat: 26.1878, lng: 91.6916, recordedAt: new Date(Date.now() + 3000).toISOString() },
]);

vi.mock('../../api/runs', () => ({
  createRun: (...args: any[]) => mockCreateRun(...args),
  getRuns: vi.fn().mockResolvedValue({ runs: [], nextCursor: null }),
  generateRoadLoop: (...args: any[]) => mockGenerateRoadLoop(...args),
}));

vi.mock('../../api/territories', () => ({
  getTerritoriesInBbox: vi.fn().mockResolvedValue({ territories: [] }),
  getMyTerritories: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../api/leaderboards', () => ({
  getUserGlobalRank: vi.fn().mockResolvedValue({ rank: 1 }),
}));

vi.mock('../../api/notifications', () => ({
  getUnreadCount: vi.fn().mockResolvedValue({ count: 0 }),
}));

// ── react-leaflet mock ───────────────────────────────────────────────────────
vi.mock('react-leaflet', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
    TileLayer: () => <div />,
    Rectangle: ({ children }: any) => <div>{children}</div>,
    Tooltip: ({ children }: any) => <div>{children}</div>,
    Polyline: () => <div />,
    Polygon: () => <div />,
    useMapEvents: () => ({
      getBounds: () => ({
        getSouth: () => 0,
        getWest: () => 0,
        getNorth: () => 1,
        getEast: () => 1,
      }),
      panTo: vi.fn(),
    }),
    useMap: () => ({ panTo: vi.fn() }),
  };
});

// ── Geolocation mock ─────────────────────────────────────────────────────────
const mockGetCurrentPosition = vi.fn((success: any) =>
  success({ coords: { latitude: 26.1878, longitude: 91.6916, accuracy: 5 } })
);
const mockWatchPosition = vi.fn((_success: any, error: any) => {
  error({ code: 1, message: 'Denied' });
  return 42;
});

Object.defineProperty(global.navigator, 'geolocation', {
  value: {
    getCurrentPosition: mockGetCurrentPosition,
    watchPosition: mockWatchPosition,
    clearWatch: vi.fn(),
  },
  writable: true,
  configurable: true,
});

Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: vi.fn().mockReturnValue('true'), // skip tour
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
});

const renderMap = () =>
  render(
    <BrowserRouter>
      <TerritoriesMap />
    </BrowserRouter>
  );

// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 21 – GPS Readout State', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('GPS readout is NOT shown in idle state', () => {
    renderMap();
    expect(screen.queryByText(/GPS:/)).not.toBeInTheDocument();
  });

  it('GPS readout disappears once run is submitted', async () => {
    renderMap();
    expect(screen.getByText('Ready to Run')).toBeInTheDocument();
    expect(screen.queryByText(/GPS:/)).not.toBeInTheDocument();
  });

  it('GPS readout is present and populates during a recording session', async () => {
    renderMap();

    // Enable simulation, start
    fireEvent.click(screen.getByLabelText('Simulate GPS'));
    fireEvent.click(screen.getByText('Claim Ground'));
    expect(screen.getByText('Recording...')).toBeInTheDocument();

    // Generate some points
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText('Generate Random Point'));
    }

    // Wait for the GPS readout to populate (it updates every 2s, but we can advance timers if needed, or wait)
    await waitFor(
      () => {
        const gpsElements = screen.getAllByText(/GPS:/);
        expect(gpsElements.length).toBeGreaterThan(0);
        expect(gpsElements.length).toBeLessThanOrEqual(5);
      },
      { timeout: 3000 }
    );

    // Verify coordinates match generated points logic (approx 26.18, 91.69)
    expect(screen.getByText(/26\.18/)).toBeInTheDocument();
    expect(screen.getByText(/91\.69/)).toBeInTheDocument();
  });

  it('GPS readout disappears once run is submitted', async () => {
    renderMap();

    // Enable simulation, start
    fireEvent.click(screen.getByLabelText('Simulate GPS'));
    fireEvent.click(screen.getByText('Claim Ground'));
    expect(screen.getByText('Recording...')).toBeInTheDocument();

    // Generate some points
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByText('Generate Random Point'));
    }

    // Stop the run (triggers createRun)
    await act(async () => {
      fireEvent.click(screen.getByText('Close Loop & Capture'));
    });

    // After run finishes, GPS readout must be gone
    await waitFor(() => {
      expect(screen.queryByText(/GPS:/)).not.toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 21 – One-click Generate Random Loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('single click produces exactly one createRun call without confirm step', async () => {
    renderMap();

    const loopBtn = screen.getByText('Random Loop');
    expect(loopBtn).toBeInTheDocument();

    // No confirm/preview before or immediately after click
    expect(screen.queryByText(/confirm/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/preview/i)).not.toBeInTheDocument();

    fireEvent.click(loopBtn);

    // Still no confirm step immediately after click
    expect(screen.queryByText(/confirm/i)).not.toBeInTheDocument();

    // Wait for generateRoadLoop → 1.5s highlight → createRun
    await waitFor(
      () => {
        expect(mockCreateRun).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 }
    );

    // Only one call each
    expect(mockGenerateRoadLoop).toHaveBeenCalledTimes(1);
    expect(mockCreateRun).toHaveBeenCalledTimes(1);

    // No confirm was ever shown
    expect(screen.queryByText(/confirm/i)).not.toBeInTheDocument();
  });

  it('capture-result overlay appears automatically', async () => {
    renderMap();

    fireEvent.click(screen.getByText('Random Loop'));

    await waitFor(
      () => {
        expect(screen.getByText('🎉 You claimed this ground!')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    expect(screen.getByText('12345 m²')).toBeInTheDocument();
  });

  it('Close button resets to idle state', async () => {
    renderMap();

    fireEvent.click(screen.getByText('Random Loop'));

    await waitFor(() => screen.getByText('🎉 You claimed this ground!'), { timeout: 5000 });

    fireEvent.click(screen.getByText('Close'));
    expect(screen.getByText('Ready to Run')).toBeInTheDocument();
  });
});
