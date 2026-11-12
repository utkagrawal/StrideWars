import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFeed, FeedItem } from '../api/social';
import { useAuth } from '../hooks/useAuth';
import { colorForRunner } from '../utils/colors';
import { formatDistance, formatDuration, timeAgo } from '../utils/format';
import { Avatar, EmptyState, PageLoading } from '../components/ui';

export const Feed = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (cursor?: string) => {
    setLoading(true);
    try {
      const data = await getFeed(cursor, 20);
      setItems((prev) => (cursor ? [...prev, ...data.items] : data.items));
      setNextCursor(data.nextCursor);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load the feed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Feed</h1>
          <p>Runs from you and the runners you follow.</p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading && items.length === 0 ? (
        <PageLoading />
      ) : items.length === 0 ? (
        <EmptyState title="The map is quiet" actionTo="/leaderboards" actionLabel="Find runners">
          Follow other runners from their profile to see their runs here.
        </EmptyState>
      ) : (
        <div className="list">
          {items.map((item) => {
            const isMe = item.userId === user?.id;
            const body = (
              <>
                <Avatar
                  name={item.username}
                  color={colorForRunner(item.username, isMe)}
                  isYou={isMe}
                />
                <div className="list-item-body">
                  <div className="list-item-title">
                    <strong>{isMe ? 'You' : item.username}</strong> ran{' '}
                    {formatDistance(item.distanceMeters)} in {formatDuration(item.durationSeconds)}
                  </div>
                  <div className="list-item-meta">{timeAgo(item.timestamp)}</div>
                </div>
                {item.cellsClaimed > 0 ? (
                  <span className={`list-figure${isMe ? ' you' : ''}`}>
                    +{item.cellsClaimed} cells
                  </span>
                ) : (
                  <span className="list-figure none">no ground</span>
                )}
              </>
            );
            // Run details are private to their owner, so only your own runs link through.
            return isMe ? (
              <Link key={item.itemId} to={`/runs/${item.itemId}`} className="list-item">
                {body}
              </Link>
            ) : (
              <Link key={item.itemId} to={`/profile/${item.userId}`} className="list-item">
                {body}
              </Link>
            );
          })}
        </div>
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
