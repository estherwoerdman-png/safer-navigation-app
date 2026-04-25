import { describe, it, expect } from 'vitest';
import {
  scoreReports,
  scoreRouteFeedback,
  type ReportLite,
  type RouteFeedbackOverlap,
} from '@/lib/routing/score';

const now = new Date('2026-04-25T12:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe('scoreReports', () => {
  it('returns 0 when no reports are nearby', () => {
    const result = scoreReports({ nearby: [], routeLengthKm: 1.5, now });
    expect(result.safetyScore).toBe(0);
    expect(result.scored).toHaveLength(0);
  });

  it('weights acute-high reports more than environmental-low', () => {
    const acute: ReportLite = {
      id: 'a',
      type: 'acute',
      severity: 'high',
      reportedAt: minutesAgo(60),
      distanceMeters: 10,
      summary: 'followed',
      agreeRatio: 0,
    };
    const env: ReportLite = {
      id: 'e',
      type: 'environmental',
      severity: 'low',
      reportedAt: minutesAgo(60),
      distanceMeters: 10,
      summary: 'dim',
      agreeRatio: 0,
    };
    const r = scoreReports({ nearby: [acute, env], routeLengthKm: 1, now });
    const ac = r.scored.find((s) => s.id === 'a')!;
    const en = r.scored.find((s) => s.id === 'e')!;
    expect(ac.score).toBeGreaterThan(en.score * 5);
  });

  it('decays acute reports over time but not environmental', () => {
    const fresh: ReportLite = {
      id: 'f',
      type: 'acute',
      severity: 'medium',
      reportedAt: minutesAgo(0),
      distanceMeters: 10,
      summary: '',
      agreeRatio: 0,
    };
    const old: ReportLite = {
      ...fresh,
      id: 'o',
      reportedAt: minutesAgo(72 * 60),
    };
    const r = scoreReports({ nearby: [fresh, old], routeLengthKm: 1, now });
    const f = r.scored.find((s) => s.id === 'f')!;
    const o = r.scored.find((s) => s.id === 'o')!;
    expect(o.score).toBeLessThan(f.score / 2);
  });

  it('falls off with distance', () => {
    const close: ReportLite = {
      id: 'c',
      type: 'acute',
      severity: 'medium',
      reportedAt: minutesAgo(0),
      distanceMeters: 5,
      summary: '',
      agreeRatio: 0,
    };
    const far: ReportLite = {
      ...close,
      id: 'f',
      distanceMeters: 30,
    };
    const r = scoreReports({ nearby: [close, far], routeLengthKm: 1, now });
    const c = r.scored.find((s) => s.id === 'c')!;
    const fr = r.scored.find((s) => s.id === 'f')!;
    expect(c.score).toBeGreaterThan(fr.score);
  });

  it('amplifies score when feedback agrees', () => {
    const noFeedback: ReportLite = {
      id: 'n',
      type: 'environmental',
      severity: 'medium',
      reportedAt: minutesAgo(0),
      distanceMeters: 10,
      summary: '',
      agreeRatio: 0,
    };
    const agreed: ReportLite = { ...noFeedback, id: 'a', agreeRatio: 1.0 };
    const r = scoreReports({ nearby: [noFeedback, agreed], routeLengthKm: 1, now });
    const n = r.scored.find((s) => s.id === 'n')!;
    const a = r.scored.find((s) => s.id === 'a')!;
    expect(a.score).toBeCloseTo(n.score * 1.5, 5);
  });

  it('normalizes by route length', () => {
    const reports: ReportLite[] = [
      {
        id: 'r',
        type: 'acute',
        severity: 'high',
        reportedAt: minutesAgo(0),
        distanceMeters: 10,
        summary: '',
        agreeRatio: 0,
      },
    ];
    const short = scoreReports({ nearby: reports, routeLengthKm: 1, now });
    const long = scoreReports({ nearby: reports, routeLengthKm: 5, now });
    expect(long.safetyScore).toBeCloseTo(short.safetyScore / 5, 5);
  });

  it('positive reports reduce the safety score', () => {
    const positive: ReportLite = {
      id: 'p',
      type: 'positive',
      severity: 'low',
      reportedAt: minutesAgo(0),
      distanceMeters: 10,
      summary: 'felt safe',
      agreeRatio: 0,
    };
    const r = scoreReports({ nearby: [positive], routeLengthKm: 1, now });
    expect(r.safetyScore).toBeLessThan(0);
  });

  it('three positives offset one medium environmental at the same point', () => {
    const env: ReportLite = {
      id: 'e',
      type: 'environmental',
      severity: 'medium',
      reportedAt: minutesAgo(0),
      distanceMeters: 10,
      summary: '',
      agreeRatio: 0,
    };
    const positives: ReportLite[] = [1, 2, 3].map((i) => ({
      id: `p${i}`,
      type: 'positive',
      severity: 'low',
      reportedAt: minutesAgo(0),
      distanceMeters: 10,
      summary: '',
      agreeRatio: 0,
    }));
    const r = scoreReports({ nearby: [env, ...positives], routeLengthKm: 1, now });
    // env contributes +3 × 1 × 1 = +3; each positive contributes 1 × -1 × 1 = -1.
    // Net: ~0. distance falloff is the same factor for both groups.
    expect(r.safetyScore).toBeCloseTo(0, 5);
  });

  it('high-acute dominates many positives (40+ positives needed to offset)', () => {
    const acute: ReportLite = {
      id: 'a',
      type: 'acute',
      severity: 'high',
      reportedAt: minutesAgo(0),
      distanceMeters: 10,
      summary: '',
      agreeRatio: 0,
    };
    const positives: ReportLite[] = Array.from({ length: 30 }, (_, i) => ({
      id: `p${i}`,
      type: 'positive',
      severity: 'low',
      reportedAt: minutesAgo(0),
      distanceMeters: 10,
      summary: '',
      agreeRatio: 0,
    }));
    const r = scoreReports({ nearby: [acute, ...positives], routeLengthKm: 1, now });
    // acute = 10 × 4 = 40; 30 positives = 30 × -1 = -30. Net: +10.
    expect(r.safetyScore).toBeGreaterThan(0);
  });

  it('positive reports do not decay over time', () => {
    const fresh: ReportLite = {
      id: 'f',
      type: 'positive',
      severity: 'low',
      reportedAt: minutesAgo(0),
      distanceMeters: 10,
      summary: '',
      agreeRatio: 0,
    };
    const old: ReportLite = { ...fresh, id: 'o', reportedAt: minutesAgo(72 * 60) };
    const r = scoreReports({ nearby: [fresh, old], routeLengthKm: 1, now });
    const f = r.scored.find((s) => s.id === 'f')!;
    const o = r.scored.find((s) => s.id === 'o')!;
    expect(o.score).toBeCloseTo(f.score, 5);
  });
});

describe('scoreRouteFeedback', () => {
  it('returns 0 when no overlaps', () => {
    const r = scoreRouteFeedback({ overlaps: [], routeLengthKm: 1 });
    expect(r.feedbackScore).toBe(0);
    expect(r.scored).toHaveLength(0);
  });

  it('penalizes avoid-rated overlaps proportionally to length', () => {
    const o100: RouteFeedbackOverlap = { overlapMeters: 100, rating: 'avoid' };
    const o200: RouteFeedbackOverlap = { overlapMeters: 200, rating: 'avoid' };
    const r1 = scoreRouteFeedback({ overlaps: [o100], routeLengthKm: 1 });
    const r2 = scoreRouteFeedback({ overlaps: [o200], routeLengthKm: 1 });
    expect(r2.feedbackScore).toBeCloseTo(r1.feedbackScore * 2, 5);
  });

  it('weights acute heaviest, then avoid, then caution', () => {
    const same = (rating: RouteFeedbackOverlap['rating']) =>
      scoreRouteFeedback({
        overlaps: [{ overlapMeters: 100, rating }],
        routeLengthKm: 1,
      }).feedbackScore;

    expect(same('acute')).toBeGreaterThan(same('avoid'));
    expect(same('avoid')).toBeGreaterThan(same('caution'));
    expect(same('caution')).toBeGreaterThan(0);
  });

  it('rewards lit_quiet overlaps with a NEGATIVE score', () => {
    const r = scoreRouteFeedback({
      overlaps: [{ overlapMeters: 200, rating: 'lit_quiet' }],
      routeLengthKm: 1,
    });
    expect(r.feedbackScore).toBeLessThan(0);
  });

  it('lit_quiet and avoid can offset each other', () => {
    const balanced = scoreRouteFeedback({
      overlaps: [
        { overlapMeters: 500, rating: 'lit_quiet' }, // -3 × 5 = -15
        { overlapMeters: 300, rating: 'avoid' }, // +5 × 3 = +15
      ],
      routeLengthKm: 1,
    });
    expect(balanced.feedbackScore).toBeCloseTo(0, 5);
  });

  it('normalizes by route length', () => {
    const overlaps: RouteFeedbackOverlap[] = [
      { overlapMeters: 200, rating: 'avoid' },
    ];
    const short = scoreRouteFeedback({ overlaps, routeLengthKm: 1 });
    const long = scoreRouteFeedback({ overlaps, routeLengthKm: 5 });
    expect(long.feedbackScore).toBeCloseTo(short.feedbackScore / 5, 5);
  });
});
