import React, { useEffect, useState } from 'react';
import {
  getGlobalLeaderboard,
  getUserGlobalRank,
  getRegionalLeaderboard,
  LeaderboardEntry,
} from '../api/leaderboards';
import { useAuth } from '../hooks/useAuth';
import { formatArea } from '../utils/format';

export const Leaderboards = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'global' | 'regional'>('global');
  const [globalEntries, setGlobalEntries] = useState<LeaderboardEntry[]>([]);
  const [regionalEntries, setRegionalEntries] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<{
    rank: number | null;
    areaSquareMeters: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [regionName, setRegionName] = useState<string | null>(null);

  // SF prefix for demo
  const DEMO_PREFIX = '9q8';

  useEffect(() => {
    fetchLeaderboards();
  }, [activeTab]);

  const fetchLeaderboards = async () => {
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'global') {
        const [globalData, rankData] = await Promise.all([
          getGlobalLeaderboard(50),
          getUserGlobalRank(),
        ]);
        setGlobalEntries(globalData.entries);
        setUserRank(rankData);
      } else {
        let lat: number | undefined;
        let lng: number | undefined;

        if (navigator.geolocation) {
          try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
          } catch (e) {
            console.warn('Geolocation failed for leaderboard:', e);
          }
        }

        const params: any = { limit: 50 };
        if (lat !== undefined && lng !== undefined) {
          params.lat = lat;
          params.lng = lng;
        } else {
          params.geohashPrefix = DEMO_PREFIX;
        }

        const regionalData = await getRegionalLeaderboard(params);
        setRegionalEntries(regionalData.entries);
        setRegionName(
          regionalData.regionName || (lat === undefined ? 'Unavailable' : 'Unknown Region')
        );
      }
    } catch (err) {
      setError('Failed to fetch leaderboard data');
    } finally {
      setLoading(false);
    }
  };

  const renderTable = (entries: LeaderboardEntry[]) => (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Rank</th>
          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Player</th>
          <th style={{ textAlign: 'right', padding: '0.5rem' }}>Area Claimed</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr
            key={entry.userId}
            style={{
              borderBottom: '1px solid var(--color-bg-elevated)',
              background: entry.userId === user?.id ? 'rgba(74, 222, 128, 0.1)' : 'transparent',
              fontWeight: entry.userId === user?.id ? 'bold' : 'normal',
            }}
          >
            <td style={{ padding: '0.75rem 0.5rem' }}>#{entry.rank}</td>
            <td style={{ padding: '0.75rem 0.5rem' }}>
              <a
                href={`/profile/${entry.userId}`}
                style={{ color: 'white', textDecoration: 'none' }}
              >
                {entry.username}
              </a>
              {entry.userId === user?.id && (
                <span style={{ marginLeft: '0.5rem', color: 'var(--color-brand-primary)' }}>
                  (You)
                </span>
              )}
            </td>
            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
              {formatArea(entry.areaSquareMeters)}
            </td>
          </tr>
        ))}
        {entries.length === 0 && (
          <tr>
            <td
              colSpan={3}
              style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}
            >
              No ground claimed yet. Claim your first piece of the map today!
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );

  let targetDelta = null;
  if (userRank && userRank.rank && userRank.rank > 1) {
    const target = globalEntries.find((e) => e.rank === userRank.rank! - 1);
    if (target) {
      targetDelta = {
        rank: target.rank,
        diff: target.areaSquareMeters - userRank.areaSquareMeters,
      };
    }
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h2 style={{ marginBottom: '2rem' }}>Leaderboards</h2>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <button
          onClick={() => setActiveTab('global')}
          style={{
            background:
              activeTab === 'global' ? 'var(--color-brand-primary)' : 'var(--color-bg-surface)',
          }}
        >
          Global
        </button>
        <button
          onClick={() => setActiveTab('regional')}
          style={{
            background:
              activeTab === 'regional' ? 'var(--color-brand-primary)' : 'var(--color-bg-surface)',
          }}
        >
          Regional {regionName ? `(${regionName})` : ''}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {activeTab === 'global' && userRank && (
        <div
          style={{
            background: 'var(--color-bg-elevated)',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '2rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              Your Global Rank
            </h3>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              {userRank.rank ? `#${userRank.rank}` : 'Unranked'}
            </div>
            {targetDelta && (
              <div
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--color-brand-primary)',
                  marginTop: '0.25rem',
                }}
              >
                Only {formatArea(targetDelta.diff)} to catch #{targetDelta.rank}!
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <h3 style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              Your Ground
            </h3>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              {formatArea(userRank.areaSquareMeters)}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading rankings...</p>
      ) : (
        <div
          style={{
            background: 'var(--color-bg-surface)',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {activeTab === 'global' ? renderTable(globalEntries) : renderTable(regionalEntries)}
        </div>
      )}
    </div>
  );
};
