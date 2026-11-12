/**
 * Basemap tiles. We use the free OpenStreetMap tiles (no API key needed) and darken
 * them with a CSS filter on the tile pane only (see `.leaflet-tile-pane` in index.css),
 * so territory colours drawn on top stay accurate.
 */
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
