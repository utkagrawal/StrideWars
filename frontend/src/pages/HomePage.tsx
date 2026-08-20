import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getRuns, Run } from '../api/runs';
import { getMyTerritories } from '../api/territories';
import { getUserGlobalRank } from '../api/leaderboards';
import { getUnreadCount } from '../api/notifications';
import { useToast } from '../hooks/useToast';

export default function HomePage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [runs, setRuns] = useState<Run[]>([]);
  const [territoryCount, setTerritoryCount] = useState<number>(0);
  const [rank, setRank] = useState<number | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [
          runsData,
          territoriesData,
          rankData,
          notificationsData
        ] = await Promise.all([
          getRuns(undefined, 5),
          getMyTerritories(),
          getUserGlobalRank(),
          getUnreadCount()
        ]);

        setRuns(runsData.runs);
        setTerritoryCount(territoriesData.length);
        setRank(rankData.rank);
        setUnreadNotifications(notificationsData.count);
      } catch (err: any) {
        addToast(err.response?.data?.error?.message || 'Failed to load dashboard', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [addToast]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Dashboard...</div>;
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h2 style={{ marginBottom: '2rem' }}>Welcome back, {user?.username}!</h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1.5rem',
        marginBottom: '3rem'
      }}>
        <div style={{ background: 'var(--color-bg-surface)', padding: '1.5rem', borderRadius: '8px' }}>
          <h3 style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Global Rank</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{rank ? `#${rank}` : 'Unranked'}</div>
          <Link to="/leaderboards" style={{ color: 'var(--color-brand-primary)', fontSize: '0.85rem' }}>View Leaderboards →</Link>
        </div>

        <div style={{ background: 'var(--color-bg-surface)', padding: '1.5rem', borderRadius: '8px' }}>
          <h3 style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Territories Owned</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{territoryCount}</div>
          <Link to="/territories" style={{ color: 'var(--color-brand-primary)', fontSize: '0.85rem' }}>View Map →</Link>
        </div>

        <div style={{ background: 'var(--color-bg-surface)', padding: '1.5rem', borderRadius: '8px' }}>
          <h3 style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Recent Runs</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{runs.length}</div>
          <Link to="/runs" style={{ color: 'var(--color-brand-primary)', fontSize: '0.85rem' }}>View History →</Link>
        </div>

        <div style={{ background: 'var(--color-bg-surface)', padding: '1.5rem', borderRadius: '8px' }}>
          <h3 style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Unread Alerts</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{unreadNotifications}</div>
          <Link to="/notifications" style={{ color: 'var(--color-brand-primary)', fontSize: '0.85rem' }}>View Notifications →</Link>
        </div>
      </div>

      <div>
        <h3>Recent Activity</h3>
        {runs.length === 0 ? (
          <div style={{ background: 'var(--color-bg-surface)', padding: '2rem', textAlign: 'center', borderRadius: '8px', marginTop: '1rem' }}>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>You haven't recorded any runs yet.</p>
            <Link to="/runs/new" style={{ padding: '0.5rem 1rem', background: 'var(--color-brand-primary)', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
              Record First Run
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            {runs.map(run => (
              <div key={run.id} style={{ background: 'var(--color-bg-surface)', padding: '1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 'bold' }}>{(run.distance_meters / 1000).toFixed(2)} km in {Math.floor(run.duration_seconds / 60)}m {run.duration_seconds % 60}s</div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{new Date(run.started_at).toLocaleDateString()}</div>
                </div>
                <Link to={`/runs/${run.id}`} style={{ color: 'var(--color-brand-primary)', textDecoration: 'none' }}>Details</Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
