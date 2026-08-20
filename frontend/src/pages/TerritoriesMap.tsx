import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Rectangle, Tooltip, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import ngeohash from 'ngeohash';
import { getTerritoriesInBbox, Territory } from '../api/territories';
import { useAuth } from '../hooks/useAuth';

const GEOHASH_PRECISION = 7; // ~150m x 150m cells

const colorForUser = (userId: string, currentUserId: string | undefined) => {
  if (userId === currentUserId) return '#4ade80'; // brand green for self
  // simple stable color generation based on userId string
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = `hsl(${Math.abs(hash) % 360}, 70%, 50%)`;
  return color;
};

// Component to handle map events and fetch territories
const TerritoryGrid = ({ currentUserId }: { currentUserId?: string }) => {
  const [territories, setTerritories] = useState<Record<string, Territory>>({});
  const [gridCells, setGridCells] = useState<string[]>([]);
  
  const map = useMapEvents({
    moveend: () => fetchVisibleGrid(),
    zoomend: () => fetchVisibleGrid(),
  });

  const fetchVisibleGrid = async () => {
    const bounds = map.getBounds();
    const minLat = bounds.getSouth();
    const minLng = bounds.getWest();
    const maxLat = bounds.getNorth();
    const maxLng = bounds.getEast();

    // 1. Calculate the empty grid on the client side
    const visibleHashes = ngeohash.bboxes(minLat, minLng, maxLat, maxLng, GEOHASH_PRECISION);
    
    // Prevent rendering too many cells if zoomed out too far
    if (visibleHashes.length > 5000) {
      setGridCells([]);
      return;
    }
    
    setGridCells(visibleHashes);

    // 2. Fetch ownership data from backend
    try {
      const data = await getTerritoriesInBbox(minLat, minLng, maxLat, maxLng);
      const newTerritoryMap: Record<string, Territory> = {};
      data.territories.forEach(t => {
        newTerritoryMap[t.geohash] = t;
      });
      setTerritories(prev => ({ ...prev, ...newTerritoryMap }));
    } catch (err) {
      console.error('Failed to fetch territories', err);
    }
  };

  // Initial fetch on mount
  useEffect(() => {
    fetchVisibleGrid();
  }, [map]);

  // Render the grid
  return (
    <>
      {gridCells.map((geohash) => {
        const bbox = ngeohash.decode_bbox(geohash);
        const bounds: [[number, number], [number, number]] = [
          [bbox[0], bbox[1]], // minLat, minLng
          [bbox[2], bbox[3]], // maxLat, maxLng
        ];
        
        const territory = territories[geohash];
        const isOwned = !!territory;
        
        return (
          <Rectangle
            key={geohash}
            bounds={bounds}
            pathOptions={{
              color: isOwned ? colorForUser(territory.owner_id, currentUserId) : '#888',
              fillColor: isOwned ? colorForUser(territory.owner_id, currentUserId) : 'transparent',
              weight: 1,
              fillOpacity: isOwned ? 0.4 : 0.0,
            }}
          >
            {isOwned && (
              <Tooltip>
                Captured by: {territory.owner_username}<br />
                Date: {new Date(territory.captured_at).toLocaleDateString()}
              </Tooltip>
            )}
          </Rectangle>
        );
      })}
    </>
  );
};

export const TerritoriesMap = () => {
  const { user } = useAuth();
  // Start map at roughly center of SF
  const [center] = useState<[number, number]>([37.7749, -122.4194]);

  return (
    <div style={{ height: 'calc(100vh - 70px)', width: '100%', position: 'relative' }}>
      <MapContainer 
        center={center} 
        zoom={14} 
        style={{ height: '100%', width: '100%', zIndex: 1 }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <TerritoryGrid currentUserId={user?.id} />
      </MapContainer>
      
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        zIndex: 1000,
        background: 'var(--color-bg-elevated)',
        padding: '1rem',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
        pointerEvents: 'none'
      }}>
        <h3 style={{ marginBottom: '0.5rem', color: 'var(--color-text-primary)' }}>Territory Control</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
          Pan/zoom the map to load the global grid.
        </p>
      </div>
    </div>
  );
};
