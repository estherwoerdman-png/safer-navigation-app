'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect } from 'react';
import type { Map as MbMap } from 'mapbox-gl';
import type { Coord } from '@/app/page';

const SOURCE_ID = 'user-loc-src';
const HALO_LAYER = 'user-loc-halo';
const DOT_LAYER = 'user-loc-dot';

function readVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function UserLocationDot({
  map,
  position,
}: {
  map: MbMap | null;
  position: Coord | null;
}) {
  useEffect(() => {
    if (!map || !position) return;
    const data = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [position.lng, position.lat] },
      properties: {},
    } as any;

    if (map.getSource(SOURCE_ID)) {
      (map.getSource(SOURCE_ID) as any).setData(data);
    } else {
      const dotColor = readVar('--location-dot');
      map.addSource(SOURCE_ID, { type: 'geojson', data });
      map.addLayer({
        id: HALO_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-color': dotColor,
          'circle-radius': 16,
          'circle-opacity': 0.2,
        },
      });
      map.addLayer({
        id: DOT_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-color': dotColor,
          'circle-radius': 6,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
    }

    if (map.getLayer(HALO_LAYER)) map.moveLayer(HALO_LAYER);
    if (map.getLayer(DOT_LAYER)) map.moveLayer(DOT_LAYER);
  }, [map, position]);

  // Re-pin to top after route layers update so the dot never gets hidden.
  useEffect(() => {
    if (!map) return;
    const onSourceData = (e: any) => {
      if (!e.sourceId?.startsWith('route-src-')) return;
      if (map.getLayer(HALO_LAYER)) map.moveLayer(HALO_LAYER);
      if (map.getLayer(DOT_LAYER)) map.moveLayer(DOT_LAYER);
    };
    map.on('sourcedata', onSourceData);
    return () => {
      map.off('sourcedata', onSourceData);
    };
  }, [map]);

  return null;
}
