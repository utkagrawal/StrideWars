import { api } from './axios';

export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  payload: any;
  readAt: string | null;
  createdAt: string;
}

export const getNotifications = async (
  cursor?: string,
  limit: number = 20
): Promise<{ notifications: NotificationItem[]; nextCursor: string | null }> => {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (cursor) {
    params.append('cursor', cursor);
  }
  const { data } = await api.get(`/notifications?${params.toString()}`);
  return data;
};

export const markAsRead = async (id: string): Promise<{ notification: NotificationItem }> => {
  const { data } = await api.patch(`/notifications/${id}/read`);
  return data;
};

export const getUnreadCount = async (): Promise<{ count: number }> => {
  const { data } = await api.get('/notifications/unread-count');
  return data;
};
