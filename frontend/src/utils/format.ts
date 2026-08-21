/**
 * Formats an area in square meters to a human-readable string.
 * Under 10,000 m²: formats as "X,XXX m²"
 * 10,000 m² and above: formats as "X.XX km²"
 */
export function formatArea(sqMeters: number): string {
  if (sqMeters == null) return '0 m²';
  
  if (sqMeters < 10000) {
    return `${Math.round(sqMeters).toLocaleString('en-US')} m²`;
  } else {
    const sqKm = sqMeters / 1_000_000;
    return `${sqKm.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km²`;
  }
}
