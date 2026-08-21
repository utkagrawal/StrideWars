import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { TerritoriesMap } from '../TerritoriesMap';

// Mock the Auth Context
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id' }
  })
}));

// Mock the Toast hook
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({
    addToast: vi.fn()
  })
}));

// Mock API calls
vi.mock('../../api/territories', () => ({
  getTerritoriesInBbox: vi.fn().mockResolvedValue({ territories: [] }),
  getMyTerritories: vi.fn().mockResolvedValue([])
}));

vi.mock('../../api/runs', () => ({
  createRun: (...args: any[]) => mockCreateRun(...args),
  getRuns: vi.fn().mockResolvedValue({ runs: [] }),
  generateRoadLoop: vi.fn().mockResolvedValue([{ lat: 0, lng: 0, recordedAt: '2026-08-21T00:00:00Z' }])
}));

vi.mock('../../api/leaderboards', () => ({
  getUserGlobalRank: vi.fn().mockResolvedValue({ rank: 1 })
}));

vi.mock('../../api/notifications', () => ({
  getUnreadCount: vi.fn().mockResolvedValue({ count: 0 })
}));

const mockCreateRun = vi.fn().mockResolvedValue({
  run: { distance_meters: 150 },
  capturedTerritories: [{ geohash: '9q8yyk8', previousOwnerId: null }],
  enclosedAreaSquareMeters: 5000
});

// We need to mock react-leaflet as it requires an actual DOM environment for the map
vi.mock('react-leaflet', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
    TileLayer: () => <div data-testid="tile-layer" />,
    Rectangle: ({ children }: any) => <div data-testid="rectangle">{children}</div>,
    Tooltip: ({ children }: any) => <div data-testid="tooltip">{children}</div>,
    Polyline: () => <div data-testid="polyline" />,
    useMapEvents: () => ({
      getBounds: () => ({
        getSouth: () => 0,
        getWest: () => 0,
        getNorth: () => 1,
        getEast: () => 1
      }),
      panTo: vi.fn(),
    }),
    useMap: () => ({
      panTo: vi.fn(),
    })
  };
});

// Mock geolocation
const mockWatchPosition = vi.fn((success, error) => {
  // We won't auto-call success, we'll let it fail or be simulated
  error({ code: 1, message: 'Denied' });
  return 123; // watchId
});
const mockClearWatch = vi.fn();

Object.defineProperty(global.navigator, 'geolocation', {
  value: {
    getCurrentPosition: vi.fn().mockImplementation((success) => 
      success({
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 10
        }
      })
    ),
    watchPosition: mockWatchPosition,
    clearWatch: mockClearWatch
  },
  writable: true,
  configurable: true
});

Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  },
  writable: true
});

import { BrowserRouter } from 'react-router-dom';

describe('TerritoriesMap Live Recording State Machine', () => {

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderMap = () => render(
    <BrowserRouter>
      <TerritoriesMap />
    </BrowserRouter>
  );

  it('renders initial idle state without Generate Random Point button, but with Generate Random Loop', () => {
    renderMap();
    
    expect(screen.getByText('Ready to Run')).toBeInTheDocument();
    expect(screen.getByText('Claim Ground')).toBeInTheDocument();
    expect(screen.getByLabelText('Simulate GPS')).toBeInTheDocument();
    
    // Generate Random Point should NOT be visible
    expect(screen.queryByText('Generate Random Point')).not.toBeInTheDocument();
    
    // Generate Random Loop should be visible
    expect(screen.getByText('Generate Random Loop')).toBeInTheDocument();
  });

  it('transitions to recording mode and shows Generate Random Point in simulation mode', async () => {
    renderMap();
    
    // Enable simulation mode
    fireEvent.click(screen.getByLabelText('Simulate GPS'));
    
    // Click Start Run
    fireEvent.click(screen.getByText('Claim Ground'));
    
    // Now in recording mode
    expect(screen.getByText('Recording...')).toBeInTheDocument();
    expect(screen.getByText('Generate Random Point')).toBeInTheDocument();
    expect(screen.getByText('Close Loop & Capture')).toBeInTheDocument();
    
    // Generate Random Loop should STILL be visible
    expect(screen.getByText('Generate Random Loop')).toBeInTheDocument();
    
    // Initial stats
    expect(screen.getByText('00:00')).toBeInTheDocument(); // Time
    expect(screen.getByText('0.00')).toBeInTheDocument(); // Distance
    expect(screen.getByText('0')).toBeInTheDocument(); // Points
  });

  it('generates points and finishes run successfully', async () => {
    renderMap();
    
    fireEvent.click(screen.getByLabelText('Simulate GPS'));
    fireEvent.click(screen.getByText('Claim Ground'));
    
    const generateBtn = screen.getByText('Generate Random Point');
    
    // Generate 5 points
    for (let i = 0; i < 5; i++) {
      fireEvent.click(generateBtn);
    }
    
    expect(screen.getByText('5')).toBeInTheDocument(); // 5 points
    
    // Finish Run
    fireEvent.click(screen.getByText('Close Loop & Capture'));
    
    // Check that createRun was called
    await waitFor(() => {
      expect(mockCreateRun).toHaveBeenCalledTimes(1);
    });
    
    // Expect capture summary overlay
    expect(screen.getByText('🎉 You claimed this ground!')).toBeInTheDocument();
    expect(screen.getByText('9q8yyk8 (Taken)')).toBeInTheDocument();
    expect(screen.getByText('5000 m²')).toBeInTheDocument();
    
    // Reset back to idle
    fireEvent.click(screen.getByText('Close'));
    expect(screen.getByText('Ready to Run')).toBeInTheDocument();
  });
});

import { colorForUser } from '../TerritoriesMap';

describe('colorForUser Utility', () => {
  it('always returns a fixed green color for the current user', () => {
    const currentUserId = 'my-uuid-123';
    expect(colorForUser(currentUserId, currentUserId)).toBe('#4ade80');
    expect(colorForUser('my-uuid-123', 'my-uuid-123')).toBe('#4ade80');
  });

  it('deterministically hashes different users to stable colors', () => {
    const currentUserId = 'my-uuid-123';
    
    const color1 = colorForUser('other-uuid-A', currentUserId);
    const color2 = colorForUser('other-uuid-A', currentUserId);
    expect(color1).toBe(color2); // Deterministic

    const color3 = colorForUser('other-uuid-B', currentUserId);
    expect(color1).not.toBe(color3); // Distinct (high probability)
  });
});
