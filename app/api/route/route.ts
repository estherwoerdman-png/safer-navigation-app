import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { getRoutes } from '@/lib/routing/google-directions';
import { decodePolyline } from '@/lib/routing/decode-polyline';
import {
  scoreReports,
  scoreRouteFeedback,
  type ReportLite,
  type RouteFeedbackOverlap,
} from '@/lib/routing/score';

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
          feedback: { feedbackScore: 0, scored: [] as ReturnType<typeof scoreRouteFeedback>['scored'] },
          points,
        };
      }

      const lineWkt =
        'LINESTRING(' + points.map(([lat, lng]) => `${lng} ${lat}`).join(',') + ')';

      // Reports within 30m of the polyline
      const reportsResult = await db.execute(sql`
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

      const nearby: ReportLite[] = (reportsResult as unknown as { rows: Array<Record<string, unknown>> }).rows.map(
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

      // route_feedback rows whose polylines overlap this candidate within 30m.
      // Buffer the rated polyline by 30m, intersect with the candidate, take length.
      const feedbackResult = await db.execute(sql`
        SELECT
          rf.id, rf.rating,
          ST_Length(
            ST_Intersection(
              ST_Buffer(rf.polyline::geometry, 0.0003),
              ST_GeogFromText(${lineWkt})::geometry
            )::geography
          ) AS overlap_m
        FROM route_feedback rf
        WHERE ST_DWithin(rf.polyline, ST_GeogFromText(${lineWkt}), 30)
      `);

      const overlaps: RouteFeedbackOverlap[] = (feedbackResult as unknown as { rows: Array<Record<string, unknown>> }).rows
        .map((row) => ({
          overlapMeters: Number(row.overlap_m) || 0,
          rating: row.rating as RouteFeedbackOverlap['rating'],
        }))
        .filter((o) => o.overlapMeters >= 20); // ignore micro-overlaps from buffer artifacts

      const routeLengthKm = rt.distanceM / 1000;
      const scored = scoreReports({ nearby, routeLengthKm, now });
      const feedback = scoreRouteFeedback({ overlaps, routeLengthKm });
      return { id: `route-${idx}`, ...rt, scored, feedback, points };
    }),
  );

  // Baseline = the fastest (Google's first route) before re-rank
  const fastestNearbyCount = enriched[0].scored.scored.length;

  const totalScore = (e: (typeof enriched)[number]) =>
    e.scored.safetyScore + e.feedback.feedbackScore;
  const ranked = [...enriched].sort((a, b) => totalScore(a) - totalScore(b));

  const responseRoutes = ranked.map((rt) => {
    const reasons: string[] = [];

    // Lead with rated-polyline insight if it materially affected the score.
    const litMeters = rt.feedback.scored
      .filter((s) => s.rating === 'lit_quiet')
      .reduce((sum, s) => sum + s.overlapMeters, 0);
    const negativeMeters = rt.feedback.scored
      .filter((s) => s.rating === 'avoid' || s.rating === 'acute')
      .reduce((sum, s) => sum + s.overlapMeters, 0);

    if (litMeters >= 100) {
      reasons.push(
        `follows ${Math.round(litMeters)}m others rated as well-lit and quiet`,
      );
    }
    if (negativeMeters >= 100) {
      reasons.push(
        `passes through ${Math.round(negativeMeters)}m others rated as unsafe`,
      );
    }

    // Then the top per-report contributors.
    const top = [...rt.scored.scored]
      .filter((s) => s.score > 0) // skip positive-report contributors here; their reasons are covered above
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    for (const r of top) {
      reasons.push(
        `avoids ${r.type === 'acute' ? 'acute' : 'environmental'} report: ${r.summary}`,
      );
    }
    if (reasons.length === 0) {
      reasons.push('no reported incidents along this path');
    }

    return {
      id: rt.id,
      polyline: rt.polyline,
      duration_min: Math.round(rt.durationSec / 60),
      distance_m: rt.distanceM,
      safety_score: Number(totalScore(rt).toFixed(4)),
      incidents_avoided: Math.max(0, fastestNearbyCount - rt.scored.scored.length),
      reasons,
    };
  });

  return NextResponse.json({
    routes: responseRoutes,
    recommended_id: responseRoutes[0]?.id ?? null,
  });
}
