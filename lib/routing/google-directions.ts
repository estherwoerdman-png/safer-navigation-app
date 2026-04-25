export type DirectionsRoute = {
  polyline: string;
  durationSec: number;
  distanceM: number;
};

export async function getRoutes(args: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  mode: 'walking' | 'cycling';
}): Promise<DirectionsRoute[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('GOOGLE_MAPS_API_KEY not set');

  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', `${args.origin.lat},${args.origin.lng}`);
  url.searchParams.set('destination', `${args.destination.lat},${args.destination.lng}`);
  url.searchParams.set('mode', args.mode === 'cycling' ? 'bicycling' : 'walking');
  url.searchParams.set('alternatives', 'true');
  url.searchParams.set('key', key);

  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`directions ${r.status}`);
  const data = (await r.json()) as {
    status: string;
    routes?: Array<{
      overview_polyline: { points: string };
      legs?: Array<{
        duration?: { value: number };
        distance?: { value: number };
      }>;
    }>;
  };
  if (data.status !== 'OK') throw new Error(`directions ${data.status}`);

  return (data.routes ?? []).map((rt) => ({
    polyline: rt.overview_polyline.points,
    durationSec: rt.legs?.[0]?.duration?.value ?? 0,
    distanceM: rt.legs?.[0]?.distance?.value ?? 0,
  }));
}
