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
import { generateReasons, type RouteContext } from '@/lib/routing/generate-reasons';

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

  // Build per-route context for the LLM-generated reasons (fired in parallel
  // with template construction; we pick whichever pans out).
  const contexts: RouteContext[] = ranked.map((rt, idx) => {
    const litQuietMeters = rt.feedback.scored
      .filter((s) => s.rating === 'lit_quiet')
      .reduce((sum, s) => sum + s.overlapMeters, 0);
    const unsafeRatedMeters = rt.feedback.scored
      .filter((s) => s.rating === 'avoid' || s.rating === 'acute')
      .reduce((sum, s) => sum + s.overlapMeters, 0);
    const topReports = [...rt.scored.scored]
      .filter((s) => Math.abs(s.score) > 0)
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 3)
      .map((s) => ({ type: s.type, severity: s.severity, summary: s.summary }));
    return {
      id: rt.id,
      rank: idx,
      duration_min: Math.round(rt.durationSec / 60),
      distance_m: rt.distanceM,
      topReports,
      litQuietMeters: Math.round(litQuietMeters),
      unsafeRatedMeters: Math.round(unsafeRatedMeters),
    };
  });

  const llmReasons = await generateReasons(contexts);

  const responseRoutes = ranked.map((rt) => {
    // Compute template reasons up-front as the fallback path.
    const templateReasons: string[] = [];
    const litMeters = rt.feedback.scored
      .filter((s) => s.rating === 'lit_quiet')
      .reduce((sum, s) => sum + s.overlapMeters, 0);
    const negativeMeters = rt.feedback.scored
      .filter((s) => s.rating === 'avoid' || s.rating === 'acute')
      .reduce((sum, s) => sum + s.overlapMeters, 0);
    if (litMeters >= 100) {
      templateReasons.push(
        `follows ${Math.round(litMeters)}m others rated as well-lit and quiet`,
      );
    }
    if (negativeMeters >= 100) {
      templateReasons.push(
        `passes through ${Math.round(negativeMeters)}m others rated as unsafe`,
      );
    }
    const top = [...rt.scored.scored]
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    for (const r of top) {
      templateReasons.push(
        `avoids ${r.type === 'acute' ? 'acute' : 'environmental'} report: ${r.summary}`,
      );
    }
    if (templateReasons.length === 0) {
      templateReasons.push('no reported incidents along this path');
    }

    const reasons = llmReasons?.get(rt.id) ?? templateReasons;

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
