import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getRuns, Run } from '../api/runs';

export const RunHistory = () => {
  const [runs, setRuns] = useState<Run[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchRuns = async (cursor?: string) => {
    try {
      setLoading(true);
      const data = await getRuns(cursor, 10);
      if (cursor) {
        setRuns((prev) => [...prev, ...data.runs]);
      } else {
        setRuns(data.runs);
      }
      setNextCursor(data.nextCursor);
    } catch (err: any) {
      setError('Failed to load runs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const formatDistance = (meters: number) => (meters / 1000).toFixed(2) + ' km';
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
        }}
      >
        <h2>Your Run History</h2>
        <Link
          to="/runs/new"
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--color-brand-primary)',
            color: 'white',
            borderRadius: '4px',
            textDecoration: 'none',
          }}
        >
          + Record Run
        </Link>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {runs.map((run) => (
          <Link to={`/runs/${run.id}`} key={run.id} style={{ textDecoration: 'none' }}>
            <div
              className="profile-info"
              style={{ transition: 'transform 0.2s ease', cursor: 'pointer' }}
            >
              <h3>
                {new Date(run.started_at).toLocaleDateString()} at{' '}
                {new Date(run.started_at).toLocaleTimeString()}
              </h3>
              <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem' }}>
                <p>
                  <strong>Distance:</strong> {formatDistance(run.distance_meters)}
                </p>
                <p>
                  <strong>Duration:</strong> {formatDuration(run.duration_seconds)}
                </p>
                {run.avg_pace_sec_per_km && (
                  <p>
                    <strong>Pace:</strong> {formatDuration(run.avg_pace_sec_per_km)} / km
                  </p>
                )}
              </div>
            </div>
          </Link>
        ))}

        {!loading && runs.length === 0 && (
          <p style={{ color: 'var(--color-text-secondary)' }}>
            You haven't run any loops yet. Claim your first piece of the map today.
          </p>
        )}
      </div>

      {nextCursor && (
        <button
          onClick={() => fetchRuns(nextCursor)}
          disabled={loading}
          style={{ marginTop: '2rem', maxWidth: '200px', marginInline: 'auto', display: 'block' }}
        >
          {loading ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
};
