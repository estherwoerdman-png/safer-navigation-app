'use client';

import { useState, useCallback, useEffect } from 'react';
import { HomeScreen } from '@/components/screens/home';
import { ReportScreen } from '@/components/screens/report';
import { RouteScreen } from '@/components/screens/route';
import { NavigateScreen, type NearReport } from '@/components/screens/navigate';
import { PromptOverlay } from '@/components/screens/prompt';

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
  activePrompt: NearReport | null;
};

export default function Page() {
  const [state, setState] = useState<AppState>({
    screen: 'home',
    origin: null,
    destination: null,
    routes: [],
    activeRouteId: null,
    mode: 'walking',
    activePrompt: null,
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

  const setRoutes = useCallback((routes: RouteResponse[]) => {
    setState((s) => ({ ...s, routes, activeRouteId: routes[0]?.id ?? null }));
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
      {state.screen === 'route' && state.origin && state.destination && (
        <RouteScreen
          origin={state.origin}
          destination={state.destination}
          mode={state.mode}
          routes={state.routes}
          setRoutes={setRoutes}
          onStart={(activeRouteId) => setState((s) => ({ ...s, activeRouteId, screen: 'navigate' }))}
          onCancel={() => goto('home')}
        />
      )}
      {state.screen === 'navigate' && state.origin && state.destination && state.activeRouteId && (
        <>
          <NavigateScreen
            origin={state.origin}
            destination={state.destination}
            mode={state.mode}
            routes={state.routes}
            activeRouteId={state.activeRouteId}
            onArrive={() => goto('arrive')}
            onCancel={() => goto('home')}
            onPromptOpen={(r) => setState((s) => ({ ...s, activePrompt: r }))}
            onActiveRouteChange={(rs, id) =>
              setState((s) => ({ ...s, routes: rs, activeRouteId: id }))
            }
          />
          {state.activePrompt && state.origin && (
            <PromptOverlay
              report={state.activePrompt}
              position={state.origin}
              onClose={() => setState((s) => ({ ...s, activePrompt: null }))}
              onCounted={() => { /* count is tracked inside NavigateScreen on prompt open */ }}
            />
          )}
        </>
      )}
      {state.screen === 'arrive' && (
        <ArriveStub onDone={() => goto('home')} />
      )}
    </main>
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
