import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import { classifyReport, type Classification } from '../lib/reports/classify';

type Expected = {
  type: 'acute' | 'environmental' | 'positive' | 'irrelevant';
  severity?: 'low' | 'medium' | 'high';
};

const cases: Array<{ id: number; statement: string; expected: Expected }> = [
  { id: 1, statement: "I'm being followed by two guys, they've been behind me for three blocks now", expected: { type: 'acute', severity: 'high' } },
  { id: 2, statement: "Some guy just grabbed my arm at the tram stop", expected: { type: 'acute', severity: 'high' } },
  { id: 3, statement: "I was just attacked, he tried to take my bag near Vondelpark", expected: { type: 'acute', severity: 'high' } },
  { id: 4, statement: "There's a man exposing himself in the bike tunnel", expected: { type: 'acute', severity: 'high' } },
  { id: 5, statement: "Someone is shouting threats at me right now near Damrak", expected: { type: 'acute', severity: 'high' } },
  { id: 6, statement: "A guy just whistled at me really aggressively and called me names", expected: { type: 'acute', severity: 'medium' } },
  { id: 7, statement: "Three guys cornered me near the canal but I got away", expected: { type: 'acute', severity: 'high' } },
  { id: 8, statement: "Someone keeps cycling next to me and asking where I'm going", expected: { type: 'acute', severity: 'medium' } },
  { id: 9, statement: "A man followed me out of the metro and is still nearby", expected: { type: 'acute', severity: 'high' } },
  { id: 10, statement: "Group of drunk guys yelling at me as I bike past", expected: { type: 'acute', severity: 'medium' } },
  { id: 11, statement: "Someone touched my bottom on the tram, I don't know who", expected: { type: 'acute', severity: 'high' } },
  { id: 12, statement: "Some guy made a kissing sound at me on Spuistraat", expected: { type: 'acute', severity: 'low' } },
  { id: 13, statement: "Two guys just stared at me really uncomfortably", expected: { type: 'acute', severity: 'low' } },
  { id: 14, statement: "Someone honked at me from a car and yelled something", expected: { type: 'acute', severity: 'low' } },
  { id: 15, statement: "A guy asked for my number really persistently", expected: { type: 'acute', severity: 'low' } },
  { id: 16, statement: "This bicycle tunnel is pitch black and there's no one around", expected: { type: 'environmental', severity: 'medium' } },
  { id: 17, statement: "I would never walk here alone at night, the alleys feel dangerous", expected: { type: 'environmental', severity: 'high' } },
  { id: 18, statement: "There's a really aggressive crowd hanging around the station entrance", expected: { type: 'environmental', severity: 'high' } },
  { id: 19, statement: "This area has been reported a lot, I always avoid it", expected: { type: 'environmental', severity: 'medium' } },
  { id: 20, statement: "The IJ-tunnel feels really threatening right now, lots of people loitering", expected: { type: 'environmental', severity: 'high' } },
  { id: 21, statement: "I feel watched walking through this industrial area", expected: { type: 'environmental', severity: 'medium' } },
  { id: 22, statement: "The lighting just stopped working on this whole canal stretch", expected: { type: 'environmental', severity: 'medium' } },
  { id: 23, statement: "There are men staring from a parked van here, very uncomfortable", expected: { type: 'environmental', severity: 'medium' } },
  { id: 24, statement: "This street feels off, I usually avoid it after 10pm", expected: { type: 'environmental', severity: 'medium' } },
  { id: 25, statement: "There's barely anyone around and not enough streetlights", expected: { type: 'environmental', severity: 'medium' } },
  { id: 26, statement: "The underpass at Sloterdijk always makes me nervous", expected: { type: 'environmental', severity: 'medium' } },
  { id: 27, statement: "I don't like the energy on this stretch of Damrak after closing", expected: { type: 'environmental', severity: 'medium' } },
  { id: 28, statement: "Reguliersbreestraat feels different at night, harder to read the crowd", expected: { type: 'environmental', severity: 'medium' } },
  { id: 29, statement: "Bike lane goes through a really dark park section", expected: { type: 'environmental', severity: 'medium' } },
  { id: 30, statement: "The last bit of my route home is super isolated", expected: { type: 'environmental', severity: 'medium' } },
  { id: 31, statement: "Walking past the construction site here always feels weird", expected: { type: 'environmental', severity: 'low' } },
  { id: 32, statement: "It's just a bit darker than I'd like on this street", expected: { type: 'environmental', severity: 'low' } },
  { id: 33, statement: "Probably fine but I'd prefer a more populated route", expected: { type: 'environmental', severity: 'low' } },
  { id: 34, statement: "The cobblestones are uneven and it's kind of dim", expected: { type: 'environmental', severity: 'low' } },
  { id: 35, statement: "Quiet street, I just felt a little off", expected: { type: 'environmental', severity: 'low' } },
  { id: 36, statement: "My friend got harassed here last week, just FYI", expected: { type: 'acute', severity: 'medium' } },
  { id: 37, statement: "Just got home safely, had a really chill walk through Vondelpark", expected: { type: 'positive', severity: 'low' } },
  { id: 38, statement: "Er loopt een man achter me, ik ben bang", expected: { type: 'acute', severity: 'high' } },
  { id: 39, statement: "The bike lanes are too narrow here, traffic is dangerous", expected: { type: 'irrelevant' } },
  { id: 40, statement: "Some kids on bikes were being annoying", expected: { type: 'environmental', severity: 'low' } },
];

function fmtActual(c: Classification): { type: string; severity: string; summary: string } {
  if (c.type === 'irrelevant') {
    return { type: 'irrelevant', severity: '—', summary: c.reason };
  }
  return { type: c.type, severity: c.severity, summary: c.summary };
}

async function main() {
  const results: Array<{ id: number; statement: string; expected: Expected; actual: ReturnType<typeof fmtActual>; typeMatch: boolean; severityMatch: boolean }> = [];
  let typeAgree = 0;
  let sevAgree = 0;

  for (const c of cases) {
    process.stdout.write(`[${c.id}/40] `);
    try {
      const actual = await classifyReport(c.statement);
      const fmt = fmtActual(actual);
      const typeMatch = fmt.type === c.expected.type;
      const sevMatch = !c.expected.severity || fmt.severity === c.expected.severity;
      if (typeMatch) typeAgree++;
      if (sevMatch) sevAgree++;
      results.push({ id: c.id, statement: c.statement, expected: c.expected, actual: fmt, typeMatch, severityMatch: sevMatch });
      console.log(`${typeMatch && sevMatch ? '✅' : '❌'} ${fmt.type}/${fmt.severity}`);
    } catch (e) {
      console.log('💥 ERROR', (e as Error).message);
      results.push({ id: c.id, statement: c.statement, expected: c.expected, actual: { type: 'ERROR', severity: '—', summary: (e as Error).message }, typeMatch: false, severityMatch: false });
    }
  }

  console.log('\n');
  console.log('================ RESULTS ================');
  console.log('| #  | Stmt | Expected | Actual | type ✓? | sev ✓? |');
  console.log('|----|------|----------|--------|---------|--------|');
  for (const r of results) {
    const stmt = r.statement.length > 50 ? r.statement.slice(0, 47) + '...' : r.statement;
    const exp = r.expected.severity ? `${r.expected.type}/${r.expected.severity}` : r.expected.type;
    const act = `${r.actual.type}/${r.actual.severity}`;
    console.log(`| ${String(r.id).padStart(2)} | ${stmt} | ${exp} | ${act} | ${r.typeMatch ? '✅' : '❌'} | ${r.severityMatch ? '✅' : '❌'} |`);
  }
  console.log('=========================================');
  console.log(`Type agreement: ${typeAgree}/40 (${Math.round(100 * typeAgree / 40)}%)`);
  console.log(`Severity agreement: ${sevAgree}/40 (${Math.round(100 * sevAgree / 40)}%)`);

  console.log('\n--- Disagreements (with summaries) ---');
  for (const r of results) {
    if (!r.typeMatch || !r.severityMatch) {
      const exp = r.expected.severity ? `${r.expected.type}/${r.expected.severity}` : r.expected.type;
      console.log(`\n#${r.id}: "${r.statement}"`);
      console.log(`  expected: ${exp}`);
      console.log(`  actual:   ${r.actual.type}/${r.actual.severity}`);
      console.log(`  summary:  ${r.actual.summary}`);
    }
  }
}

main();
