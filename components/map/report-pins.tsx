'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef } from 'react';
import type { Map as MbMap } from 'mapbox-gl';

export type Pin = {
  id: string;
  lat: number;
  lng: number;
  severity: 'low' | 'medium' | 'high';
  type: 'acute' | 'environmental';
};

const SEV_TO_VAR = {
  low: '--sev-low',
  medium: '--sev-mid',
  high: '--sev-high',
} as const;

function resolveVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const SOURCE_ID = 'reports-src';
const LAYER_ID = 'reports-layer';

export function ReportPins({
  map,
  pins,
  onPinClick,
}: {
  map: MbMap | null;
  pins: Pin[];
  onPinClick?: (id: string) => void;
}) {
  // Keep latest callback in a ref so the click handler (registered once)
  // always calls the current version without re-binding.
  const onPinClickRef = useRef(onPinClick);
  useEffect(() => {
    onPinClickRef.current = onPinClick;
  }, [onPinClick]);

  useEffect(() => {
    if (!map) return;
    const features = {
      type: 'FeatureCollection',
      features: pins.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id,
          color:
            p.type === 'acute'
              ? resolveVar('--sev-acute')
              : resolveVar(SEV_TO_VAR[p.severity]),
          radius: p.type === 'acute' ? 7 : 5,
        },
      })),
    } as any;

    if (map.getSource(SOURCE_ID)) {
      (map.getSource(SOURCE_ID) as any).setData(features);
    } else {
      map.addSource(SOURCE_ID, { type: 'geojson', data: features });
      map.addLayer({
        id: LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['get', 'radius'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1,
        },
      });

      map.on('click', LAYER_ID, (e: any) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) onPinClickRef.current?.(id);
      });
      map.on('mouseenter', LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
      });
    }
  }, [map, pins]);

  return null;
}
