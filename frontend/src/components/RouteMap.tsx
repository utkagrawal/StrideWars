import React, { useEffect } from 'react';
import { CircleMarker, MapContainer, Polygon, Polyline, TileLayer, useMap } from 'react-leaflet';
import { LatLngBounds, LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TILE_ATTRIBUTION, TILE_URL } from '../utils/mapTiles';
import { ROUTE_COLOR, YOU_COLOR } from '../utils/colors';

interface Props {
  points: { lat: number; lng: number }[];
  /** Fill the loop to show the area it enclosed. */
  showArea?: boolean;
}

const FitBounds = ({ positions }: { positions: LatLngTuple[] }) => {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) map.fitBounds(new LatLngBounds(positions), { padding: [40, 40] });
  }, [map, positions]);
  return null;
};

/** A single run drawn on a dark map: the loop, its enclosed area, and the start point. */
export const RouteMap = ({ points, showArea = true }: Props) => {
  if (points.length === 0) {
    return (
      <div className="route-map center-fill muted" style={{ minHeight: 0 }}>
        No GPS data for this run.
      </div>
    );
  }

  const positions: LatLngTuple[] = points.map((p) => [p.lat, p.lng]);

  return (
    <div className="route-map">
      <MapContainer center={positions[0]} zoom={15} scrollWheelZoom={false}>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
        {showArea && (
          <Polygon
            positions={positions}
            pathOptions={{ stroke: false, fillColor: YOU_COLOR, fillOpacity: 0.35 }}
          />
        )}
        <Polyline positions={positions} pathOptions={{ color: ROUTE_COLOR, weight: 4 }} />
        <CircleMarker
          center={positions[0]}
          radius={7}
          pathOptions={{ color: ROUTE_COLOR, weight: 3, fillColor: YOU_COLOR, fillOpacity: 1 }}
        />
        <FitBounds positions={positions} />
      </MapContainer>
    </div>
  );
};
