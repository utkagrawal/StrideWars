import { api } from './axios';

export interface Territory {
  geohash: string;
  owner_id: string;
  captured_run_id: string | null;
  owner_username: string;
  captured_at: string; // ISO date string
  center_lat: number;
  center_lng: number;
}

export const getTerritoriesInBbox = async (
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number
): Promise<{ territories: Territory[], runPolygons: Record<string, {lat: number, lng: number}[]> }> => {
  const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;
  const { data } = await api.get(`/territories?bbox=${bbox}`);
  return data;
};

export const getTerritoryByGeohash = async (geohash: string): Promise<{ territory: Territory }> => {
  const { data } = await api.get(`/territories/${geohash}`);
  return data;
};

export const getTerritoryHistory = async (geohash: string) => {
  const { data } = await api.get(`/territories/history/${geohash}`);
  return data.captures;
};

export const getMyTerritories = async (): Promise<Territory[]> => {
  const { data } = await api.get(`/territories/mine`);
  return data.territories;
};
