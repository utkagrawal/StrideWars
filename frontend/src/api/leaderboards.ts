import { api } from './axios';

export interface LeaderboardEntry {
  userId: string;
  username: string;
  areaSquareMeters: number;
  rank: number;
}

export const getGlobalLeaderboard = async (limit: number = 50): Promise<{ entries: LeaderboardEntry[] }> => {
  const { data } = await api.get(`/leaderboards/global?limit=${limit}`);
  return data;
};

export async function getUserGlobalRank(): Promise<{ rank: number | null; areaSquareMeters: number }> {
  const response = await api.get('/leaderboards/global/me');
  return response.data;
};

export const getRegionalLeaderboard = async (params: { geohashPrefix?: string, lat?: number, lng?: number, limit?: number }): Promise<{ entries: LeaderboardEntry[], regionName?: string, prefix?: string }> => {
  const query = new URLSearchParams();
  if (params.geohashPrefix) query.append('geohashPrefix', params.geohashPrefix);
  if (params.lat !== undefined) query.append('lat', params.lat.toString());
  if (params.lng !== undefined) query.append('lng', params.lng.toString());
  if (params.limit !== undefined) query.append('limit', params.limit.toString());
  
  const { data } = await api.get(`/leaderboards/region?${query.toString()}`);
  return data;
};
