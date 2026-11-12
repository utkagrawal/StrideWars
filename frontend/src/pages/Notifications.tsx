import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getNotifications, markAsRead, NotificationItem } from '../api/notifications';
import { colorForRunner } from '../utils/colors';
import { timeAgo } from '../utils/format';
import { Avatar, EmptyState, PageLoading } from '../components/ui';

export const Notifications = () => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = async (cursor?: string) => {
    setLoading(true);
    try {
      const data = await getNotifications(cursor, 20);
      setItems((prev) => (cursor ? [...prev, ...data.notifications] : data.notifications));
      setNextCursor(data.nextCursor);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const open = async (item: NotificationItem) => {
    if (!item.readAt) {
      try {
        const { notification } = await markAsRead(item.id);
        setItems((prev) => prev.map((n) => (n.id === item.id ? notification : n)));
      } catch {
        /* non-critical */
      }
    }
    navigate('/'); // back to the map to win it back
  };

  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Alerts</h1>
          <p>
            {unread > 0
              ? `${unread} new since you last looked.`
              : 'Every time a rival takes your ground, you hear about it here.'}
          </p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading && items.length === 0 ? (
        <PageLoading />
      ) : items.length === 0 ? (
        <EmptyState title="Your territory is secure">No one has taken your ground. Yet.</EmptyState>
      ) : (
        <div className="list">
          {items.map((item) => {
            const p = item.payload;
            const who = p.lostToUsername ?? 'A rival';
            return (
              <button
                key={item.id}
                className={`list-item${item.readAt ? '' : ' unread'}`}
                onClick={() => open(item)}
              >
                <Avatar name={who} color={colorForRunner(who)} />
                <div className="list-item-body">
                  <div className="list-item-title">
                    <strong>{who}</strong> took {p.cellsLost ?? 1}{' '}
                    {(p.cellsLost ?? 1) === 1 ? 'cell' : 'cells'} of your ground
                  </div>
                  <div className="list-item-meta">
                    {timeAgo(item.createdAt)} · tap to win it back
                  </div>
                </div>
              </button>
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

      <p className="muted" style={{ marginTop: '1.5rem', fontSize: '0.85rem' }}>
        Alerts are created by a background worker after each capture commits.{' '}
        <Link to="/feed" style={{ textDecoration: 'underline' }}>
          See the feed
        </Link>
      </p>
    </div>
  );
};
