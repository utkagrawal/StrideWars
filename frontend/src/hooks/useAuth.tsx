import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, setAccessToken } from '../api/axios';

interface User {
  id: string;
  username: string;
  email: string;
  displayName?: string | null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (userData: User, token: string) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  /** Replace the in-memory user after a profile edit, so every screen shows the change. */
  updateUser: (userData: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const login = (userData: User, token: string) => {
    setUser(userData);
    setAccessToken(token);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.error('Logout failed on server', e);
    } finally {
      setUser(null);
      setAccessToken('');
    }
  };

  const checkAuth = async () => {
    try {
      // First attempt to refresh the token to get a valid access token in memory
      const { data: refreshData } = await api.post('/auth/refresh');
      setAccessToken(refreshData.accessToken);

      // Now fetch the user's profile using the new access token
      const { data: userData } = await api.get('/users/me');
      setUser(userData.user);
    } catch (err) {
      // Not authenticated, do nothing
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  if (loading) {
    // Silent refresh in progress (restoring the session from the httpOnly cookie)
    return (
      <div className="center-fill" style={{ minHeight: '100vh' }}>
        <div className="spinner" role="status" aria-label="Loading" />
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, login, logout, checkAuth, updateUser: setUser }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
