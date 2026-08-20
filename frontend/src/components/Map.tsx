import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon, LatLngBounds, LatLngTuple } from 'leaflet';

// Fix Leaflet's default icon issue with React
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (Icon.Default.prototype as any)._getIconUrl;
Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface MapProps {
  points: { lat: number; lng: number }[];
}

// Helper component to auto-fit bounds
const AutoFitBounds = ({ points }: { points: { lat: number; lng: number }[] }) => {
  const map = useMap();
  
  useEffect(() => {
    if (points.length === 0) return;
    
    const bounds = new LatLngBounds(points.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [map, points]);

  return null;
};

export const Map: React.FC<MapProps> = ({ points }) => {
  if (points.length === 0) {
    return <div style={{ height: '400px', background: 'var(--color-bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No map data available</div>;
  }

  const positions: LatLngTuple[] = points.map(p => [p.lat, p.lng]);
  const startPos = positions[0];
  const endPos = positions[positions.length - 1];

  return (
    <div style={{ height: '400px', width: '100%', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      <MapContainer 
        center={startPos} 
        zoom={13} 
        style={{ height: '100%', width: '100%', zIndex: 1 }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        
        <Polyline positions={positions} color="var(--color-brand-primary)" weight={4} opacity={0.8} />
        
        <Marker position={startPos}>
          <Popup>Start</Popup>
        </Marker>
        
        {positions.length > 1 && (
          <Marker position={endPos}>
            <Popup>End</Popup>
          </Marker>
        )}
        
        <AutoFitBounds points={points} />
      </MapContainer>
    </div>
  );
};
