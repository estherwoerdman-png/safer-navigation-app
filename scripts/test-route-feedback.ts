import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const HOST = process.env.TEST_HOST ?? 'http://localhost:3000';

async function getRoutes() {
  const r = await fetch(`${HOST}/api/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: { lat: 52.3667, lng: 4.892 },
      destination: { lat: 52.3791, lng: 4.9 },
      mode: 'walking',
    }),
  });
  return (await r.json()) as {
    routes: Array<{ id: string; polyline: string; duration_min: number; safety_score: number; reasons: string[] }>;
    recommended_id: string | null;
  };
}

function fmt(routes: ReturnType<typeof getRoutes> extends Promise<infer R> ? R : never) {
  return routes.routes
    .map((r) => `  ${r.id}: ${r.duration_min}min  score=${r.safety_score}  ${r.reasons[0] ?? ''}`)
    .join('\n');
}

async function postFeedback(polyline: string, rating: 'lit_quiet' | 'caution' | 'avoid' | 'acute') {
  const r = await fetch(`${HOST}/api/route-feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ polyline, rating, duration_min: 23, mode: 'walking' }),
  });
  return r.json();
}

async function main() {
  console.log('=== baseline /api/route ===');
  const before = await getRoutes();
  console.log(fmt(before));
  console.log(`recommended: ${before.recommended_id}`);

  // Find the fastest route by duration_min — we'll mark it as 'avoid'.
  const fastest = [...before.routes].sort((a, b) => a.duration_min - b.duration_min)[0];
  console.log(`\n=== marking the fastest route (${fastest.id}, ${fastest.duration_min}min) as avoid ===`);
  const fbResult = await postFeedback(fastest.polyline, 'avoid');
  console.log('feedback POST:', fbResult);

  // Wait a moment for DB write to settle.
  await new Promise((r) => setTimeout(r, 200));

  console.log('\n=== second /api/route — same origin/dest ===');
  const after = await getRoutes();
  console.log(fmt(after));
  console.log(`recommended: ${after.recommended_id}`);

  // Score delta on the just-rated route.
  const fastestBefore = before.routes.find((r) => r.id === fastest.id);
  const fastestAfter = after.routes.find((r) => r.id === fastest.id);
  if (fastestBefore && fastestAfter) {
    const delta = fastestAfter.safety_score - fastestBefore.safety_score;
    console.log(`\nFastest-route score delta: ${fastestBefore.safety_score} → ${fastestAfter.safety_score}  (Δ ${delta.toFixed(4)})`);
    if (delta > 0.1) {
      console.log('✅ SUCCESS — fastest route now scored higher (worse) thanks to the avoid rating.');
    } else {
      console.log('⚠️  No score change. Polyline buffer overlap may have been below threshold; widen ST_Buffer or lower the 20m floor in the API.');
    }
  }

  console.log('\n=== now mark the safer route as lit_quiet ===');
  const safer = before.routes[0]; // recommended (lowest score)
  const fbResult2 = await postFeedback(safer.polyline, 'lit_quiet');
  console.log('feedback POST:', fbResult2);

  await new Promise((r) => setTimeout(r, 200));

  console.log('\n=== third /api/route ===');
  const final = await getRoutes();
  console.log(fmt(final));
  console.log(`recommended: ${final.recommended_id}`);

  // Cleanup: remove the test route_feedback rows so we don't pollute the DB.
  console.log('\n=== cleanup ===');
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL!);
  const r = await sql`DELETE FROM route_feedback WHERE rating IN ('avoid', 'lit_quiet') AND rated_at > NOW() - INTERVAL '5 minutes' RETURNING id`;
  console.log(`Deleted ${r.length} test rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
