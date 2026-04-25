import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { decodePolyline } from '@/lib/routing/decode-polyline';

const RATINGS = ['lit_quiet', 'caution', 'avoid', 'acute'] as const;
type Rating = (typeof RATINGS)[number];

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    polyline?: string;
    rating?: Rating;
    duration_min?: number;
    mode?: 'walking' | 'cycling';
  };

  if (!body.polyline || !body.rating || !RATINGS.includes(body.rating) ||
      typeof body.duration_min !== 'number' ||
      (body.mode !== 'walking' && body.mode !== 'cycling')) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const points = decodePolyline(body.polyline);
  if (points.length < 2) {
    return NextResponse.json({ error: 'invalid_polyline' }, { status: 400 });
  }
  const lineWkt = 'LINESTRING(' +
    points.map(([lat, lng]) => `${lng} ${lat}`).join(',') + ')';

  await db.execute(sql`
    INSERT INTO route_feedback (polyline, rating, duration_min, mode)
    VALUES (
      ST_GeogFromText(${lineWkt}),
      ${body.rating},
      ${body.duration_min},
      ${body.mode}
    )
  `);

  return NextResponse.json({ ok: true });
}
