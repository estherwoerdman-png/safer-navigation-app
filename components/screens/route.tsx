'use client';

import { useEffect, useState } from 'react';
import type { Map as MbMap } from 'mapbox-gl';
import { MapView } from '@/components/map/map-view';
import { ReportPins, type Pin } from '@/components/map/report-pins';
import { RouteLine } from '@/components/map/route-line';
import { UserLocationDot } from '@/components/map/user-location-dot';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { getVoice } from '@/lib/voice';
import type { RouteResponse, Coord } from '@/app/page';

export function RouteScreen({
  origin, destination, mode,
  onStart, onCancel, setRoutes, routes,
}: {
  origin: Coord;
  destination: Coord;
  mode: 'walking' | 'cycling';
  onStart: (activeRouteId: string) => void;
  onCancel: () => void;
  setRoutes: (rs: RouteResponse[]) => void;
  routes: RouteResponse[];
}) {
  const [map, setMap] = useState<MbMap | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination, mode }),
    }).then((r) => r.json()).then(async (data) => {
      const rs: RouteResponse[] = data.routes ?? [];
      if (rs.length === 0) { setError('no_routes'); return; }
      setRoutes(rs);
      setActiveId(rs[0].id);

      const v = await getVoice();
      const fastest = [...rs].sort((a, b) => a.duration_min - b.duration_min)[0];
      const safest = rs[0];
      if (safest.id === fastest.id) {
        await v.speak(`Routing you there. ${safest.duration_min} minutes.`);
      } else {
        const extra = safest.duration_min - fastest.duration_min;
        const reason = safest.reasons[0] ?? 'fewer reports along this path';
        await v.speak(`Picked the safer route. ${reason}. ${extra} minutes longer.`);
      }
    }).catch(() => setError('fetch_failed'));
  }, [origin, destination, mode, setRoutes]);

  useEffect(() => {
    fetch(`/api/reports/near?lat=${origin.lat}&lng=${origin.lng}&radius=2000`)
      .then((r) => r.json()).then((data) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setPins((data.reports ?? []).map((r: any) => ({
          id: r.id, lat: Number(r.lat), lng: Number(r.lng),
          severity: r.severity, type: r.type,
        })));
      }).catch(() => { /* DB not ready */ });
  }, [origin]);

  const drawn = routes.map((r, i) => ({
    id: r.id, polyline: r.polyline, rank: i, active: r.id === activeId,
  }));
  const active = routes.find((r) => r.id === activeId);

  return (
    <div className="absolute inset-0">
      <MapView className="absolute inset-0" onReady={setMap} />
      <ReportPins map={map} pins={pins} />
      <RouteLine map={map} routes={drawn} />
      <UserLocationDot map={map} position={origin} />

      <BottomSheet>
        {error && <p className="text-[var(--sev-acute)]">No routes available — try again.</p>}
        {!error && !active && (
          <div className="flex items-center gap-3 py-1">
            <span className="text-[var(--ink-3)]">Finding the safest route</span>
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          </div>
        )}
        {active && (
          <>
            <h2 className="display text-xl text-[var(--ink)]">
              {active.id === routes[0].id ? 'Safer route' : 'Fastest route'}
            </h2>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="display text-4xl text-[var(--ink)] leading-none">
                {active.duration_min}
              </span>
              <span className="text-sm text-[var(--ink-3)]">
                min · {(active.distance_m / 1000).toFixed(1)} km
              </span>
            </div>
            <ul className="text-sm text-[var(--ink-2)] mt-3 space-y-1">
              {active.reasons.map((r, i) => <li key={i}>· {r}</li>)}
            </ul>
            <div className="flex gap-2 mt-4">
              {routes.map((r, i) => (
                <button key={r.id} onClick={() => setActiveId(r.id)}
                  className={`flex-1 py-2 rounded-xl text-sm active:scale-[0.98] transition-transform
                    ${r.id === activeId
                      ? 'bg-[var(--primary)] text-white'
                      : 'bg-[var(--paper-2)] text-[var(--ink)]'}`}>
                  {i === 0 ? 'Safest' : i === 1 ? 'Alt 1' : 'Alt 2'} · {r.duration_min}m
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={onCancel}
                className="flex-1 py-3 rounded-xl bg-[var(--paper-2)] text-[var(--ink)]">
                Cancel
              </button>
              <button onClick={() => active && onStart(active.id)}
                className="flex-[2] py-3 rounded-xl bg-[var(--primary)] text-white display">
                Start
              </button>
            </div>
          </>
        )}
      </BottomSheet>
    </div>
  );
}
