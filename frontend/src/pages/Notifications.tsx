import React, { useEffect, useState } from 'react';
import { getNotifications, markAsRead, NotificationItem } from '../api/notifications';

export const Notifications = () => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async (cursor?: string) => {
    try {
      setLoading(true);
      const data = await getNotifications(cursor, 20);
      if (cursor) {
        setItems(prev => [...prev, ...data.notifications]);
      } else {
        setItems(data.notifications);
      }
      setNextCursor(data.nextCursor);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      const { notification } = await markAsRead(id);
      setItems(prev => prev.map(item => item.id === id ? notification : item));
    } catch (err) {
      console.error(err);
    }
  };

  const renderPayload = (type: string, payload: any) => {
    if (type === 'territory_lost') {
      return (
        <div>
          <strong>Territory Lost!</strong><br />
          {payload.message}
        </div>
      );
    }
    return <div>Unknown notification type</div>;
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h2 style={{ marginBottom: '2rem' }}>Notifications</h2>
      {error && <div className="error-message">{error}</div>}
      
      {items.length === 0 && !loading && (
        <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: '2rem' }}>
          No notifications yet.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {items.map(item => (
          <div 
            key={item.id} 
            style={{ 
              background: item.readAt ? 'var(--color-bg-surface)' : 'rgba(74, 222, 128, 0.1)', 
              border: item.readAt ? '1px solid transparent' : '1px solid var(--color-brand-primary)',
              padding: '1rem', 
              borderRadius: 'var(--radius-md)', 
              display: 'flex', 
              gap: '1rem', 
              alignItems: 'center' 
            }}
          >
            <div style={{ flex: 1 }}>
              {renderPayload(item.type, item.payload)}
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                {new Date(item.createdAt).toLocaleString()}
              </div>
            </div>
            {!item.readAt && (
              <button 
                onClick={() => handleMarkAsRead(item.id)}
                style={{ padding: '0.5rem', background: 'var(--color-brand-primary)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'white', cursor: 'pointer' }}
              >
                Mark Read
              </button>
            )}
          </div>
        ))}
      </div>

      {nextCursor && (
        <button 
          onClick={() => fetchNotifications(nextCursor)} 
          disabled={loading}
          style={{ width: '100%', marginTop: '2rem', background: 'transparent', border: '1px solid var(--color-brand-primary)', padding: '1rem', color: 'white' }}
        >
          {loading ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
};
