import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, beforeEach, it, expect, Mock } from 'vitest';
import App from './App';
import * as useAuthHook from './hooks/useAuth';

vi.mock('./hooks/useAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./hooks/useAuth')>();
  return {
    ...actual,
    useAuth: vi.fn(),
    AuthProvider: ({ children }: any) => <>{children}</>
  };
});

vi.mock('./api/notifications', () => ({
  getUnreadCount: vi.fn().mockResolvedValue({ count: 0 })
}));

Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  },
  writable: true
});

const renderApp = () => {
  return render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
};

describe('App Shell Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders limited navigation when logged out', () => {
    (useAuthHook.useAuth as Mock).mockReturnValue({ user: null });
    
    renderApp();
    
    expect(screen.getByText('StrideWars')).toBeInTheDocument();
    expect(screen.getAllByText('Log In').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sign Up').length).toBeGreaterThan(0);
    
    // Auth-only links should not be present
    expect(screen.queryByText('Feed')).not.toBeInTheDocument();
    expect(screen.queryByText('Rankings')).not.toBeInTheDocument();
    expect(screen.queryByText('Profile')).not.toBeInTheDocument();
  });

  it('renders full navigation when logged in', () => {
    (useAuthHook.useAuth as Mock).mockReturnValue({ 
      user: { id: '1', username: 'testuser' } 
    });
    
    renderApp();
    
    expect(screen.getByText('StrideWars')).toBeInTheDocument();
    expect(screen.getByText('Feed')).toBeInTheDocument();
    expect(screen.getByText('Map')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Runs')).toBeInTheDocument();
    expect(screen.getByText('+ Record')).toBeInTheDocument();
    expect(screen.getByText('Rankings')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
    
    // Logged out links should be gone
    expect(screen.queryByText('Log In')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign Up')).not.toBeInTheDocument();
  });
});
