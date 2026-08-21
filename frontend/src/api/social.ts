import { api } from './axios';

export interface FeedItem {
  type: 'run' | 'capture';
  itemId: string;
  userId: string;
  username: string;
  geohash: string | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  timestamp: string;
}

export const followUser = async (userId: string) => {
  const { data } = await api.post(`/social/follow/${userId}`);
  return data;
};

export const unfollowUser = async (userId: string) => {
  const { data } = await api.delete(`/social/follow/${userId}`);
  return data;
};

export const getFollowers = async (
  userId: string
): Promise<{ users: { id: string; username: string }[] }> => {
  const { data } = await api.get(`/social/followers/${userId}`);
  return data;
};

export const getFollowing = async (
  userId: string
): Promise<{ users: { id: string; username: string }[] }> => {
  const { data } = await api.get(`/social/following/${userId}`);
  return data;
};

export const getFeed = async (
  cursor?: string,
  limit: number = 20
): Promise<{ items: FeedItem[]; nextCursor: string | null }> => {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (cursor) {
    params.append('cursor', cursor);
  }
  const { data } = await api.get(`/social/feed?${params.toString()}`);
  return data;
};
