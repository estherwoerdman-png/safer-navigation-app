'use client';

import { useEffect, useRef } from 'react';
import mapboxgl, { type Map as MbMap } from 'mapbox-gl';
// CSS is imported globally via app/globals.css to work around Turbopack's
// quirky handling of CSS imports inside client components.

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

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
      // Paint overrides removed — light-v11 has different layer IDs than the
      // older streets-v8 style. The default light-v11 is already close to the
      // cream palette. Stretch goal: author a custom Mapbox Studio style.
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
