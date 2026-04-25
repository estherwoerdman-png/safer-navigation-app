import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from './client';
import seeds from '../../seeds/amsterdam-reports.json' with { type: 'json' };

type Seed = {
  lat: number;
  lng: number;
  transcript: string;
  type: 'acute' | 'environmental';
  severity: 'low' | 'medium' | 'high';
  summary: string;
  hours_ago: number;
};

async function main() {
  console.log(`Seeding ${seeds.length} reports...`);

  // Clear previous seed rows so re-runs are idempotent
  await db.execute(sql`DELETE FROM reports WHERE source = 'seed'`);

  for (const s of seeds as Seed[]) {
    const reportedAt = new Date(Date.now() - s.hours_ago * 3600 * 1000);
    await db.execute(sql`
      INSERT INTO reports (location, reported_at, transcript, type, severity, summary, source)
      VALUES (
        ST_SetSRID(ST_MakePoint(${s.lng}, ${s.lat}), 4326)::geography,
        ${reportedAt.toISOString()},
        ${s.transcript},
        ${s.type},
        ${s.severity},
        ${s.summary},
        'seed'
      )
    `);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
