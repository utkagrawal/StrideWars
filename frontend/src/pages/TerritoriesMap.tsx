import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Rectangle,
  Tooltip,
  useMapEvents,
  Polyline,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import ngeohash from 'ngeohash';
import { getTerritoriesInBbox, Territory } from '../api/territories';
import { useAuth } from '../hooks/useAuth';
import { calculateTotalDistance, destinationPoint, calculateHaversineDistance } from '../utils/geo';
import { createRun, PointInput, getRuns, generateRoadLoop } from '../api/runs';
import { getMyTerritories } from '../api/territories';
import { getUserGlobalRank } from '../api/leaderboards';
import { getUnreadCount } from '../api/notifications';
import { useToast } from '../hooks/useToast';
import { Link } from 'react-router-dom';
import { formatArea } from '../utils/format';
const GEOHASH_PRECISION = 7; // ~150m x 150m cells

export const colorForUser = (userId: string, currentUserId: string | undefined) => {
  if (userId === currentUserId) return '#4ade80'; // brand green for self
  // simple stable color generation based on userId string
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = `hsl(${Math.abs(hash) % 360}, 70%, 50%)`;
  return color;
};

import { Polygon } from 'react-leaflet';
import { traceClusterPerimeter } from '../utils/geo';

// Component to handle map events and fetch territories
const TerritoryGrid = ({
  currentUserId,
  refreshTrigger,
  onVisibleOwnersChange,
}: {
  currentUserId?: string;
  refreshTrigger: number;
  onVisibleOwnersChange: (owners: Record<string, { username: string; count: number }>) => void;
}) => {
  const [territories, setTerritories] = useState<Record<string, Territory>>({});
  const [runPolygons, setRunPolygons] = useState<Record<string, { lat: number; lng: number }[]>>(
    {}
  );
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
      onVisibleOwnersChange({});
      return;
    }

    setGridCells(visibleHashes);

    // 2. Fetch ownership data from backend
    try {
      const data = await getTerritoriesInBbox(minLat, minLng, maxLat, maxLng);
      const newTerritoryMap: Record<string, Territory> = {};
      const ownerCounts: Record<string, { username: string; count: number }> = {};

      data.territories.forEach((t) => {
        newTerritoryMap[t.geohash] = t;
        if (!ownerCounts[t.owner_id]) {
          ownerCounts[t.owner_id] = { username: t.owner_username, count: 0 };
        }
        ownerCounts[t.owner_id].count++;
      });
      setTerritories((prev) => ({ ...prev, ...newTerritoryMap }));
      setRunPolygons((prev) => ({ ...prev, ...data.runPolygons }));
      onVisibleOwnersChange(ownerCounts);
    } catch (err) {
      console.error('Failed to fetch territories', err);
    }
  };

  // Initial fetch on mount
  useEffect(() => {
    fetchVisibleGrid();
  }, [map, refreshTrigger]);

  // Group visible cells by owner to render continuous polygons
  const cellsByOwner = useMemo(() => {
    const groups: Record<
      string,
      { username: string; capturedAt: string; hashes: string[]; runIds: Set<string> }
    > = {};
    for (const hash of gridCells) {
      const territory = territories[hash];
      if (territory) {
        if (!groups[territory.owner_id]) {
          groups[territory.owner_id] = {
            username: territory.owner_username,
            capturedAt: territory.captured_at,
            hashes: [],
            runIds: new Set(),
          };
        }
        groups[territory.owner_id].hashes.push(hash);
        if (territory.captured_run_id) {
          groups[territory.owner_id].runIds.add(territory.captured_run_id);
        }
      }
    }
    return groups;
  }, [gridCells, territories]);

  // Render the grouped polygons
  return (
    <>
      {Object.entries(cellsByOwner).map(([ownerId, data]) => {
        const rings: [number, number][][] = [];

        // 1. Run Path Polygons
        data.runIds.forEach((runId) => {
          if (runPolygons[runId]) {
            rings.push(runPolygons[runId].map((p) => [p.lat, p.lng] as [number, number]));
          }
        });

        // 2. Legacy Fallback
        const fallbackHashes = data.hashes.filter((hash) => {
          const t = territories[hash];
          return !t.captured_run_id || !runPolygons[t.captured_run_id];
        });

        if (fallbackHashes.length > 0) {
          const fallbackRings = traceClusterPerimeter(fallbackHashes);
          rings.push(...fallbackRings);
        }

        if (rings.length === 0) return null;
        const isSelf = ownerId === currentUserId;
        const color = colorForUser(ownerId, currentUserId);

        return (
          <Polygon
            key={ownerId}
            positions={rings}
            pathOptions={{
              color: color,
              fillColor: color,
              weight: 2,
              fillOpacity: isSelf ? 0.4 : 0.2,
            }}
          >
            <Tooltip>Captured by: {data.username}</Tooltip>
          </Polygon>
        );
      })}
    </>
  );
};

export const TerritoriesMap = () => {
  const { user } = useAuth();

  // IIT Guwahati default
  const [center, setCenter] = useState<[number, number]>([26.1878, 91.6916]);
  const [hasCentered, setHasCentered] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Initial Centering
  useEffect(() => {
    if (!hasCentered && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCenter([pos.coords.latitude, pos.coords.longitude]);
          setHasCentered(true);
        },
        (err) => {
          console.warn('Geolocation failed for centering, using IIT Guwahati default', err);
          setHasCentered(true);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else if (!hasCentered) {
      setHasCentered(true);
    }
  }, [hasCentered]);

  // Dashboard Stats State
  const [hudExpanded, setHudExpanded] = useState(true);
  const [stats, setStats] = useState<{
    runs: number;
    areaSquareMeters: number;
    rank: number | null;
    unread: number;
    hasLoaded: boolean;
  }>({ runs: 0, areaSquareMeters: 0, rank: null, unread: 0, hasLoaded: false });
  const [visibleOwners, setVisibleOwners] = useState<
    Record<string, { username: string; count: number }>
  >({});

  // Tour State
  const [tourStep, setTourStep] = useState(() => {
    return localStorage.getItem('stridewars_tour_seen') ? -1 : 0;
  });

  const advanceTour = () => setTourStep((s) => s + 1);
  const dismissTour = () => {
    localStorage.setItem('stridewars_tour_seen', 'true');
    setTourStep(-1);
  };

  const [runState, setRunState] = useState<'idle' | 'recording' | 'finished'>('idle');
  const [simulationMode, setSimulationMode] = useState(false);
  const [runPoints, setRunPoints] = useState<PointInput[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [captureSummary, setCaptureSummary] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  // Live GPS readout derived directly from actual tracked points
  const currentGpsLog = [...runPoints]
    .reverse()
    .slice(0, 5)
    .map((pt) => ({ lat: pt.lat, lng: pt.lng, time: pt.recordedAt, acc: 0 }));
  const [highlightLoopPoints, setHighlightLoopPoints] = useState<PointInput[]>([]);

  const { addToast } = useToast();
  const mapRef = useRef<any>(null);

  // Fetch Dashboard Stats
  useEffect(() => {
    if (!user) return;
    Promise.all([getRuns(undefined, 1), getMyTerritories(), getUserGlobalRank(), getUnreadCount()])
      .then(([runsData, territoriesData, rankData, notificationsData]) => {
        setStats({
          runs: runsData.runs.length,
          areaSquareMeters: rankData.areaSquareMeters,
          rank: rankData.rank,
          unread: notificationsData.count,
          hasLoaded: true,
        });
      })
      .catch((err) => {
        console.error('Failed to load map HUD stats', err);
        setStats((s) => ({ ...s, hasLoaded: true }));
      });
  }, [user]);

  // Live HUD Timer and Simulated GPS Polling
  useEffect(() => {
    let timer: any;
    let simTimer: any;

    if (runState === 'recording') {
      timer = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);

      if (simulationMode) {
        simTimer = setInterval(() => {
          setRunPoints((prev) => {
            const last =
              prev.length > 0 ? prev[prev.length - 1] : { lat: center[0], lng: center[1] };
            const jitteredAngle = Math.random() * 360;
            const jitteredRadius = 20 + Math.random() * 30;
            const nextPt = destinationPoint(last.lat, last.lng, jitteredAngle, jitteredRadius);

            const pt = {
              ...nextPt,
              recordedAt: new Date().toISOString(),
            };

            if (mapRef.current) mapRef.current.panTo([pt.lat, pt.lng]);
            return [...prev, pt];
          });
        }, 2000);
      }
    }

    return () => {
      clearInterval(timer);
      if (simTimer) clearInterval(simTimer);
    };
  }, [runState, simulationMode, center]);

  // Clean up geolocation on unmount
  useEffect(() => {
    return () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [watchId]);

  const handleStartRun = () => {
    setRunState('recording');
    setSimulationMode(false);
    setRunPoints([]);
    setElapsedSeconds(0);
    setCaptureSummary(null);

    if (navigator.geolocation && !simulationMode) {
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          setRunPoints((prev) => {
            const newPt = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              recordedAt: new Date().toISOString(),
            };

            // Throttle to 1 per second
            if (prev.length > 0) {
              const lastPt = prev[prev.length - 1];
              if (
                new Date(newPt.recordedAt).getTime() - new Date(lastPt.recordedAt).getTime() <
                1000
              ) {
                return prev;
              }
            }

            // Pan map to new point
            if (mapRef.current) {
              mapRef.current.panTo([newPt.lat, newPt.lng]);
            }

            return [...prev, newPt];
          });
        },
        (err) => {
          console.warn('Geolocation error', err);
          addToast('Geolocation denied or unavailable. Falling back to simulation mode.', 'error');
          setSimulationMode(true);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
      setWatchId(id);
    } else {
      setSimulationMode(true);
    }
  };

  const handleGenerateRandomPoint = () => {
    setRunPoints((prev) => {
      const now = new Date().toISOString();
      if (prev.length === 0) {
        // Start at current center
        const start = { lat: center[0], lng: center[1], recordedAt: now };
        return [start];
      }
      const last = prev[prev.length - 1];

      const bearing = Math.random() * 360;
      const distance = 2 + Math.random() * 2; // 2-4 meters per second pace

      const next = destinationPoint(last.lat, last.lng, bearing, distance);

      // Pan map
      if (mapRef.current) {
        mapRef.current.panTo([next.lat, next.lng]);
      }

      return [...prev, { ...next, recordedAt: now }];
    });
  };

  const handleGenerateRandomLoop = async () => {
    const loopCenterLat = mapRef.current ? mapRef.current.getCenter().lat : center[0];
    const loopCenterLng = mapRef.current ? mapRef.current.getCenter().lng : center[1];

    setSubmitting(true);

    try {
      const loopPoints = await generateRoadLoop(loopCenterLat, loopCenterLng);

      setHighlightLoopPoints(loopPoints);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setHighlightLoopPoints([]);

      const clientRunId = crypto.randomUUID();
      const startedAt = loopPoints[0].recordedAt;
      const data = await createRun(clientRunId, startedAt, loopPoints);

      if (data.capturedTerritories.length > 0) {
        setRefreshTrigger((prev) => prev + 1);
        Promise.all([getMyTerritories(), getUserGlobalRank()]).then(
          ([territoriesData, rankData]) => {
            setStats((prev) => ({
              ...prev,
              areaSquareMeters: rankData.areaSquareMeters,
              rank: rankData.rank,
            }));
          }
        );
      }

      setRunState((prev) => {
        if (prev === 'idle') {
          setCaptureSummary(data);
          return 'finished';
        }
        addToast(
          `Random Loop generated! Claimed ${data.capturedTerritories.length} cells.`,
          'success'
        );
        return prev;
      });
    } catch (err: any) {
      addToast(err.response?.data?.error?.message || 'Failed to submit loop', 'error');
      setRunState('idle');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinishRun = async () => {
    if (watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }

    setRunState('finished');
    setSubmitting(true);

    if (runPoints.length < 4) {
      addToast('Not enough distance to claim territory — try a longer loop.', 'error');
      setSubmitting(false);
      return;
    }

    try {
      const clientRunId = crypto.randomUUID();
      const startedAt = runPoints[0].recordedAt;
      const data = await createRun(clientRunId, startedAt, runPoints);

      setCaptureSummary(data);
      if (data.capturedTerritories.length > 0) {
        // Refetch stats on successful capture
        setRefreshTrigger((prev) => prev + 1);
        Promise.all([getMyTerritories(), getUserGlobalRank()]).then(
          ([territoriesData, rankData]) => {
            setStats((prev) => ({
              ...prev,
              areaSquareMeters: rankData.areaSquareMeters,
              rank: rankData.rank,
            }));
          }
        );
      }
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Failed to submit run';
      if (msg.toLowerCase().includes('enclosed area') || msg.toLowerCase().includes('points')) {
        addToast('Not enough distance to claim territory — try a longer loop.', 'error');
      } else {
        addToast(msg, 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setRunState('idle');
    setRunPoints([]);
    setCaptureSummary(null);
  };

  const polylinePositions = runPoints.map((p) => [p.lat, p.lng] as [number, number]);
  let autoClosePositions: [number, number][] = [];
  if (runState === 'finished' && runPoints.length > 1) {
    const first = runPoints[0];
    const last = runPoints[runPoints.length - 1];
    const dist = calculateHaversineDistance(first.lat, first.lng, last.lat, last.lng);
    if (dist > 30) {
      autoClosePositions = [
        [last.lat, last.lng],
        [first.lat, first.lng],
      ];
    }
  }

  const liveDistance = calculateTotalDistance(runPoints);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Derive top owners for legend
  const topOwners = useMemo(() => {
    return Object.entries(visibleOwners)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
  }, [visibleOwners]);

  return (
    <div style={{ height: 'calc(100vh - 70px)', width: '100%', position: 'relative' }}>
      <MapContainer
        center={center}
        zoom={14}
        style={{ height: '100%', width: '100%', zIndex: 1 }}
        ref={mapRef}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap & CARTO"
        />
        {hasCentered && (
          <TerritoryGrid
            currentUserId={user?.id}
            refreshTrigger={refreshTrigger}
            onVisibleOwnersChange={setVisibleOwners}
          />
        )}

        {polylinePositions.length > 0 && (
          <Polyline positions={polylinePositions} pathOptions={{ color: '#3b82f6', weight: 4 }} />
        )}
        {autoClosePositions.length > 0 && (
          <Polyline
            positions={autoClosePositions}
            pathOptions={{ color: '#3b82f6', weight: 4, dashArray: '5, 10' }}
          />
        )}
        {highlightLoopPoints.length > 0 && (
          <Polyline
            positions={highlightLoopPoints.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: '#eab308', weight: 5 }}
          />
        )}
      </MapContainer>

      {/* Live Recording HUD */}
      <div
        style={{
          position: 'absolute',
          bottom: '30px',
          left: '30px',
          zIndex: 1000,
          background: 'var(--color-bg-elevated)',
          padding: '1.5rem',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          width: '400px',
          maxWidth: '90vw',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          border: '1px solid var(--color-border)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'var(--color-text-primary)' }}>
            {runState === 'idle'
              ? 'Ready to Run'
              : runState === 'recording'
                ? 'Recording...'
                : 'Run Finished'}
          </h3>
          {runState === 'idle' && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={simulationMode}
                onChange={(e) => setSimulationMode(e.target.checked)}
              />
              Simulate GPS
            </label>
          )}
        </div>

        {(runState === 'recording' || runState === 'finished') && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: 'var(--color-text-primary)',
              background: 'var(--color-bg-surface)',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                {formatTime(elapsedSeconds)}
              </div>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--color-text-secondary)',
                  textTransform: 'uppercase',
                }}
              >
                Time Moving
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>
                {(liveDistance / 1000).toFixed(2)}
              </div>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--color-text-secondary)',
                  textTransform: 'uppercase',
                }}
              >
                Ground (km)
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{runPoints.length}</div>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--color-text-secondary)',
                  textTransform: 'uppercase',
                }}
              >
                Closing Loop
              </div>
            </div>
          </div>
        )}

        {/* Live GPS Readout */}
        {runState === 'recording' && currentGpsLog.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {currentGpsLog.map((gps, idx) => (
              <div
                key={idx}
                style={{
                  fontSize: '0.75rem',
                  color: idx === 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  background: 'var(--color-bg-surface)',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  opacity: 1 - idx * 0.15,
                }}
              >
                <span>
                  GPS: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {gps.acc ? <span>±{Math.round(gps.acc)}m</span> : null}
                  <span>{new Date(gps.time).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div
          style={{ display: 'flex', gap: '1rem', flexDirection: 'column', position: 'relative' }}
        >
          {tourStep === 0 && (
            <div
              style={{
                position: 'absolute',
                top: '-70px',
                left: '0',
                background: 'var(--color-brand-primary)',
                color: '#000',
                padding: '1rem',
                borderRadius: '8px',
                zIndex: 1100,
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                width: '100%',
              }}
            >
              <strong>Welcome!</strong> Hit this to start running and claim ground.
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: '0.5rem',
                  gap: '1rem',
                }}
              >
                <span
                  onClick={dismissTour}
                  style={{ fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Skip
                </span>
                <span
                  onClick={advanceTour}
                  style={{ fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Next →
                </span>
              </div>
              <div
                style={{
                  position: 'absolute',
                  bottom: '-10px',
                  left: '50px',
                  borderLeft: '10px solid transparent',
                  borderRight: '10px solid transparent',
                  borderTop: '10px solid var(--color-brand-primary)',
                }}
              />
            </div>
          )}

          {runState === 'idle' && (
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={handleStartRun}
                style={{
                  flex: 1,
                  background: '#4ade80',
                  color: '#000',
                  fontSize: '1.1rem',
                  padding: '0.75rem',
                  fontWeight: 'bold',
                  zIndex: tourStep === 0 ? 1200 : 'auto',
                  position: 'relative',
                }}
              >
                Claim Ground
              </button>
            </div>
          )}

          {runState === 'recording' && (
            <>
              {simulationMode && (
                <button
                  onClick={handleGenerateRandomPoint}
                  style={{
                    background: 'var(--color-bg-surface)',
                    border: '1px solid #3b82f6',
                    color: '#3b82f6',
                  }}
                >
                  Generate Random Point
                </button>
              )}

              <button
                onClick={handleFinishRun}
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: '1.1rem',
                  padding: '0.75rem',
                  fontWeight: 'bold',
                }}
              >
                Close Loop & Capture
              </button>
            </>
          )}

          {runState === 'finished' && (
            <>
              {submitting ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '1rem',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  Analyzing territory boundaries...
                </div>
              ) : captureSummary ? (
                <div
                  style={{
                    background: 'rgba(74, 222, 128, 0.1)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(74, 222, 128, 0.3)',
                  }}
                >
                  <h4 style={{ color: '#4ade80', margin: '0 0 0.5rem 0', fontSize: '1.3rem' }}>
                    🎉 You claimed this ground!
                  </h4>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '0.5rem',
                      fontSize: '0.9rem',
                    }}
                  >
                    <span>Cells Captured:</span>
                    <strong>{captureSummary.capturedTerritories.length}</strong>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '0.5rem',
                      fontSize: '0.9rem',
                    }}
                  >
                    <span>Enclosed Area:</span>
                    <strong>{captureSummary.enclosedAreaSquareMeters.toFixed(0)} m²</strong>
                  </div>

                  {captureSummary.capturedTerritories.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                        From opponents:
                      </span>
                      <ul
                        style={{
                          maxHeight: '80px',
                          overflowY: 'auto',
                          paddingLeft: '1rem',
                          fontSize: '0.85rem',
                          margin: '0.25rem 0',
                        }}
                      >
                        {captureSummary.capturedTerritories.map((t: any) => (
                          <li key={t.geohash}>
                            {t.geohash}{' '}
                            {t.previousOwnerId && (
                              <span style={{ color: '#ef4444', marginLeft: '0.5rem' }}>
                                (Taken)
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <Link
                    to="/leaderboards"
                    style={{
                      display: 'block',
                      marginTop: '1rem',
                      background: '#4ade80',
                      color: '#000',
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      textDecoration: 'none',
                      fontWeight: 'bold',
                      textAlign: 'center',
                    }}
                  >
                    View your new Rank →
                  </Link>
                </div>
              ) : (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '1rem',
                    color: 'var(--color-text-secondary)',
                    background: 'var(--color-bg-surface)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  Run logged, but no territory was captured.
                </div>
              )}
              <button
                onClick={handleReset}
                style={{
                  background: 'var(--color-bg-surface)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              >
                Close
              </button>
            </>
          )}

          {/* Always Available Random Loop Button */}
          <button
            onClick={handleGenerateRandomLoop}
            disabled={submitting}
            style={{
              background: 'var(--color-bg-surface)',
              border: '1px solid #3b82f6',
              color: '#3b82f6',
              fontSize: '0.9rem',
              padding: '0.75rem',
              fontWeight: 'bold',
              width: '100%',
              marginTop: '0.5rem',
            }}
          >
            {submitting ? '...' : 'Generate Random Loop'}
          </button>
        </div>
      </div>

      {/* HUD & Legend Overlay (Top Right) */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          alignItems: 'flex-end',
          pointerEvents: 'none', // let clicks pass through the gap
        }}
      >
        {/* Collapsible Dashboard Stats */}
        <div
          style={{
            background: 'var(--color-bg-elevated)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            pointerEvents: 'auto',
            width: '250px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '0.75rem 1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              background: 'var(--color-bg-surface)',
            }}
            onClick={() => setHudExpanded(!hudExpanded)}
          >
            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Your Stats</h4>
            <span style={{ fontSize: '0.8rem' }}>{hudExpanded ? '▲' : '▼'}</span>
          </div>

          {hudExpanded && (
            <div
              style={{
                padding: '1rem',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1rem',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-secondary)',
                    textTransform: 'uppercase',
                  }}
                >
                  Rank
                </div>
                <Link
                  to="/leaderboards"
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    color: 'var(--color-brand-primary)',
                    textDecoration: 'none',
                  }}
                >
                  {stats.rank ? `#${stats.rank}` : '-'}
                </Link>
              </div>
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-secondary)',
                    textTransform: 'uppercase',
                  }}
                >
                  Area Claimed
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                  {formatArea(stats.areaSquareMeters)}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-secondary)',
                    textTransform: 'uppercase',
                  }}
                >
                  Recent Runs
                </div>
                <Link
                  to="/dashboard"
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    color: 'var(--color-brand-primary)',
                    textDecoration: 'none',
                  }}
                >
                  Dashboard →
                </Link>
              </div>
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-secondary)',
                    textTransform: 'uppercase',
                  }}
                >
                  Alerts
                </div>
                <Link
                  to="/notifications"
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    color: stats.unread > 0 ? '#ef4444' : 'var(--color-text-primary)',
                    textDecoration: 'none',
                  }}
                >
                  {stats.unread}
                </Link>
              </div>
            </div>
          )}

          {tourStep === 2 && (
            <div
              style={{
                position: 'absolute',
                top: '50px',
                right: '270px',
                background: 'var(--color-brand-primary)',
                color: '#000',
                padding: '1rem',
                borderRadius: '8px',
                zIndex: 1100,
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                width: '250px',
              }}
            >
              Watch your rank climb as you capture more cells.
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <span
                  onClick={dismissTour}
                  style={{ fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Got it
                </span>
              </div>
              <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '-10px',
                  borderTop: '10px solid transparent',
                  borderBottom: '10px solid transparent',
                  borderLeft: '10px solid var(--color-brand-primary)',
                }}
              />
            </div>
          )}
        </div>

        {/* Legend */}
        <div
          style={{
            background: 'var(--color-bg-elevated)',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            pointerEvents: 'auto',
            width: '250px',
          }}
        >
          <h4
            style={{
              margin: '0 0 0.5rem 0',
              fontSize: '0.9rem',
              color: 'var(--color-text-secondary)',
            }}
          >
            Visible Map Owners
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* Always show "You" if logged in */}
            {user && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.85rem',
                }}
              >
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: '#4ade80',
                  }}
                />
                <span>You</span>
                {visibleOwners[user.id] && (
                  <span style={{ marginLeft: 'auto', color: 'var(--color-text-secondary)' }}>
                    {visibleOwners[user.id].count}
                  </span>
                )}
              </div>
            )}

            {/* Show top other users */}
            {topOwners
              .filter(([id]) => id !== user?.id)
              .map(([ownerId, info]) => (
                <div
                  key={ownerId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.85rem',
                  }}
                >
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: colorForUser(ownerId, user?.id),
                    }}
                  />
                  <span
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {info.username}
                  </span>
                  <span style={{ marginLeft: 'auto', color: 'var(--color-text-secondary)' }}>
                    {info.count}
                  </span>
                </div>
              ))}

            {topOwners.length === 0 && (
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--color-text-secondary)',
                  fontStyle: 'italic',
                }}
              >
                No captured ground in view.
              </div>
            )}
          </div>

          {tourStep === 1 && (
            <div
              style={{
                position: 'absolute',
                top: '100px',
                right: '270px',
                background: 'var(--color-brand-primary)',
                color: '#000',
                padding: '1rem',
                borderRadius: '8px',
                zIndex: 1100,
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                width: '250px',
              }}
            >
              See who owns what. Overlap their ground to take it.
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: '0.5rem',
                  gap: '1rem',
                }}
              >
                <span
                  onClick={dismissTour}
                  style={{ fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Skip
                </span>
                <span
                  onClick={advanceTour}
                  style={{ fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Next →
                </span>
              </div>
              <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '-10px',
                  borderTop: '10px solid transparent',
                  borderBottom: '10px solid transparent',
                  borderLeft: '10px solid var(--color-brand-primary)',
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Zero Territory State Overlay */}
      {stats.hasLoaded && stats.areaSquareMeters === 0 && runState === 'idle' && (
        <div
          style={{
            position: 'absolute',
            top: '20%',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 900,
            background: 'rgba(0, 0, 0, 0.7)',
            padding: '2rem',
            borderRadius: 'var(--radius-lg)',
            textAlign: 'center',
            backdropFilter: 'blur(4px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            pointerEvents: 'none',
          }}
        >
          <h2 style={{ color: 'white', margin: '0 0 1rem 0' }}>No ground claimed yet</h2>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '1.2rem' }}>
            Run a loop to make your first move.
          </p>
        </div>
      )}
    </div>
  );
};
