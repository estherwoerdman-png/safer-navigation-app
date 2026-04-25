'use client';

import { useState, useCallback, useEffect } from 'react';
import { HomeScreen } from '@/components/screens/home';
import { ReportScreen } from '@/components/screens/report';

type Screen = 'home' | 'report' | 'route' | 'navigate' | 'arrive';

export type Coord = { lat: number; lng: number };

export type RouteResponse = {
  id: string;
  polyline: string;
  duration_min: number;
  distance_m: number;
  safety_score: number;
  incidents_avoided: number;
  reasons: string[];
};

export type AppState = {
  screen: Screen;
  origin: Coord | null;
  destination: Coord | null;
  routes: RouteResponse[];
  activeRouteId: string | null;
  mode: 'walking' | 'cycling';
};

export default function Page() {
  const [state, setState] = useState<AppState>({
    screen: 'home',
    origin: null,
    destination: null,
    routes: [],
    activeRouteId: null,
    mode: 'walking',
  });

  const [pos, setPos] = useState<Coord | null>(null);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (g) => setPos({ lat: g.coords.latitude, lng: g.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 5000 },
    );
  }, []);

  const goto = useCallback((screen: Screen) => {
    setState((s) => ({ ...s, screen }));
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-[var(--paper)]">
      {state.screen === 'home' && (
        <HomeScreen
          initialPosition={pos}
          onSearch={(dest) =>
            setState((s) => ({
              ...s,
              origin: pos ?? { lat: 52.3676, lng: 4.9041 },
              destination: dest,
              screen: 'route',
            }))
          }
          onReport={() => goto('report')}
        />
      )}
      {state.screen === 'report' && <ReportScreen onDone={() => goto('home')} />}
      {state.screen === 'route' && (
        <RouteStub onStart={() => goto('navigate')} onCancel={() => goto('home')} />
      )}
      {state.screen === 'navigate' && (
        <NavigateStub onArrive={() => goto('arrive')} onCancel={() => goto('home')} />
      )}
      {state.screen === 'arrive' && (
        <ArriveStub onDone={() => goto('home')} />
      )}
    </main>
  );
}

function RouteStub({ onStart, onCancel }: { onStart: () => void; onCancel: () => void }) {
  return (
    <div className="p-6">
      <h1 className="display text-2xl">Route (stub)</h1>
      <button className="m-2 underline" onClick={onStart}>Start</button>
      <button className="m-2 underline" onClick={onCancel}>Cancel</button>
    </div>
  );
}
function NavigateStub({ onArrive, onCancel }: { onArrive: () => void; onCancel: () => void }) {
  return (
    <div className="p-6">
      <h1 className="display text-2xl">Navigate (stub)</h1>
      <button className="m-2 underline" onClick={onArrive}>Mock arrive</button>
      <button className="m-2 underline" onClick={onCancel}>Cancel</button>
    </div>
  );
}
function ArriveStub({ onDone }: { onDone: () => void }) {
  return (
    <div className="p-6">
      <h1 className="display text-2xl">Arrive (stub)</h1>
      <button className="m-2 underline" onClick={onDone}>Done</button>
    </div>
  );
}
