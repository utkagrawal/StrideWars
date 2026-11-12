import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  ZoomControl,
  useMapEvents,
} from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { createRun, generateRoadLoop, PointInput } from '../api/runs';
import { getMyTerritories } from '../api/territories';
import { getUserGlobalRank } from '../api/leaderboards';
import { TerritoryLayer, VisibleOwner } from '../components/map/TerritoryLayer';
import { OwnersLegend, StatsHud } from '../components/map/MapOverlays';
import { CaptureSummary, GpsFix, RunDock, RunMode } from '../components/map/RunDock';
import { PageLoading } from '../components/ui';
import {
  calculateTotalDistance,
  closeLoop,
  densifyPath,
  DEMO_PACE_SEC_PER_KM,
  Point,
  stampAtPace,
} from '../utils/geo';
import { TILE_ATTRIBUTION, TILE_URL } from '../utils/mapTiles';
import { ROUTE_COLOR, YOU_COLOR } from '../utils/colors';

const DEFAULT_CENTER: [number, number] = [26.1878, 91.6916]; // IIT Guwahati
const REPLAY_MS = 2600; // how long the "running the loop" animation takes
const GPS_SAMPLE_MS = 2000; // one track point (and one live-readout row) every 2 s

/** Forwards map clicks while the user is drawing a route. */
const DrawClicks = ({ enabled, onAdd }: { enabled: boolean; onAdd: (p: Point) => void }) => {
  useMapEvents({
    click: (e) => {
      if (enabled) onAdd({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
};

const toLatLngs = (pts: Point[]) => pts.map((p) => [p.lat, p.lng] as [number, number]);

export const MapPage = () => {
  const { user } = useAuth();
  const { addToast } = useToast();

  // ── Map + territory state ────────────────────────────────────────────────
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [initialCenter, setInitialCenter] = useState<[number, number] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [owners, setOwners] = useState<VisibleOwner[]>([]);
  const [zoomedOut, setZoomedOut] = useState(false);
  const [standing, setStanding] = useState<{ rank: number | null; areaSquareMeters: number }>({
    rank: null,
    areaSquareMeters: 0,
  });
  const usernames = useRef(new Map<string, string>());

  // ── Run state machine ────────────────────────────────────────────────────
  const [mode, setMode] = useState<RunMode>('idle');
  const [waypoints, setWaypoints] = useState<Point[]>([]); // drawing
  const [gpsPoints, setGpsPoints] = useState<PointInput[]>([]); // recording
  const [gpsLog, setGpsLog] = useState<GpsFix[]>([]); // latest raw fixes, newest first
  const [gpsWeak, setGpsWeak] = useState(false); // last reading failed, still retrying
  const [replayPath, setReplayPath] = useState<PointInput[]>([]); // replaying / result
  const [replayCount, setReplayCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [summary, setSummary] = useState<CaptureSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const watchId = useRef<number | null>(null);
  const pollId = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFix = useRef<GpsFix | null>(null);
  const zoomedForGps = useRef(false);

  // Open the map where your ground is (or on campus if you have none yet).
  useEffect(() => {
    getMyTerritories()
      .then((mine) => {
        if (mine.length === 0) return setInitialCenter(DEFAULT_CENTER);
        const latest = mine.reduce((a, b) => (a.captured_at > b.captured_at ? a : b));
        setInitialCenter([Number(latest.center_lat), Number(latest.center_lng)]);
      })
      .catch(() => setInitialCenter(DEFAULT_CENTER));
    getUserGlobalRank()
      .then(setStanding)
      .catch(() => {});
  }, []);

  const handleOwnersChange = useCallback((list: VisibleOwner[]) => {
    setOwners(list);
    list.forEach((o) => usernames.current.set(o.userId, o.username));
  }, []);

  const stopGps = () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (pollId.current !== null) {
      clearInterval(pollId.current);
      pollId.current = null;
    }
  };
  useEffect(() => stopGps, []);

  const reset = () => {
    stopGps();
    setMode('idle');
    setWaypoints([]);
    setGpsPoints([]);
    setGpsLog([]);
    setGpsWeak(false);
    setReplayPath([]);
    setReplayCount(0);
    setElapsed(0);
    setSummary(null);
  };

  // ── Submitting a run ─────────────────────────────────────────────────────
  const submit = async (points: PointInput[]) => {
    setMode('submitting');
    const rankBefore = standing.rank;
    try {
      const data = await createRun(crypto.randomUUID(), points[0].recordedAt, points);

      // Group stolen cells by their previous owner for the result card.
      const stolen = new Map<string, number>();
      for (const t of data.capturedTerritories) {
        if (t.previousOwnerId && t.previousOwnerId !== user?.id) {
          stolen.set(t.previousOwnerId, (stolen.get(t.previousOwnerId) ?? 0) + 1);
        }
      }

      setRefreshKey((k) => k + 1);
      // Leaderboard scores are updated just after the capture commits (eventually consistent),
      // so give Redis a moment before reading the new rank.
      await new Promise((r) => setTimeout(r, 400));
      const after = await getUserGlobalRank().catch(() => standing);
      setStanding(after);

      setSummary({
        runId: data.run.id,
        cellsClaimed: data.capturedTerritories.length,
        stolenFrom: [...stolen.entries()].map(([id, cells]) => ({
          username: usernames.current.get(id) ?? 'a rival',
          cells,
        })),
        enclosedAreaSquareMeters: data.enclosedAreaSquareMeters,
        rankBefore,
        rankAfter: after.rank,
      });
      setMode('result');
    } catch (err: any) {
      addToast(err.response?.data?.error?.message || 'Could not save that run.', 'error');
      reset();
    }
  };

  // ── Keeping things out from under the bottom panel ──────────────────────
  /** Height of the bottom panel (it grows while recording, so measure it each time). */
  const dockHeight = () =>
    (document.querySelector('[data-testid=run-dock]') as HTMLElement | null)?.offsetHeight ?? 0;

  /** Pan so `p` sits in the middle of the part of the map NOT covered by the bottom panel. */
  const panToVisible = (p: Point) => {
    if (!map) return;
    const zoom = map.getZoom();
    const shifted = map.project([p.lat, p.lng], zoom).add([0, (dockHeight() + 24) / 2]);
    map.panTo(map.unproject(shifted, zoom));
  };

  // ── Replay animation (drawn routes & quick loops) ────────────────────────
  const startReplay = (path: PointInput[]) => {
    setReplayPath(path);
    setReplayCount(1);
    setMode('replaying');
    map?.fitBounds(toLatLngs(path), {
      paddingTopLeft: [60, 90],
      paddingBottomRight: [60, dockHeight() + 40],
      maxZoom: 17,
    });
  };

  useEffect(() => {
    if (mode !== 'replaying') return;
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / REPLAY_MS);
      setReplayCount(Math.max(1, Math.ceil(t * replayPath.length)));
      if (t < 1) frame = requestAnimationFrame(tick);
      else submit(replayPath);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, replayPath]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleCaptureDrawn = () => {
    startReplay(stampAtPace(densifyPath(closeLoop(waypoints))));
  };

  const handleQuickLoop = async () => {
    if (!map) return;
    setBusy(true);
    try {
      const c = map.getCenter();
      startReplay(await generateRoadLoop(c.lat, c.lng));
    } catch {
      addToast('Could not generate a loop here. Try drawing one instead.', 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Latest position the browser has reported (updated whenever it has something new). */
  const handleFix = (pos: GeolocationPosition) => {
    lastFix.current = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      time: pos.timestamp,
    };
    setGpsWeak(false);
  };

  /**
   * Runs every 2 s while recording: records the current position as a track point and
   * adds it to the live readout. Driven by our own clock, so a point appears every 2 s
   * even when the device is standing still and the browser reports nothing new.
   */
  const sampleGps = () => {
    const fix = lastFix.current;
    if (!fix) return; // still waiting for the very first location
    const sample: GpsFix = { ...fix, time: Date.now() };
    setGpsLog((prev) => [sample, ...prev].slice(0, 3));
    setGpsPoints((prev) => [
      ...prev,
      { lat: sample.lat, lng: sample.lng, recordedAt: new Date(sample.time).toISOString() },
    ]);
    // On the first fix, zoom to street level so a few metres of movement is visible.
    if (map && !zoomedForGps.current) {
      zoomedForGps.current = true;
      if (map.getZoom() < 17) map.setZoom(17, { animate: false });
    }
    panToVisible(sample);
  };

  const handleStartGps = () => {
    if (!navigator.geolocation) {
      addToast('This browser has no GPS. Try "Draw a route" instead.', 'error');
      return;
    }
    reset();
    lastFix.current = null;
    zoomedForGps.current = false;
    setMode('recording');

    const onError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        addToast(
          'Location access was blocked. Allow it in the address bar, or use "Draw a route".',
          'error'
        );
        reset();
      } else {
        // Timeouts / "position unavailable" are normal mid-run (trees, tunnels, indoors).
        // Keep recording on the last known position; the next good fix clears the warning.
        setGpsWeak(true);
      }
    };

    // 1. A quick, low-accuracy first fix (Wi-Fi based) so the readout starts within a second or two.
    navigator.geolocation.getCurrentPosition(handleFix, onError, {
      enableHighAccuracy: false,
      maximumAge: 30_000,
      timeout: 10_000,
    });
    // 2. Precise GPS updates in the background for the rest of the run.
    watchId.current = navigator.geolocation.watchPosition(handleFix, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20_000,
    });
    // 3. Our own 2-second clock turns the latest position into a track point.
    pollId.current = setInterval(sampleGps, GPS_SAMPLE_MS);
  };

  const handleFinishGps = () => {
    stopGps();
    if (gpsPoints.length < 4) {
      addToast('Not enough GPS points yet. Keep moving a little longer.', 'error');
      reset();
      return;
    }
    setReplayPath(gpsPoints);
    setReplayCount(gpsPoints.length);
    submit(gpsPoints);
  };

  // Timer while recording.
  useEffect(() => {
    if (mode !== 'recording') return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [mode]);

  // ── Derived values for the dock ──────────────────────────────────────────
  const drawnLoop = waypoints.length >= 2 ? closeLoop(waypoints) : waypoints;
  let distance = 0;
  let seconds = elapsed;
  if (mode === 'drawing') {
    distance = calculateTotalDistance(drawnLoop);
    seconds = (distance / 1000) * DEMO_PACE_SEC_PER_KM;
  } else if (mode === 'recording') {
    distance = calculateTotalDistance(gpsPoints);
  } else {
    distance = calculateTotalDistance(replayPath.slice(0, replayCount));
  }

  if (!initialCenter) return <PageLoading />;

  return (
    <div className={`map-page${mode === 'drawing' ? ' drawing' : ''}`}>
      <MapContainer center={initialCenter} zoom={15} zoomControl={false} ref={setMap}>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
        <ZoomControl position="bottomright" />

        <TerritoryLayer
          currentUserId={user?.id}
          refreshKey={refreshKey}
          onOwnersChange={handleOwnersChange}
          onZoomedOutChange={setZoomedOut}
        />

        <DrawClicks enabled={mode === 'drawing'} onAdd={(p) => setWaypoints((w) => [...w, p])} />

        {/* Route being drawn: solid path + dashed line showing how the loop will close */}
        {mode === 'drawing' && waypoints.length > 0 && (
          <>
            <Polyline
              positions={toLatLngs(waypoints)}
              pathOptions={{ color: ROUTE_COLOR, weight: 4 }}
            />
            {waypoints.length >= 2 && (
              <Polyline
                positions={toLatLngs([waypoints[waypoints.length - 1], waypoints[0]])}
                pathOptions={{ color: ROUTE_COLOR, weight: 3, dashArray: '6 8', opacity: 0.6 }}
              />
            )}
            {waypoints.map((w, i) => (
              <CircleMarker
                key={i}
                center={[w.lat, w.lng]}
                radius={i === 0 ? 7 : 4}
                pathOptions={{
                  color: ROUTE_COLOR,
                  weight: 2,
                  fillColor: YOU_COLOR,
                  fillOpacity: 1,
                }}
              />
            ))}
          </>
        )}

        {mode === 'recording' && gpsPoints.length > 0 && (
          <Polyline
            positions={toLatLngs(gpsPoints)}
            pathOptions={{ color: ROUTE_COLOR, weight: 4 }}
          />
        )}

        {/* "You are here": the latest GPS position, with a faint circle showing its accuracy */}
        {mode === 'recording' && gpsLog.length > 0 && (
          <>
            <Circle
              center={[gpsLog[0].lat, gpsLog[0].lng]}
              radius={gpsLog[0].accuracy}
              pathOptions={{ color: ROUTE_COLOR, weight: 1, opacity: 0.4, fillOpacity: 0.08 }}
              interactive={false}
            />
            <CircleMarker
              center={[gpsLog[0].lat, gpsLog[0].lng]}
              radius={8}
              pathOptions={{ color: ROUTE_COLOR, weight: 3, fillColor: YOU_COLOR, fillOpacity: 1 }}
              interactive={false}
            />
          </>
        )}

        {replayPath.length > 0 && mode !== 'drawing' && mode !== 'recording' && (
          <>
            <Polyline
              positions={toLatLngs(replayPath.slice(0, replayCount))}
              pathOptions={{ color: ROUTE_COLOR, weight: 4 }}
            />
            {mode === 'replaying' && (
              <CircleMarker
                center={[replayPath[replayCount - 1].lat, replayPath[replayCount - 1].lng]}
                radius={8}
                pathOptions={{
                  color: ROUTE_COLOR,
                  weight: 3,
                  fillColor: YOU_COLOR,
                  fillOpacity: 1,
                }}
              />
            )}
          </>
        )}
      </MapContainer>

      <StatsHud rank={standing.rank} areaSquareMeters={standing.areaSquareMeters} />
      <OwnersLegend owners={owners} currentUserId={user?.id} zoomedOut={zoomedOut} />

      <RunDock
        mode={mode}
        distanceMeters={distance}
        elapsedSeconds={seconds}
        waypointCount={mode === 'recording' ? gpsPoints.length : waypoints.length}
        gpsLog={gpsLog}
        gpsWeak={gpsWeak}
        summary={summary}
        busy={busy}
        onStartGps={handleStartGps}
        onStartDrawing={() => {
          reset();
          setMode('drawing');
        }}
        onQuickLoop={handleQuickLoop}
        onUndoWaypoint={() => setWaypoints((w) => w.slice(0, -1))}
        onCaptureDrawn={handleCaptureDrawn}
        onFinishGps={handleFinishGps}
        onCancel={reset}
        onDone={reset}
      />
    </div>
  );
};
