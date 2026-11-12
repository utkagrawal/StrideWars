/** "You", everywhere: the lime fill on the map, your row on the leaderboard, your avatar. */
export const YOU_COLOR = '#a3d900';

/**
 * Rival colours: mid-tone and saturated so they read on a light map,
 * and none of them close to the lime used for "you".
 */
const RIVAL_COLORS = [
  '#e4572e', // red-orange
  '#2f80ed', // blue
  '#8e44ad', // purple
  '#d81b60', // raspberry
  '#f2a900', // amber
  '#00897b', // teal
  '#795548', // brown
  '#3949ab', // indigo
];

/**
 * Stable colour per runner, derived from their username, so the same runner is the
 * same colour on the map, leaderboard, feed and alerts (and across re-seeds).
 */
export function colorForRunner(username: string, isYou = false): string {
  if (isYou) return YOU_COLOR;
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 73 + username.charCodeAt(i)) | 0;
  }
  return RIVAL_COLORS[Math.abs(hash) % RIVAL_COLORS.length];
}

/** Routes and runner markers are drawn in ink so they read on any territory colour. */
export const ROUTE_COLOR = '#141414';
