import { pool } from '../../config/db';

export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  payload: any;
  readAt: string | null;
  createdAt: string;
}

export async function getNotifications(
  userId: string,
  cursor?: string,
  limit: number = 20
): Promise<{ notifications: NotificationItem[]; nextCursor: string | null }> {
  const params: any[] = [userId];
  let cursorClause = '';

  if (cursor) {
    cursorClause = 'AND created_at < $2';
    params.push(cursor);
  }

  params.push(limit + 1); // For nextCursor
  const limitParamIndex = params.length;

  const { rows } = await pool.query(
    `SELECT * FROM notifications 
     WHERE user_id = $1 ${cursorClause} 
     ORDER BY created_at DESC 
     LIMIT $${limitParamIndex}`,
    params
  );

  let nextCursor: string | null = null;
  if (rows.length > limit) {
    nextCursor = rows[limit].created_at.toISOString();
    rows.pop();
  }

  const notifications = rows.map((row) => ({
    id: row.id.toString(),
    userId: row.user_id,
    type: row.type,
    payload: row.payload,
    readAt: row.read_at ? row.read_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  }));

  return { notifications, nextCursor };
}

export async function markAsRead(
  notificationId: string,
  userId: string
): Promise<NotificationItem | null> {
  const { rows } = await pool.query(
    `UPDATE notifications 
     SET read_at = NOW() 
     WHERE id = $1 AND user_id = $2 
     RETURNING *`,
    [notificationId, userId]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id.toString(),
    userId: row.user_id,
    type: row.type,
    payload: row.payload,
    readAt: row.read_at ? row.read_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return parseInt(rows[0].count, 10);
}

export async function getNotificationOwner(id: string): Promise<{ user_id: string } | null> {
  const { rows } = await pool.query(`SELECT user_id FROM notifications WHERE id = $1`, [id]);
  return rows[0] || null;
}
