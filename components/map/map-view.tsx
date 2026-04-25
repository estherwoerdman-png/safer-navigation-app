'use client';

import { useEffect, useRef } from 'react';
import mapboxgl, { type Map as MbMap } from 'mapbox-gl';
// CSS is imported globally via app/globals.css to work around Turbopack's
// quirky handling of CSS imports inside client components.

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

function readVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function applyMapPalette(map: MbMap) {
  const land = readVar('--map-land');
  const water = readVar('--map-water');
  const park = readVar('--map-park');
  const bridge = readVar('--map-bridge');
  const roadEdge = readVar('--map-road-edge');

  for (const layer of map.getStyle()?.layers ?? []) {
    const { id, type } = layer;
    try {
      if (type === 'background') {
        map.setPaintProperty(id, 'background-color', land);
      } else if (type === 'fill' && /water/i.test(id)) {
        map.setPaintProperty(id, 'fill-color', water);
      } else if (type === 'fill' && /(park|landuse|pitch|grass|wood)/i.test(id)) {
        map.setPaintProperty(id, 'fill-color', park);
      } else if (type === 'line' && /^bridge/i.test(id)) {
        map.setPaintProperty(id, 'line-color', bridge);
      } else if (type === 'line' && /^road/i.test(id) && /case/i.test(id)) {
        map.setPaintProperty(id, 'line-color', roadEdge);
      }
    } catch {
      // Some layers may not accept the property; skip silently.
    }
  }
}

const AMSTERDAM_CENTER: [number, number] = [4.9041, 52.3676];

export function MapView({
  onReady,
  className,
}: {
  onReady?: (m: MbMap) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MbMap | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const m = new mapboxgl.Map({
      container: ref.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: AMSTERDAM_CENTER,
      zoom: 13,
      attributionControl: false,
    });
    mapRef.current = m;

    m.on('style.load', () => {
      applyMapPalette(m);
      onReady?.(m);
    });

    return () => {
      m.remove();
      mapRef.current = null;
    };
  }, [onReady]);

  // Both className AND inline style ensure the container has size even if
  // CSS classes don't load (Turbopack quirk).
  return (
    <div
      ref={ref}
      className={className ?? 'w-full h-full'}
      style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
    />
  );
}
