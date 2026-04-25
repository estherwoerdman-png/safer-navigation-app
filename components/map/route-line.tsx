'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect } from 'react';
import type { Map as MbMap } from 'mapbox-gl';
import { decodePolyline } from '@/lib/routing/decode-polyline';

export type DrawnRoute = {
  id: string;
  polyline: string;
  /** rank 0 = safest (drawn last, on top, thicker) */
  rank: number;
  active: boolean;
};

function resolveVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function RouteLine({
  map,
  routes,
  mode,
}: {
  map: MbMap | null;
  routes: DrawnRoute[];
  mode: 'walking' | 'cycling';
}) {
  useEffect(() => {
    if (!map) return;
    const dashPattern = mode === 'walking' ? [0.5, 1.5] : [2, 1];

    const colorByRank = (rank: number) =>
      rank === 0
        ? resolveVar('--primary')
        : rank === 1
          ? resolveVar('--sev-mid')
          : resolveVar('--sev-high');
    const inactiveColor = resolveVar('--ink-4');

    for (const id of (map.getStyle()?.layers ?? []).map((l) => l.id)) {
      if (id.startsWith('route-line-')) map.removeLayer(id);
    }
    for (const id of Object.keys(map.getStyle()?.sources ?? {})) {
      if (id.startsWith('route-src-')) map.removeSource(id);
    }

    // Draw inactive routes first, active route last so it sits visually on top.
    const sorted = [...routes].sort((a, b) => Number(a.active) - Number(b.active));
    for (const r of sorted) {
      const pts = decodePolyline(r.polyline).map(([lat, lng]) => [lng, lat]);
      const srcId = `route-src-${r.id}`;
      const layerId = `route-line-${r.id}`;
      map.addSource(srcId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: pts },
        } as any,
      });
      map.addLayer({
        id: layerId,
        type: 'line',
        source: srcId,
        paint: {
          'line-color': r.active ? colorByRank(r.rank) : inactiveColor,
          'line-width': r.active ? 7 : 4,
          'line-opacity': r.active ? 1 : 0.4,
          'line-dasharray': dashPattern,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    }
  }, [map, routes, mode]);

  return null;
}
