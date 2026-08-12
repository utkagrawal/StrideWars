/**
 * API client placeholder.
 * Axios or fetch wrappers for each domain will be added per phase.
 *
 * Phase 1: health check utility only.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export async function checkHealth(): Promise<{ status: string }> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json() as Promise<{ status: string }>;
}
