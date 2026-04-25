import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { classifyReport } from '@/lib/reports/classify';

// In-memory rate limit. Hackathon-grade; resets on deploy.
const lastByIp = new Map<string, number>();
const MIN_INTERVAL_MS = 30_000;

export async function POST(req: NextRequest) {
  let body: { transcript?: string; lat?: number; lng?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const transcript = (body.transcript ?? '').trim();
  const { lat, lng } = body;

  if (!transcript || transcript.length < 4) {
    return NextResponse.json({ error: 'transcript_too_short' }, { status: 400 });
  }
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'missing_location' }, { status: 400 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const now = Date.now();
  const last = lastByIp.get(ip) ?? 0;
  if (now - last < MIN_INTERVAL_MS) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  lastByIp.set(ip, now);

  const cls = await classifyReport(transcript);

  if (cls.type === 'irrelevant') {
    // Don't store; tell the user kindly. Rate-limit slot already consumed,
    // which is fine — protects from spam-classifying random text.
    return NextResponse.json(
      { accepted: false, reason: cls.reason },
      { status: 200 },
    );
  }

  const inserted = await db.execute(sql`
    INSERT INTO reports (location, transcript, type, severity, summary, source)
    VALUES (
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ${transcript},
      ${cls.type},
      ${cls.severity},
      ${cls.summary},
      'user'
    )
    RETURNING id, reported_at
  `);

  return NextResponse.json({
    accepted: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    id: (inserted as any).rows[0].id,
    type: cls.type,
    severity: cls.severity,
    summary: cls.summary,
  });
}
