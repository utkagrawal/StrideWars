import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api/axios';
import { useAuth } from '../hooks/useAuth';

/** Credentials created by `npm run db:seed` (backend/src/scripts/seed.ts). */
export const DEMO_EMAIL = 'demo@stridewars.app';
export const DEMO_PASSWORD = 'password123';

/** One click into the seeded demo world, for portfolio visitors and live demos. */
export const DemoLoginButton = ({
  className = 'btn btn-secondary btn-block',
}: {
  className?: string;
}) => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<React.ReactNode>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/auth/login', {
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });
      login(data.user, data.accessToken);
      navigate('/');
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 401) {
        // Wrong credentials = the demo user doesn't exist in this database yet.
        setError(
          <>
            Demo account not found. Run <code>npm run db:seed</code> in backend/.
          </>
        );
      } else if (!err.response) {
        setError('Cannot reach the API. Is the backend running?');
      } else {
        setError(err.response.data?.error?.message || 'Demo login failed.');
      }
      setLoading(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={handleClick} disabled={loading}>
        {loading ? 'Signing in…' : 'Try the demo account'}
      </button>
      {error && (
        <p className="form-error" style={{ marginTop: '0.75rem' }}>
          {error}
        </p>
      )}
    </>
  );
};

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      login(data.user, data.accessToken);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to log in');
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Welcome back</h1>
        <p>Log in to check on your ground.</p>
        {error && <div className="form-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <div className="divider">or</div>
        <DemoLoginButton />
        <div className="auth-switch">
          New here? <Link to="/register">Create an account</Link>
        </div>
      </div>
    </div>
  );
};
