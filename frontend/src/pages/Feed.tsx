import React, { useEffect, useState } from 'react';
import { getFeed, FeedItem } from '../api/social';

export const Feed = () => {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  useEffect(() => {
    fetchFeed();
  }, []);

  const fetchFeed = async (cursor?: string) => {
    try {
      setLoading(true);
      const data = await getFeed(cursor, 20);
      if (cursor) {
        setItems(prev => [...prev, ...data.items]);
      } else {
        setItems(data.items);
      }
      setNextCursor(data.nextCursor);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load feed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h2 style={{ marginBottom: '2rem' }}>Activity Feed</h2>
      {error && <div className="error-message">{error}</div>}
      
      {items.length === 0 && !loading && (
        <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: '2rem' }}>
          The map is quiet right now. Follow some runners to see who's taking ground.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {items.map(item => (
          <div key={`${item.type}-${item.itemId}`} style={{ background: 'var(--color-bg-surface)', padding: '1rem', borderRadius: 'var(--radius-md)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                <a href={`/profile/${item.userId}`} style={{ color: 'white', textDecoration: 'none' }}>
                  {item.username}
                </a>
              </div>
              {item.type === 'run' ? (
                <div>Completed a loop covering {item.distanceMeters}m in {item.durationSeconds}s</div>
              ) : (
                <div>Claimed ground: <span style={{ fontFamily: 'monospace', color: 'var(--color-brand-primary)' }}>{item.geohash}</span></div>
              )}
            </div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
              {new Date(item.timestamp).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>

      {nextCursor && (
        <button 
          onClick={() => fetchFeed(nextCursor)} 
          disabled={loading}
          style={{ width: '100%', marginTop: '2rem', background: 'transparent', border: '1px solid var(--color-brand-primary)' }}
        >
          {loading ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
};
