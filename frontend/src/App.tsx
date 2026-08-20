import React from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Profile } from './pages/Profile';
import { RunHistory } from './pages/RunHistory';
import { RecordRun } from './pages/RecordRun';
import { RunDetail } from './pages/RunDetail';
import { TerritoriesMap } from './pages/TerritoriesMap';
import { Leaderboards } from './pages/Leaderboards';
import { Feed } from './pages/Feed';
import { Notifications } from './pages/Notifications';
import HomePage from './pages/HomePage';
import { getUnreadCount } from './api/notifications';

const NotificationBell = () => {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = React.useState(0);

  React.useEffect(() => {
    if (!user) return;
    const fetchCount = async () => {
      try {
        const { count } = await getUnreadCount();
        setUnreadCount(count);
      } catch (err) {
        console.error(err);
      }
    };
    fetchCount();
    // Poll every 30s
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [user]);

  return (
    <Link to="/notifications" style={{ color: 'white', textDecoration: 'none', position: 'relative', fontSize: '1.2rem' }}>
      🔔
      {unreadCount > 0 && (
        <span style={{
          position: 'absolute',
          top: '-8px',
          right: '-10px',
          background: 'red',
          color: 'white',
          borderRadius: '50%',
          padding: '2px 6px',
          fontSize: '0.7rem',
          fontWeight: 'bold'
        }}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
};

const AppShell = () => {
  const { user } = useAuth();

  return (
    <div className="app-layout">
      <header className="app-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 2rem', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>
          <Link to="/" style={{ color: 'white', textDecoration: 'none' }}>StrideWars</Link>
        </h1>
        {user ? (
          <nav style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', fontWeight: 500 }}>
            <Link to="/feed" style={{ color: 'white', textDecoration: 'none' }}>Feed</Link>
            <Link to="/territories" style={{ color: 'white', textDecoration: 'none' }}>Map</Link>
            <Link to="/runs" style={{ color: 'white', textDecoration: 'none' }}>Runs</Link>
            <Link to="/runs/new" style={{ color: 'var(--color-brand-primary)', textDecoration: 'none' }}>+ Record</Link>
            <Link to="/leaderboards" style={{ color: 'white', textDecoration: 'none' }}>Rankings</Link>
            <NotificationBell />
            <Link to="/profile" style={{ color: 'white', textDecoration: 'none' }}>Profile</Link>
          </nav>
        ) : (
          <nav style={{ display: 'flex', gap: '1rem' }}>
            <Link to="/login" style={{ color: 'white', textDecoration: 'none' }}>Log In</Link>
            <Link to="/register" style={{ color: 'white', textDecoration: 'none', background: 'var(--color-brand-primary)', padding: '0.25rem 0.75rem', borderRadius: '4px' }}>Sign Up</Link>
          </nav>
        )}
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/:id" element={<Profile />} />
            <Route path="/runs" element={<RunHistory />} />
            <Route path="/runs/new" element={<RecordRun />} />
            <Route path="/runs/:id" element={<RunDetail />} />
            <Route path="/territories" element={<TerritoriesMap />} />
            <Route path="/leaderboards" element={<Leaderboards />} />
            <Route path="/feed" element={<Feed />} />
            <Route path="/notifications" element={<Notifications />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

import { useToast } from './hooks/useToast';

function GlobalApiListeners() {
  const { logout } = useAuth();
  const { addToast } = useToast();

  React.useEffect(() => {
    const handleError = (e: any) => {
      addToast(e.detail?.message || 'An API error occurred', 'error');
    };
    
    const handleUnauthorized = () => {
      logout();
      addToast('Your session has expired. Please log in again.', 'error');
    };

    window.addEventListener('api-error', handleError);
    window.addEventListener('api-unauthorized', handleUnauthorized);

    return () => {
      window.removeEventListener('api-error', handleError);
      window.removeEventListener('api-unauthorized', handleUnauthorized);
    };
  }, [addToast, logout]);

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <GlobalApiListeners />
        <AppShell />
      </ToastProvider>
    </AuthProvider>
  );
}
