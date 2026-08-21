import React, { useEffect, useState, Component, ErrorInfo, ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getRunById, Run, RunPoint } from '../api/runs';
import { Map } from '../components/Map';

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{ padding: '2rem', background: '#330000', color: '#ffaaaa', borderRadius: '8px' }}
        >
          <h3>React Rendering Error!</h3>
          <pre style={{ overflow: 'auto', padding: '1rem', background: '#000' }}>
            {this.state.error?.toString()}
            {'\n'}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export const RunDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<Run | null>(null);
  const [points, setPoints] = useState<RunPoint[]>([]);
  const [pointCount, setPointCount] = useState(0);
  const [simplifiedCount, setSimplifiedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [simplify, setSimplify] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchRun = async () => {
      try {
        setLoading(true);
        const data = await getRunById(id, simplify);
        setRun(data.run);
        setPoints(data.points);
        setPointCount(data.pointCount);
        setSimplifiedCount(data.simplifiedPointCount);
      } catch (err: any) {
        setError(err.response?.data?.error?.message || 'Failed to load run details');
      } finally {
        setLoading(false);
      }
    };

    fetchRun();
  }, [id, simplify]);

  if (loading && !run) return <div className="container">Loading...</div>;
  if (error)
    return (
      <div className="container">
        <div className="error-message">{error}</div>
      </div>
    );
  if (!run) return <div className="container">Run not found</div>;

  const formatDistance = (meters: number) => (meters / 1000).toFixed(2) + ' km';
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s}s`;
  };

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
      <Link
        to="/runs"
        style={{
          color: 'var(--color-brand-primary)',
          marginBottom: '1rem',
          display: 'inline-block',
        }}
      >
        &larr; Back to History
      </Link>

      <h2>Run Details</h2>
      <div
        className="profile-info"
        style={{ display: 'flex', gap: '3rem', flexWrap: 'wrap', marginTop: '1rem' }}
      >
        <div>
          <p>
            <strong>Started At</strong>
          </p>
          <p>{new Date(run.started_at).toLocaleString()}</p>
        </div>
        <div>
          <p>
            <strong>Distance</strong>
          </p>
          <p>{formatDistance(run.distance_meters)}</p>
        </div>
        <div>
          <p>
            <strong>Duration</strong>
          </p>
          <p>{formatDuration(run.duration_seconds)}</p>
        </div>
        <div>
          <p>
            <strong>Avg Pace</strong>
          </p>
          <p>
            {run.avg_pace_sec_per_km ? `${formatDuration(run.avg_pace_sec_per_km)} / km` : 'N/A'}
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '2rem',
          marginBottom: '1rem',
        }}
      >
        <h3>Map</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={simplify}
            onChange={(e) => setSimplify(e.target.checked)}
          />
          Simplify Route (DP Algorithm)
        </label>
      </div>

      <p style={{ marginBottom: '1rem', color: 'var(--color-text-secondary)' }}>
        {simplify
          ? `Showing ${simplifiedCount} simplified points (reduced from ${pointCount} raw points)`
          : `Showing all ${pointCount} raw points`}
      </p>

      <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
        <ErrorBoundary>
          <Map points={points} />
        </ErrorBoundary>
      </div>
    </div>
  );
};
