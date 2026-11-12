import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRunById, Run, RunPoint } from '../api/runs';
import { RouteMap } from '../components/RouteMap';
import { PageLoading } from '../components/ui';
import { formatDistance, formatDuration, formatPace } from '../utils/format';

export const RunDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<Run | null>(null);
  const [points, setPoints] = useState<RunPoint[]>([]);
  const [counts, setCounts] = useState({ raw: 0, simplified: 0 });
  const [simplify, setSimplify] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getRunById(id, simplify)
      .then((data) => {
        setRun(data.run);
        setPoints(data.points);
        setCounts({ raw: data.pointCount, simplified: data.simplifiedPointCount });
      })
      .catch((err) => setError(err.response?.data?.error?.message || 'Could not load this run'))
      .finally(() => setLoading(false));
  }, [id, simplify]);

  if (error) {
    return (
      <div className="page">
        <div className="form-error">{error}</div>
        <Link to="/runs" className="btn btn-secondary">
          ← Back to my runs
        </Link>
      </div>
    );
  }
  if (!run) return <PageLoading />;

  const started = new Date(run.started_at);

  return (
    <div className="page">
      <Link to="/runs" className="back-link">
        ← My runs
      </Link>
      <div className="page-header">
        <div>
          <h1>
            {started.toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'short',
            })}
          </h1>
          <p>
            Started at{' '}
            {started.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Distance</div>
          <div className="stat-value">{formatDistance(Number(run.distance_meters))}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Time</div>
          <div className="stat-value">{formatDuration(run.duration_seconds)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Avg pace</div>
          <div className="stat-value">{formatPace(run.avg_pace_sec_per_km)}</div>
        </div>
      </div>

      <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
        <RouteMap points={points} />
      </div>

      <div className="simplify-toggle">
        <label>
          <input
            type="checkbox"
            checked={simplify}
            onChange={(e) => setSimplify(e.target.checked)}
          />
          Simplify route
        </label>
        <span className="muted">
          {simplify
            ? `Douglas–Peucker keeps ${counts.simplified} of ${counts.raw} GPS points`
            : `All ${counts.raw} raw GPS points`}
        </span>
      </div>
    </div>
  );
};
