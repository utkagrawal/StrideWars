import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getGlobalLeaderboard,
  getRegionalLeaderboard,
  getUserGlobalRank,
  LeaderboardEntry,
} from '../api/leaderboards';
import { getMyTerritories } from '../api/territories';
import { useAuth } from '../hooks/useAuth';
import { formatArea } from '../utils/format';
import { colorForRunner } from '../utils/colors';
import { Avatar, EmptyState, PageLoading } from '../components/ui';

type Tab = 'global' | 'regional';

export const Leaderboards = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('global');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [me, setMe] = useState<{ rank: number | null; areaSquareMeters: number } | null>(null);
  const [regionName, setRegionName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const load = async () => {
      if (tab === 'global') {
        const [board, mine] = await Promise.all([getGlobalLeaderboard(50), getUserGlobalRank()]);
        if (cancelled) return;
        setEntries(board.entries);
        setMe(mine);
        return;
      }

      // "Your region" = the ~150 km geohash region around your most recent ground.
      const mine = await getMyTerritories();
      if (mine.length === 0) {
        if (!cancelled) {
          setEntries([]);
          setRegionName(null);
        }
        return;
      }
      const latest = mine.reduce((a, b) => (a.captured_at > b.captured_at ? a : b));
      const data = await getRegionalLeaderboard({
        lat: Number(latest.center_lat),
        lng: Number(latest.center_lng),
        limit: 50,
      });
      if (cancelled) return;
      setEntries(data.entries);
      setRegionName(
        data.regionName && data.regionName !== 'Unknown Region' ? data.regionName : null
      );
    };

    load()
      .catch(() => !cancelled && setError('Could not load the leaderboard.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const top = entries[0]?.areaSquareMeters || 1;
  const nextUp = me?.rank && me.rank > 1 ? entries.find((e) => e.rank === me.rank! - 1) : undefined;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Leaderboard</h1>
          <p>Ranked by the ground you own right now. Lose cells and you drop.</p>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'global'}
          className={tab === 'global' ? 'active' : ''}
          onClick={() => setTab('global')}
        >
          Everyone
        </button>
        <button
          role="tab"
          aria-selected={tab === 'regional'}
          className={tab === 'regional' ? 'active' : ''}
          onClick={() => setTab('regional')}
        >
          {regionName && tab === 'regional' ? regionName : 'Your region'}
        </button>
      </div>

      {tab === 'global' && me && (
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">Your rank</div>
            <div className="stat-value">{me.rank ?? '–'}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Your ground</div>
            <div className="stat-value">{formatArea(me.areaSquareMeters)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Next to beat</div>
            <div className="stat-value">{nextUp ? nextUp.username : '–'}</div>
            {nextUp ? (
              <div className="stat-hint">
                {formatArea(nextUp.areaSquareMeters - me.areaSquareMeters)} ahead of you
              </div>
            ) : (
              me.rank === 1 && <div className="stat-hint">You&apos;re in front</div>
            )}
          </div>
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <PageLoading />
      ) : entries.length === 0 ? (
        <EmptyState title="No ground claimed here yet" actionTo="/" actionLabel="Run a loop">
          Be the first to run a loop in this region.
        </EmptyState>
      ) : (
        <table className="lb">
          <thead>
            <tr>
              <th>#</th>
              <th>Runner</th>
              <th className="bar" aria-hidden="true" />
              <th className="area">Ground</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const isMe = e.userId === user?.id;
              const color = colorForRunner(e.username, isMe);
              return (
                <tr key={e.userId} className={isMe ? 'me' : undefined}>
                  <td className="rank">{e.rank}</td>
                  <td>
                    <div className="player">
                      <Avatar name={e.username} color={color} size={30} isYou={isMe} />
                      <Link to={isMe ? '/profile' : `/profile/${e.userId}`}>{e.username}</Link>
                      {isMe && <span className="you-tag">you</span>}
                    </div>
                  </td>
                  <td className="bar" aria-hidden="true">
                    <span
                      style={{ width: `${(e.areaSquareMeters / top) * 100}%`, background: color }}
                    />
                  </td>
                  <td className="area">{formatArea(e.areaSquareMeters)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};
