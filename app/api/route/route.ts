import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { getRoutes } from '@/lib/routing/google-directions';
import { decodePolyline } from '@/lib/routing/decode-polyline';
import { scoreReports, type ReportLite } from '@/lib/routing/score';

type ReqBody = {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  mode: 'walking' | 'cycling';
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ReqBody;
  const directions = await getRoutes(body);
  if (directions.length === 0) {
    return NextResponse.json({ routes: [], recommended_id: null });
  }

  const now = new Date();
  const enriched = await Promise.all(
    directions.map(async (rt, idx) => {
      const points = decodePolyline(rt.polyline);
      if (points.length < 2) {
        return {
          id: `route-${idx}`,
          ...rt,
          scored: { safetyScore: 0, scored: [] as ReturnType<typeof scoreReports>['scored'] },
          points,
        };
      }

      const lineWkt =
        'LINESTRING(' + points.map(([lat, lng]) => `${lng} ${lat}`).join(',') + ')';

      const result = await db.execute(sql`
        SELECT
          r.id, r.type, r.severity, r.summary, r.reported_at,
          ST_Distance(r.location, ST_GeogFromText(${lineWkt})) AS distance_m,
          COALESCE(
            (SELECT AVG(CASE WHEN agree = 'true' THEN 1.0 ELSE 0.0 END)
             FROM feedback_responses f WHERE f.report_id = r.id), 0
          ) AS agree_ratio
        FROM reports r
        WHERE ST_DWithin(r.location, ST_GeogFromText(${lineWkt}), 30)
      `);

      const nearby: ReportLite[] = (result as unknown as { rows: Array<Record<string, unknown>> }).rows.map(
        (row) => ({
          id: String(row.id),
          type: row.type as ReportLite['type'],
          severity: row.severity as ReportLite['severity'],
          summary: String(row.summary),
          reportedAt: new Date(row.reported_at as string),
          distanceMeters: Number(row.distance_m),
          agreeRatio: Number(row.agree_ratio),
        }),
      );

      const routeLengthKm = rt.distanceM / 1000;
      const scored = scoreReports({ nearby, routeLengthKm, now });
      return { id: `route-${idx}`, ...rt, scored, points };
    }),
  );

  // Baseline = the fastest (Google's first route) before re-rank
  const fastestNearbyCount = enriched[0].scored.scored.length;

  const ranked = [...enriched].sort((a, b) => a.scored.safetyScore - b.scored.safetyScore);

  const responseRoutes = ranked.map((rt) => {
    const reasons: string[] = [];
    const top = [...rt.scored.scored].sort((a, b) => b.score - a.score).slice(0, 2);
    for (const r of top) {
      reasons.push(
        `avoids ${r.type === 'acute' ? 'acute' : 'environmental'} report: ${r.summary}`,
      );
    }
    if (rt.scored.scored.length === 0) reasons.push('no reported incidents along this path');

    return {
      id: rt.id,
      polyline: rt.polyline,
      duration_min: Math.round(rt.durationSec / 60),
      distance_m: rt.distanceM,
      safety_score: Number(rt.scored.safetyScore.toFixed(4)),
      incidents_avoided: Math.max(0, fastestNearbyCount - rt.scored.scored.length),
      reasons,
    };
  });

  return NextResponse.json({
    routes: responseRoutes,
    recommended_id: responseRoutes[0]?.id ?? null,
  });
}
