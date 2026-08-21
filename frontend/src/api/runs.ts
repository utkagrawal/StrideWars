import { api } from './axios';

export interface PointInput {
  lat: number;
  lng: number;
  recordedAt: string;
}

export interface Run {
  id: string;
  user_id: string;
  client_run_id: string;
  distance_meters: number;
  duration_seconds: number;
  avg_pace_sec_per_km: number | null;
  started_at: string;
  created_at: string;
}

export interface RunPoint {
  id: string;
  run_id: string;
  seq: number;
  lat: number;
  lng: number;
  recorded_at: string;
}

export const createRun = async (
  clientRunId: string,
  startedAt: string,
  points: PointInput[]
): Promise<{ run: Run; capturedTerritories: { geohash: string; previousOwnerId: string | null }[]; enclosedAreaSquareMeters: number }> => {
  const { data } = await api.post('/runs', {
    clientRunId,
    startedAt,
    points,
  });
  return data;
};

export const getRuns = async (cursor?: string, limit: number = 20): Promise<{ runs: Run[]; nextCursor: string | null }> => {
  const params = new URLSearchParams();
  if (cursor) params.append('cursor', cursor);
  params.append('limit', limit.toString());

  const { data } = await api.get(`/runs?${params.toString()}`);
  return data;
};

export const getRunById = async (id: string, simplify: boolean = true): Promise<{ run: Run; points: RunPoint[]; pointCount: number; simplifiedPointCount: number }> => {
  const { data } = await api.get(`/runs/${id}?simplify=${simplify}`);
  return data;
};

export const generateRoadLoop = async (lat: number, lng: number): Promise<PointInput[]> => {
  const { data } = await api.get(`/runs/generate-loop?lat=${lat}&lng=${lng}`);
  return data.points;
};
