export type ReportLite = {
  id: string;
  type: 'acute' | 'environmental' | 'positive';
  severity: 'low' | 'medium' | 'high';
  reportedAt: Date;
  distanceMeters: number;
  summary: string;
  /** 0..1 — share of "yes" responses to "did you feel this too?" */
  agreeRatio: number;
};

export type ScoredReport = ReportLite & { score: number };

export type ScoreResult = {
  /** Lower is safer. Already normalized by route length.
   *  Can be negative when positive reports outweigh concerns — that's OK,
   *  the routing endpoint just sorts ascending. */
  safetyScore: number;
  scored: ScoredReport[];
};

const SEVERITY_W: Record<ReportLite['severity'], number> = { low: 1, medium: 3, high: 10 };
/** Type weights. Positive is negative-signed so it REDUCES the safety score —
 *  needed to counter popularity bias (popular routes accumulate more reports of
 *  every kind; we want positives to offset the inflated negative count). */
const TYPE_W: Record<ReportLite['type'], number> = {
  environmental: 1,
  acute: 4,
  positive: -1,
};

/** Acute: half-life ≈ 50h (e^(-72/72) = 0.37). Environmental + positive: never decays. */
function timeDecay(report: ReportLite, now: Date): number {
  if (report.type !== 'acute') return 1.0;
  const hours = (now.getTime() - report.reportedAt.getTime()) / 3_600_000;
  return Math.exp(-hours / 72);
}

/** 1 / (1 + (d/30)^2) — falloff with distance, smooth, 1.0 at 0m, 0.5 at 30m. */
function distanceFalloff(distanceMeters: number): number {
  const x = distanceMeters / 30;
  return 1 / (1 + x * x);
}

export function scoreReports(args: {
  nearby: ReportLite[];
  routeLengthKm: number;
  now?: Date;
}): ScoreResult {
  const now = args.now ?? new Date();
  const scored: ScoredReport[] = args.nearby.map((r) => {
    const base = SEVERITY_W[r.severity] * TYPE_W[r.type];
    const decay = timeDecay(r, now);
    const dist = distanceFalloff(r.distanceMeters);
    const fb = 1 + 0.5 * r.agreeRatio;
    return { ...r, score: base * decay * dist * fb };
  });
  const sum = scored.reduce((acc, s) => acc + s.score, 0);
  const safetyScore = args.routeLengthKm > 0 ? sum / args.routeLengthKm : sum;
  return { safetyScore, scored };
}

/** Per-rating weight used to score route_feedback overlaps. */
export const ROUTE_FEEDBACK_W: Record<RouteFeedbackOverlap['rating'], number> = {
  lit_quiet: -3, // rewards: subtracts from score
  caution: 1,
  avoid: 5,
  acute: 15,
};

export type RouteFeedbackOverlap = {
  /** How many meters of the candidate polyline lie within ~30m of a rated polyline. */
  overlapMeters: number;
  rating: 'lit_quiet' | 'caution' | 'avoid' | 'acute';
};

export type ScoredFeedback = RouteFeedbackOverlap & { score: number };

export type FeedbackResult = {
  /** Already normalized by route length. Negative means the route is well-rated. */
  feedbackScore: number;
  scored: ScoredFeedback[];
};

/**
 * Score how the *crowd's prior route ratings* apply to a candidate route.
 * Pure function — overlapMeters comes from a PostGIS query upstream.
 *
 * Per-100m units to keep numbers in the same magnitude as report scoring:
 * a 200m overlap of an 'avoid'-rated path → 200/100 × 5 = 10 raw points,
 * roughly equivalent to a single fresh medium-acute report at ~30m distance.
 */
export function scoreRouteFeedback(args: {
  overlaps: RouteFeedbackOverlap[];
  routeLengthKm: number;
}): FeedbackResult {
  const scored: ScoredFeedback[] = args.overlaps.map((o) => ({
    ...o,
    score: (o.overlapMeters / 100) * ROUTE_FEEDBACK_W[o.rating],
  }));
  const sum = scored.reduce((acc, s) => acc + s.score, 0);
  const feedbackScore = args.routeLengthKm > 0 ? sum / args.routeLengthKm : sum;
  return { feedbackScore, scored };
}
