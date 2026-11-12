import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getRuns, Run } from '../api/runs';
import { EmptyState, PageLoading } from '../components/ui';
import { formatDistance, formatDuration, formatPace, timeAgo } from '../utils/format';

export const RunHistory = () => {
  const [runs, setRuns] = useState<Run[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (cursor?: string) => {
    setLoading(true);
    try {
      const data = await getRuns(cursor, 20);
      setRuns((prev) => (cursor ? [...prev, ...data.runs] : data.runs));
      setNextCursor(data.nextCursor);
    } catch {
      setError('Failed to load your runs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const totalKm = runs.reduce((n, r) => n + Number(r.distance_meters), 0);
  const totalSec = runs.reduce((n, r) => n + r.duration_seconds, 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>My runs</h1>
          <p>Every loop you&apos;ve run, newest first.</p>
        </div>
        <Link to="/" className="btn btn-primary">
          New run
        </Link>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading && runs.length === 0 ? (
        <PageLoading />
      ) : runs.length === 0 ? (
        <EmptyState title="No runs yet" actionTo="/" actionLabel="Run your first loop">
          Close a loop on the map to claim your first ground.
        </EmptyState>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-label">Runs</div>
              <div className="stat-value">{runs.length}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Distance</div>
              <div className="stat-value">{formatDistance(totalKm)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Time running</div>
              <div className="stat-value">{formatDuration(totalSec)}</div>
            </div>
          </div>

          <div className="list">
            {runs.map((run) => (
              <Link to={`/runs/${run.id}`} key={run.id} className="list-item">
                <div className="list-item-body">
                  <div className="list-item-title">
                    {formatDistance(Number(run.distance_meters))} ·{' '}
                    {formatDuration(run.duration_seconds)}
                  </div>
                  <div className="list-item-meta">
                    {timeAgo(run.created_at)} · {formatPace(run.avg_pace_sec_per_km)}
                  </div>
                </div>
                <span className="muted">→</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {nextCursor && (
        <button
          className="btn btn-secondary btn-block"
          style={{ marginTop: '1rem' }}
          onClick={() => load(nextCursor)}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
};
