import { api } from './axios';

export interface LeaderboardEntry {
  userId: string;
  username: string;
  territoryCount: number;
  rank: number;
}

export const getGlobalLeaderboard = async (limit: number = 50): Promise<{ entries: LeaderboardEntry[] }> => {
  const { data } = await api.get(`/leaderboards/global?limit=${limit}`);
  return data;
};

export const getUserGlobalRank = async (): Promise<{ rank: number | null; territoryCount: number }> => {
  const { data } = await api.get('/leaderboards/global/me');
  return data;
};

export const getRegionalLeaderboard = async (geohashPrefix: string, limit: number = 50): Promise<{ entries: LeaderboardEntry[] }> => {
  const { data } = await api.get(`/leaderboards/region?geohashPrefix=${geohashPrefix}&limit=${limit}`);
  return data;
};
