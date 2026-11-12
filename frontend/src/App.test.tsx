import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, beforeEach, it, expect, Mock } from 'vitest';
import App from './App';
import * as useAuthHook from './hooks/useAuth';

vi.mock('./hooks/useAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./hooks/useAuth')>();
  return {
    ...actual,
    useAuth: vi.fn(),
    AuthProvider: ({ children }: any) => <>{children}</>,
  };
});

// The map page talks to Leaflet and the API; the shell tests only care about navigation.
vi.mock('./pages/MapPage', () => ({ MapPage: () => <div>map page</div> }));
vi.mock('./api/notifications', () => ({
  getUnreadCount: vi.fn().mockResolvedValue({ count: 3 }),
}));

const renderApp = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>
  );

describe('App shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the landing page and auth links when logged out', () => {
    (useAuthHook.useAuth as Mock).mockReturnValue({ user: null, logout: vi.fn() });
    renderApp();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Run a loop/i);
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Leaderboard' })).not.toBeInTheDocument();
  });

  it('shows the map and full navigation when logged in', async () => {
    (useAuthHook.useAuth as Mock).mockReturnValue({
      user: { id: '1', username: 'testuser' },
      logout: vi.fn(),
    });
    renderApp();

    expect(screen.getByText('map page')).toBeInTheDocument();
    for (const name of ['Map', 'Leaderboard', 'Feed', 'My Runs']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(await screen.findByLabelText('3 unread alerts')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
  });
});
