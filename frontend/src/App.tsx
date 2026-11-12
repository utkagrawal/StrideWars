import React, { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider, useToast } from './hooks/useToast';
import { ProtectedRoute } from './components/ProtectedRoute';
import { NavBar } from './components/NavBar';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { MapPage } from './pages/MapPage';
import { Leaderboards } from './pages/Leaderboards';
import { Feed } from './pages/Feed';
import { Notifications } from './pages/Notifications';
import { RunHistory } from './pages/RunHistory';
import { RunDetail } from './pages/RunDetail';
import { Profile } from './pages/Profile';

/** Logged in → the live map. Logged out → the landing page. */
const Home = () => {
  const { user } = useAuth();
  return user ? <MapPage /> : <Landing />;
};

/** Bridges axios interceptor events (fired outside React) into toasts / logout. */
function GlobalApiListeners() {
  const { logout } = useAuth();
  const { addToast } = useToast();

  useEffect(() => {
    const onError = (e: Event) =>
      addToast((e as CustomEvent).detail?.message || 'Something went wrong', 'error');
    const onUnauthorized = () => {
      logout();
      addToast('Your session expired. Please log in again.', 'error');
    };
    window.addEventListener('api-error', onError);
    window.addEventListener('api-unauthorized', onUnauthorized);
    return () => {
      window.removeEventListener('api-error', onError);
      window.removeEventListener('api-unauthorized', onUnauthorized);
    };
  }, [addToast, logout]);

  return null;
}

export const AppRoutes = () => {
  const { user } = useAuth();
  return (
    <div className="app">
      <NavBar />
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/leaderboards" element={<Leaderboards />} />
            <Route path="/feed" element={<Feed />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/runs" element={<RunHistory />} />
            <Route path="/runs/:id" element={<RunDetail />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/:id" element={<Profile />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <GlobalApiListeners />
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}
