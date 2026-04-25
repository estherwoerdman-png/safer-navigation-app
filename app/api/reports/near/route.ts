import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  const radius = Math.min(Number(url.searchParams.get('radius') ?? 200), 2000);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'invalid_coords' }, { status: 400 });
  }

  const result = await db.execute(sql`
    SELECT
      r.id,
      r.type,
      r.severity,
      r.summary,
      r.transcript,
      r.reported_at,
      ST_Y(r.location::geometry) AS lat,
      ST_X(r.location::geometry) AS lng,
      ST_Distance(
        r.location,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      ) AS distance_m,
      COALESCE(
        (SELECT AVG(CASE WHEN agree = 'true' THEN 1.0 ELSE 0.0 END)
         FROM feedback_responses f WHERE f.report_id = r.id),
        0
      ) AS agree_ratio
    FROM reports r
    WHERE ST_DWithin(
      r.location,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ${radius}
    )
    ORDER BY distance_m ASC
    LIMIT 50
  `);

  return NextResponse.json({ reports: (result as any).rows });
}
