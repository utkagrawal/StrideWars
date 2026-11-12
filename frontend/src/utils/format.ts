/**
 * Formats an area in square meters to a human-readable string.
 * Under 10,000 m²: "X,XXX m²"; 10,000 m² and above: "X.XX km²".
 */
export function formatArea(sqMeters: number): string {
  if (sqMeters == null) return '0 m²';

  if (sqMeters < 10000) {
    return `${Math.round(sqMeters).toLocaleString('en-US')} m²`;
  }
  const sqKm = sqMeters / 1_000_000;
  return `${sqKm.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km²`;
}

/** 1234.5 → "1.23 km", 640 → "640 m" */
export function formatDistance(meters: number): string {
  const m = Number(meters) || 0;
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

/** 754 → "12:34", 3725 → "1:02:05" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Pace in seconds per km → "5:30 /km" */
export function formatPace(secPerKm: number | string | null | undefined): string {
  const v = Number(secPerKm);
  if (!v || !isFinite(v)) return '–';
  return `${formatDuration(v)} /km`;
}

/** ISO timestamp → "just now", "5 min ago", "3 h ago", "2 days ago", or a date. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const diffSec = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (diffSec < 45) return 'just now';
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
