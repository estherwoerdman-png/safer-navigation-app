import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    report_id?: string;
    agree?: boolean;
    responder_loc?: { lat: number; lng: number };
  };

  if (!body.report_id || typeof body.agree !== 'boolean' ||
      !body.responder_loc ||
      typeof body.responder_loc.lat !== 'number' ||
      typeof body.responder_loc.lng !== 'number') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  await db.execute(sql`
    INSERT INTO feedback_responses (report_id, agree, responder_loc)
    VALUES (
      ${body.report_id},
      ${body.agree ? 'true' : 'false'},
      ST_SetSRID(ST_MakePoint(${body.responder_loc.lng}, ${body.responder_loc.lat}), 4326)::geography
    )
  `);

  return NextResponse.json({ ok: true });
}
