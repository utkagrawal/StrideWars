import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, beforeEach, it, expect, Mock } from 'vitest';
import HomePage from '../HomePage';
import { AuthProvider } from '../../hooks/useAuth';
import { ToastProvider } from '../../hooks/useToast';
import * as runsApi from '../../api/runs';
import * as territoriesApi from '../../api/territories';
import * as leaderboardsApi from '../../api/leaderboards';
import * as notificationsApi from '../../api/notifications';

vi.mock('../../api/runs');
vi.mock('../../api/territories');
vi.mock('../../api/leaderboards');
vi.mock('../../api/notifications');

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: '1', username: 'testuser' } }),
  AuthProvider: ({ children }: any) => <>{children}</>
}));

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          {ui}
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('Dashboard (HomePage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    (runsApi.getRuns as Mock).mockReturnValue(new Promise(() => {}));
    (territoriesApi.getMyTerritories as Mock).mockReturnValue(new Promise(() => {}));
    (leaderboardsApi.getUserGlobalRank as Mock).mockReturnValue(new Promise(() => {}));
    (notificationsApi.getUnreadCount as Mock).mockReturnValue(new Promise(() => {}));

    renderWithProviders(<HomePage />);
    expect(screen.getByText(/Loading Dashboard.../i)).toBeInTheDocument();
  });

  it('renders dashboard data when fetch is successful', async () => {
    (runsApi.getRuns as Mock).mockResolvedValue({ runs: [{ id: '1', distanceMeters: 5000, durationSeconds: 1500, startedAt: new Date().toISOString() }, { id: '2', distanceMeters: 3000, durationSeconds: 900, startedAt: new Date().toISOString() }] });
    (territoriesApi.getMyTerritories as Mock).mockResolvedValue([{ geohash: '9q8yyk' }]);
    (leaderboardsApi.getUserGlobalRank as Mock).mockResolvedValue({ rank: 42 });
    (notificationsApi.getUnreadCount as Mock).mockResolvedValue({ count: 3 });

    renderWithProviders(<HomePage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading Dashboard.../i)).not.toBeInTheDocument();
    });

    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // Territories count
    expect(screen.getByText('3')).toBeInTheDocument(); // Unread notifications
    expect(screen.getByText(/5.00 km/i)).toBeInTheDocument();
  });

  it('handles empty states correctly', async () => {
    (runsApi.getRuns as Mock).mockResolvedValue({ runs: [] });
    (territoriesApi.getMyTerritories as Mock).mockResolvedValue([]);
    (leaderboardsApi.getUserGlobalRank as Mock).mockResolvedValue({ rank: null });
    (notificationsApi.getUnreadCount as Mock).mockResolvedValue({ count: 0 });

    renderWithProviders(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText('Unranked')).toBeInTheDocument();
    });

    expect(screen.getByText("You haven't recorded any runs yet.")).toBeInTheDocument();
  });
});
