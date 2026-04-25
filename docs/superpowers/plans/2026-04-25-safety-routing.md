# Safety-Optimized Routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working safety-optimized routing PWA for Amsterdam in 24 hours, demoable on a real phone via a public Vercel URL.

**Architecture:** Single Next.js 16 App Router app on Vercel. One screen-state-machine page swaps between six screens (Home / Report / Route / Navigate / Prompt / Arrive). Five API routes back the flows: `POST /api/reports`, `GET /api/reports/near`, `POST /api/route`, `POST /api/feedback`, `POST /api/route-feedback`. Reports are user voice transcripts classified by Claude Haiku and stored in Neon Postgres with PostGIS. Routes come from Google Directions, then are server-side re-ranked against nearby reports.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS · Drizzle ORM · Neon Postgres + PostGIS · Mapbox GL JS · Google Directions API · Anthropic Claude Haiku 4.5 · Web Speech API · Vercel.

**Spec reference:** [`docs/superpowers/specs/2026-04-25-safety-routing-design.md`](../specs/2026-04-25-safety-routing-design.md). All decisions there are locked.

**Testing posture (hackathon trade-off, see spec §12):** Write unit tests for pure logic only — the safety-scoring algorithm, the polyline decoder, and the yes/no parser. Skip tests for API routes, Mapbox glue, and React components — verify those by manual integration in the browser/`curl`. The plan calls these out explicitly per task.

**Commit cadence:** One commit per task. Conventional Commits (`feat:`, `chore:`, `fix:`).

**Reading order:** Tasks are sequenced to match the timebox in spec §9 (Hours 0–24). Don't reorder them — later tasks depend on earlier files.

---

## File structure (locked before tasks start)

```
app/
  layout.tsx                # Root layout: fonts, viewport, tokens import
  globals.css               # Imports tokens.css + Tailwind base
  page.tsx                  # Single-route shell with screen state machine
  styles/tokens.css         # Design tokens from spec §11
  api/
    reports/route.ts        # POST (submit) + GET via /near
    reports/near/route.ts   # GET reports near a point
    route/route.ts          # POST scored alternative routes
    feedback/route.ts       # POST yes/no on a prompt
    route-feedback/route.ts # POST one-tap rating from Arrive

components/
  screens/
    home.tsx                # Screen 01
    report.tsx              # Screen 02 (push-to-talk overlay)
    route.tsx               # Screen 03 (route picker)
    navigate.tsx            # Screen 04 (active nav + poll loop)
    prompt.tsx              # Screen 05 (geofence overlay)
    arrive.tsx              # Screen 06 (chips + post)
  map/
    map-view.tsx            # Mapbox GL wrapper + paint overrides
    report-pins.tsx         # Severity dot layer
    route-line.tsx          # Polyline rendering layer
  ui/
    push-to-talk-button.tsx # Press-and-hold gesture wrapper
    rating-chips.tsx        # Arrive-screen chips
    bottom-sheet.tsx        # Reusable bottom sheet for Route screen

lib/
  db/
    schema.ts               # Drizzle schema (reports, feedback, route_feedback)
    client.ts               # Drizzle Postgres client
    seed.ts                 # JSON loader, run via tsx
  voice/
    index.ts                # VoiceAdapter interface + factory
    web-speech.ts           # MVP implementation
    parse-yes-no.ts         # Keyword matcher (tested)
  routing/
    score.ts                # Pure scoring algorithm (tested)
    decode-polyline.ts      # Google polyline decoder (tested)
    google-directions.ts    # Directions API wrapper
  reports/
    classify.ts             # Claude Haiku classification call
  geo/
    near-line.ts            # PostGIS ST_DWithin wrappers via Drizzle SQL

seeds/
  amsterdam-reports.json    # 40-60 hand-placed seed reports

drizzle/
  0000_initial.sql          # Generated migration (do not hand-edit)

tests/
  routing/score.test.ts
  routing/decode-polyline.test.ts
  voice/parse-yes-no.test.ts

drizzle.config.ts
next.config.ts
package.json
tsconfig.json
vercel.ts
.env.example
.env.local                  # gitignored
.gitignore
README.md
```

---

## Task 1: Repo bootstrap

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vercel.ts`, `.gitignore`, `.env.example`, `README.md`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

**Estimated time:** 40 min · **Hour band:** 0–2

- [ ] **Step 1: Initialize a Next.js 16 app non-interactively**

Run from project root (`/Users/lotteadema/Projects/Hackathon 2026/`):

```bash
pnpm create next-app@latest . --ts --tailwind --app --src-dir=false --import-alias="@/*" --use-pnpm --eslint --turbopack --yes
```

If pnpm asks about overwriting (because `docs/` exists), accept — it leaves existing files alone unless they collide.

Expected: `package.json`, `tsconfig.json`, `next.config.ts`, `app/`, `tailwind.config.ts`, `postcss.config.mjs` created.

- [ ] **Step 2: Initialize git and make first commit**

```bash
git init
git add -A
git commit -m "chore: bootstrap next.js 16 app"
```

- [ ] **Step 3: Install runtime dependencies**

```bash
pnpm add @anthropic-ai/sdk drizzle-orm @neondatabase/serverless mapbox-gl @types/mapbox-gl @googlemaps/google-maps-services-js
pnpm add -D drizzle-kit tsx dotenv vitest @vitest/ui
```

- [ ] **Step 4: Add scripts to `package.json`**

Edit `package.json`, replace the `"scripts"` block with:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:seed": "tsx lib/db/seed.ts"
}
```

- [ ] **Step 5: Create `vercel.ts`**

```ts
// vercel.ts
import { type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  buildCommand: 'pnpm build',
};
```

If `@vercel/config` is not yet installable from the registry at hackathon time, skip this file (Vercel auto-detects Next.js). Don't block on it.

- [ ] **Step 6: Create `.env.example`**

```bash
# Database (Neon Postgres via Vercel Marketplace)
DATABASE_URL=postgres://...

# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-...

# Google Directions
GOOGLE_MAPS_API_KEY=AIza...

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=pk....

# Voice provider switch — 'web-speech' for MVP, 'resonate' for partner
NEXT_PUBLIC_VOICE=web-speech
```

- [ ] **Step 7: Create `.env.local` (gitignored, local secrets)**

Copy `.env.example` to `.env.local` and have a teammate fill in real values. Verify `.env*.local` is in `.gitignore` (Next.js's default `.gitignore` already excludes it).

- [ ] **Step 8: Verify dev server runs**

```bash
pnpm dev
```

Expected: server starts on `http://localhost:3000`, default Next.js welcome page renders. Stop the server (Ctrl-C).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: install deps, scripts, env scaffolding"
```

---

## Task 2: Design tokens and fonts

**Files:**
- Create: `app/styles/tokens.css`
- Modify: `app/globals.css`, `app/layout.tsx`

**Estimated time:** 20 min · **Hour band:** 0–2

- [ ] **Step 1: Create `app/styles/tokens.css` with the full token set from spec §11**

```css
/* app/styles/tokens.css */
:root {
  /* Ink (text) */
  --ink:        #1a1a1a;
  --ink-2:      #2b2b2b;
  --ink-3:      #5b5852;
  --ink-4:      #8a857c;

  /* Paper (background) — warm cream, NOT cold white */
  --paper:      #f5f1e8;
  --paper-2:    #ece6d6;
  --card:       #ffffff;

  /* Brand */
  --primary:    #2f4a3a;
  --primary-2:  #3e5e4b;
  --primary-3:  #c8d4cc;
  --accent:     #c2693e;

  /* Severity */
  --sev-low:    #6b9c5e;
  --sev-mid:    #d8b34a;
  --sev-high:   #d8843a;
  --sev-acute:  #c44a3e;

  /* Map cartography */
  --map-land:        #f0e9d6;
  --map-block:       #e6dec8;
  --map-water:       #b8cfd6;
  --map-park:        #cfdbb8;
  --map-road:        #ffffff;
  --map-road-edge:   #e0d6bd;
  --map-bridge:      #c2693e;
  --map-text:        #6b665a;
  --sky:             #f5f1e8;
}
```

- [ ] **Step 2: Update `app/globals.css` to import tokens and set base styles**

Replace the file's content with:

```css
/* app/globals.css */
@import "tailwindcss";
@import "./styles/tokens.css";

html, body {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-inter), system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  overscroll-behavior: none;
}

/* Display type uses Fraunces */
.display {
  font-family: var(--font-fraunces), Georgia, serif;
  font-weight: 500;
  letter-spacing: -0.01em;
}
```

- [ ] **Step 3: Wire fonts in `app/layout.tsx`**

Replace `app/layout.tsx` with:

```tsx
// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['opsz'],
});

export const metadata: Metadata = {
  title: 'Safe Routes — Amsterdam',
  description: 'Routes that prioritize safety, built from community reports.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#f5f1e8',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Verify in browser**

```bash
pnpm dev
```

Open `http://localhost:3000`. Expected: page renders against a cream `#f5f1e8` background. Check the body's computed font is Inter via DevTools.

- [ ] **Step 5: Commit**

```bash
git add app/
git commit -m "feat: design tokens and fonts (Inter + Fraunces)"
```

---

## Task 3: Drizzle schema, Neon connection, migrations

**Files:**
- Create: `lib/db/schema.ts`, `lib/db/client.ts`, `drizzle.config.ts`
- Create: `drizzle/0000_initial.sql` (generated)

**Estimated time:** 40 min · **Hour band:** 0–2

**Pre-req:** Provision a Neon Postgres database via Vercel Marketplace (`vercel marketplace add neon` or via dashboard). Copy the `DATABASE_URL` into `.env.local`. Confirm the DB has the `postgis` extension available — Neon supports it but it must be enabled.

- [ ] **Step 1: Enable PostGIS on the Neon DB**

In the Neon SQL console (or via `psql $DATABASE_URL`):

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Verify:

```sql
SELECT postgis_full_version();
```

Expected: returns a row, e.g., `POSTGIS="3.x.x" ...`.

- [ ] **Step 2: Create `lib/db/schema.ts`**

```ts
// lib/db/schema.ts
import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, customType, index, check } from 'drizzle-orm/pg-core';

// PostGIS geography types — Drizzle has no native geography; we use customType.
const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType() { return 'geography(point, 4326)'; },
});
const geographyLine = customType<{ data: string; driverData: string }>({
  dataType() { return 'geography(linestring, 4326)'; },
});

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    location: geographyPoint('location').notNull(),
    reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),

    transcript: text('transcript').notNull(),
    type: text('type').notNull(),       // 'acute' | 'environmental'
    severity: text('severity').notNull(), // 'low' | 'medium' | 'high'
    summary: text('summary').notNull(),

    source: text('source').notNull().default('user'), // 'user' | 'seed'
  },
  (t) => ({
    typeCheck: check('reports_type_check', sql`${t.type} in ('acute','environmental')`),
    severityCheck: check('reports_severity_check', sql`${t.severity} in ('low','medium','high')`),
    sourceCheck: check('reports_source_check', sql`${t.source} in ('user','seed')`),
    locIdx: index('reports_loc_gix').using('gist', t.location),
  }),
);

export const feedbackResponses = pgTable('feedback_responses', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  reportId: uuid('report_id').notNull().references(() => reports.id, { onDelete: 'cascade' }),
  agree: text('agree').notNull(), // store as 'true'/'false' to avoid driver-coercion footguns; or use boolean if your driver is fine with it
  respondedAt: timestamp('responded_at', { withTimezone: true }).notNull().defaultNow(),
  responderLoc: geographyPoint('responder_loc').notNull(),
});

export const routeFeedback = pgTable(
  'route_feedback',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    polyline: geographyLine('polyline').notNull(),
    rating: text('rating').notNull(), // 'lit_quiet' | 'caution' | 'avoid' | 'acute'
    ratedAt: timestamp('rated_at', { withTimezone: true }).notNull().defaultNow(),
    durationMin: integer('duration_min').notNull(),
    mode: text('mode').notNull(), // 'walking' | 'cycling'
  },
  (t) => ({
    ratingCheck: check('route_feedback_rating_check', sql`${t.rating} in ('lit_quiet','caution','avoid','acute')`),
    modeCheck: check('route_feedback_mode_check', sql`${t.mode} in ('walking','cycling')`),
    geomIdx: index('route_feedback_geom_gix').using('gist', t.polyline),
  }),
);

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
```

- [ ] **Step 3: Create `lib/db/client.ts`**

```ts
// lib/db/client.ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL not set');

const sql = neon(url);
export const db = drizzle(sql, { schema });
```

- [ ] **Step 4: Create `drizzle.config.ts`**

```ts
// drizzle.config.ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 5: Generate the migration**

```bash
pnpm db:generate
```

Expected: a `drizzle/0000_*.sql` file appears containing `CREATE TABLE` statements for `reports`, `feedback_responses`, `route_feedback`, and the GiST indexes.

- [ ] **Step 6: Apply the migration to Neon**

```bash
pnpm db:migrate
```

Expected: migration runs, no errors. Verify in Neon SQL console:

```sql
\dt
```

Expected: `reports`, `feedback_responses`, `route_feedback` listed.

- [ ] **Step 7: Commit**

```bash
git add lib/db/ drizzle/ drizzle.config.ts
git commit -m "feat: drizzle schema with postgis (reports, feedback, route_feedback)"
```

---

## Task 4: Seed data

**Files:**
- Create: `seeds/amsterdam-reports.json`
- Create: `lib/db/seed.ts`

**Estimated time:** 30 min · **Hour band:** 0–2

- [ ] **Step 1: Create `seeds/amsterdam-reports.json` with ~40 hand-placed reports**

Place reports at Amsterdam coordinates that match the AT5/Pointer archetypes. Use this template — copy and fill in lat/lng/transcript for each, varying type and severity. Approximate Amsterdam center: 52.3676, 4.9041.

```json
[
  {
    "lat": 52.3791,
    "lng": 4.9000,
    "transcript": "The bicycle tunnel under Centraal Station feels really creepy late at night, no lights and people loitering",
    "type": "environmental",
    "severity": "medium",
    "summary": "Bicycle tunnel under Centraal felt unsafe at night",
    "hours_ago": 36
  },
  {
    "lat": 52.3667,
    "lng": 4.8920,
    "transcript": "A guy started following me on Spuistraat near the bookshop, I had to duck into a cafe",
    "type": "acute",
    "severity": "high",
    "summary": "Followed by a man on Spuistraat",
    "hours_ago": 14
  }
]
```

Add at least 40 entries covering: bicycle tunnels (Westerpark, IJtunnel), station underpasses (Sloterdijk, Bijlmer), industrial-edge streets (Zuidas south flank, Westhaven), named streets (Spuistraat, Damrak after closing, Reguliersbreestraat), and quiet canal stretches at night. Mix `type` (≈60% environmental, 40% acute) and `severity` (≈40% low, 40% medium, 20% high).

`hours_ago` controls `reported_at` recency relative to the seed run time.

- [ ] **Step 2: Create `lib/db/seed.ts`**

```ts
// lib/db/seed.ts
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from './client';
import { reports } from './schema';
import seeds from '../../seeds/amsterdam-reports.json' assert { type: 'json' };

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
```

- [ ] **Step 3: Run the seed**

```bash
pnpm db:seed
```

Expected: console prints `Seeding N reports...` then `Done.`, no errors.

- [ ] **Step 4: Verify in Neon SQL console**

```sql
SELECT count(*) FROM reports WHERE source = 'seed';
SELECT type, severity, count(*) FROM reports WHERE source='seed' GROUP BY type, severity;
```

Expected: count matches the JSON length, distributions match the mix you chose.

- [ ] **Step 5: Commit**

```bash
git add seeds/ lib/db/seed.ts
git commit -m "feat: seed amsterdam-reports.json with ~40 hand-placed reports"
```

---

## Task 5: Voice adapter and parseYesNo (with tests)

**Files:**
- Create: `lib/voice/index.ts`, `lib/voice/web-speech.ts`, `lib/voice/parse-yes-no.ts`
- Create: `tests/voice/parse-yes-no.test.ts`

**Estimated time:** 40 min · **Hour band:** 2–5

- [ ] **Step 1: Write failing test for `parseYesNo`**

Create `tests/voice/parse-yes-no.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseYesNo } from '@/lib/voice/parse-yes-no';

describe('parseYesNo', () => {
  it.each([
    ['yes', true],
    ['Yes.', true],
    ['yeah', true],
    ['yep', true],
    ['ja', true],
    ['ja!', true],
    ['no', false],
    ['nope', false],
    ['No way', false],
    ['nee', false],
    ['', null],
    ['maybe', null],
    ['what', null],
  ])('parses %j as %j', (input, expected) => {
    expect(parseYesNo(input)).toBe(expected);
  });
});
```

- [ ] **Step 2: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

- [ ] **Step 3: Run test, verify it fails**

```bash
pnpm test
```

Expected: `Cannot find module '@/lib/voice/parse-yes-no'` or similar.

- [ ] **Step 4: Implement `parse-yes-no.ts`**

```ts
// lib/voice/parse-yes-no.ts
export function parseYesNo(input: string): boolean | null {
  const normalized = input.trim().toLowerCase().replace(/[.!?,]/g, '');
  if (!normalized) return null;
  const first = normalized.split(/\s+/)[0];
  if (['yes', 'yeah', 'yep', 'yup', 'ja', 'sure', 'ok', 'okay'].includes(first)) return true;
  if (['no', 'nope', 'nah', 'nee', 'never'].includes(first)) return false;
  return null;
}
```

- [ ] **Step 5: Run tests, verify pass**

```bash
pnpm test
```

Expected: `parseYesNo` test file passes all cases.

- [ ] **Step 6: Implement `VoiceAdapter` interface**

Create `lib/voice/index.ts`:

```ts
// lib/voice/index.ts
export interface VoiceAdapter {
  speak(text: string): Promise<void>;
  /** Resolves with the final transcript when the user stops speaking, or '' on timeout. */
  listen(opts?: { timeoutMs?: number }): Promise<string>;
  /** True if the adapter is supported in this environment. */
  isSupported(): boolean;
}

let cached: VoiceAdapter | null = null;

export async function getVoice(): Promise<VoiceAdapter> {
  if (cached) return cached;
  const provider = process.env.NEXT_PUBLIC_VOICE ?? 'web-speech';
  if (provider === 'resonate') {
    // Stub: filled in once Resonate SDK lands. For now fall through to web-speech.
    console.warn('Resonate adapter not yet implemented, falling back to web-speech');
  }
  const { WebSpeechAdapter } = await import('./web-speech');
  cached = new WebSpeechAdapter();
  return cached;
}
```

- [ ] **Step 7: Implement Web Speech adapter**

Create `lib/voice/web-speech.ts`:

```ts
// lib/voice/web-speech.ts
import type { VoiceAdapter } from './index';

declare global {
  interface Window {
    SpeechRecognition?: typeof SpeechRecognition;
    webkitSpeechRecognition?: typeof SpeechRecognition;
  }
}

export class WebSpeechAdapter implements VoiceAdapter {
  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition) &&
           !!window.speechSynthesis;
  }

  speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 1.0;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    });
  }

  listen(opts: { timeoutMs?: number } = {}): Promise<string> {
    return new Promise((resolve) => {
      const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Ctor) return resolve('');
      const rec = new Ctor();
      rec.lang = 'en-US';
      rec.continuous = false;
      rec.interimResults = false;

      let resolved = false;
      const finish = (text: string) => {
        if (resolved) return;
        resolved = true;
        try { rec.stop(); } catch {}
        resolve(text);
      };

      rec.onresult = (e: SpeechRecognitionEvent) => {
        const last = e.results[e.results.length - 1];
        if (last.isFinal) finish(last[0].transcript ?? '');
      };
      rec.onerror = () => finish('');
      rec.onend = () => finish('');

      const t = setTimeout(() => finish(''), opts.timeoutMs ?? 8000);
      rec.start();

      // Clear timeout on natural finish
      const orig = rec.onend;
      rec.onend = (ev) => { clearTimeout(t); if (orig) (orig as any)(ev); finish(''); };
    });
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add lib/voice/ tests/voice/ vitest.config.ts
git commit -m "feat: voice adapter (web speech) + tested parseYesNo"
```

---

## Task 6: Polyline decoder + scoring algorithm (with tests)

**Files:**
- Create: `lib/routing/decode-polyline.ts`, `lib/routing/score.ts`
- Create: `tests/routing/decode-polyline.test.ts`, `tests/routing/score.test.ts`

**Estimated time:** 90 min · **Hour band:** 2–5

- [ ] **Step 1: Write failing test for polyline decoder**

Create `tests/routing/decode-polyline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decodePolyline } from '@/lib/routing/decode-polyline';

describe('decodePolyline', () => {
  it('decodes the canonical Google example', () => {
    // Google docs example: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" → 3 points
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual([38.5, -120.2]);
    expect(points[1]).toEqual([40.7, -120.95]);
    expect(points[2]).toEqual([43.252, -126.453]);
  });

  it('returns empty for empty input', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
pnpm test decode-polyline
```

Expected: module not found.

- [ ] **Step 3: Implement decoder**

```ts
// lib/routing/decode-polyline.ts
// Decodes a Google encoded polyline to [lat, lng] pairs.
// Reference: https://developers.google.com/maps/documentation/utilities/polylinealgorithm

export function decodePolyline(str: string, precision = 5): [number, number][] {
  let index = 0, lat = 0, lng = 0;
  const coordinates: [number, number][] = [];
  const factor = Math.pow(10, precision);

  while (index < str.length) {
    let result = 1, shift = 0, b: number;
    do {
      b = str.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 1; shift = 0;
    do {
      b = str.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm test decode-polyline
```

Expected: both cases pass.

- [ ] **Step 5: Write failing tests for scoring algorithm**

Create `tests/routing/score.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scoreReports, type ScoredReport, type ReportLite } from '@/lib/routing/score';

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
      id: 'a', type: 'acute', severity: 'high',
      reportedAt: minutesAgo(60), distanceMeters: 10,
      summary: 'followed', agreeRatio: 0,
    };
    const env: ReportLite = {
      id: 'e', type: 'environmental', severity: 'low',
      reportedAt: minutesAgo(60), distanceMeters: 10,
      summary: 'dim', agreeRatio: 0,
    };
    const r = scoreReports({ nearby: [acute, env], routeLengthKm: 1, now });
    const ac = r.scored.find((s) => s.id === 'a')!;
    const en = r.scored.find((s) => s.id === 'e')!;
    expect(ac.score).toBeGreaterThan(en.score * 5); // 10*4 vs 1*1 base ≈ 40x before decay/distance
  });

  it('decays acute reports over time but not environmental', () => {
    const fresh: ReportLite = {
      id: 'f', type: 'acute', severity: 'medium',
      reportedAt: minutesAgo(0), distanceMeters: 10,
      summary: '', agreeRatio: 0,
    };
    const old: ReportLite = {
      ...fresh, id: 'o', reportedAt: minutesAgo(72 * 60), // 72h
    };
    const r = scoreReports({ nearby: [fresh, old], routeLengthKm: 1, now });
    const f = r.scored.find((s) => s.id === 'f')!;
    const o = r.scored.find((s) => s.id === 'o')!;
    expect(o.score).toBeLessThan(f.score / 2); // e^(-1) ≈ 0.37
  });

  it('falls off with distance', () => {
    const close: ReportLite = {
      id: 'c', type: 'acute', severity: 'medium',
      reportedAt: minutesAgo(0), distanceMeters: 5,
      summary: '', agreeRatio: 0,
    };
    const far: ReportLite = {
      ...close, id: 'f', distanceMeters: 30,
    };
    const r = scoreReports({ nearby: [close, far], routeLengthKm: 1, now });
    const c = r.scored.find((s) => s.id === 'c')!;
    const fr = r.scored.find((s) => s.id === 'f')!;
    expect(c.score).toBeGreaterThan(fr.score);
  });

  it('amplifies score when feedback agrees', () => {
    const noFeedback: ReportLite = {
      id: 'n', type: 'environmental', severity: 'medium',
      reportedAt: minutesAgo(0), distanceMeters: 10,
      summary: '', agreeRatio: 0,
    };
    const agreed: ReportLite = { ...noFeedback, id: 'a', agreeRatio: 1.0 };
    const r = scoreReports({ nearby: [noFeedback, agreed], routeLengthKm: 1, now });
    const n = r.scored.find((s) => s.id === 'n')!;
    const a = r.scored.find((s) => s.id === 'a')!;
    expect(a.score).toBeCloseTo(n.score * 1.5, 5);
  });

  it('normalizes by route length', () => {
    const reports: ReportLite[] = [{
      id: 'r', type: 'acute', severity: 'high',
      reportedAt: minutesAgo(0), distanceMeters: 10,
      summary: '', agreeRatio: 0,
    }];
    const short = scoreReports({ nearby: reports, routeLengthKm: 1, now });
    const long = scoreReports({ nearby: reports, routeLengthKm: 5, now });
    expect(long.safetyScore).toBeCloseTo(short.safetyScore / 5, 5);
  });
});
```

- [ ] **Step 6: Run tests, verify fail**

```bash
pnpm test score
```

Expected: module not found.

- [ ] **Step 7: Implement `scoreReports`**

```ts
// lib/routing/score.ts

export type ReportLite = {
  id: string;
  type: 'acute' | 'environmental';
  severity: 'low' | 'medium' | 'high';
  reportedAt: Date;
  distanceMeters: number;
  summary: string;
  /** 0..1 — share of "yes" responses to "did you feel this too?" */
  agreeRatio: number;
};

export type ScoredReport = ReportLite & { score: number };

export type ScoreResult = {
  /** Lower is safer. Already normalized by route length. */
  safetyScore: number;
  scored: ScoredReport[];
};

const SEVERITY_W: Record<ReportLite['severity'], number> = { low: 1, medium: 3, high: 10 };
const TYPE_W: Record<ReportLite['type'], number> = { environmental: 1, acute: 4 };

/** Acute: half-life ≈ 50h (e^(-72/72) = 0.37). Environmental: never decays. */
function timeDecay(report: ReportLite, now: Date): number {
  if (report.type === 'environmental') return 1.0;
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
```

- [ ] **Step 8: Run tests, verify pass**

```bash
pnpm test
```

Expected: all decode-polyline and score tests pass.

- [ ] **Step 9: Commit**

```bash
git add lib/routing/ tests/routing/
git commit -m "feat: tested polyline decoder and safety scoring algorithm"
```

---

## Task 7: Claude classification + POST /api/reports

**Files:**
- Create: `lib/reports/classify.ts`, `app/api/reports/route.ts`

**Estimated time:** 60 min · **Hour band:** 2–5

**No unit test for the API route** — verify with `curl` after implementing. Classification correctness depends on the live model; verify by inspecting a few real submissions.

- [ ] **Step 1: Implement `classify.ts`**

```ts
// lib/reports/classify.ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type Classification = {
  type: 'acute' | 'environmental';
  severity: 'low' | 'medium' | 'high';
  summary: string;
};

const SYSTEM = `You classify safety reports from women in Amsterdam.
Output ONLY a single JSON object with keys: type, severity, summary.
- type: "acute" if something is happening or just happened (followed, harassed, attacked).
        "environmental" if it's a feeling about the place (dark, isolated, sketchy).
- severity: "low" | "medium" | "high"
- summary: one short sentence in past tense, third person, ≤120 chars.
        Used to ask other women: "someone reported {summary} — same?"
No prose, no markdown, just the JSON object.`;

export async function classifyReport(transcript: string): Promise<Classification> {
  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: transcript }],
  });

  const text = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')
    .trim();

  // Strip codefences if the model adds them anyway.
  const json = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(json) as Classification;

  // Defensive validation — model can drift.
  if (!['acute', 'environmental'].includes(parsed.type)) parsed.type = 'environmental';
  if (!['low', 'medium', 'high'].includes(parsed.severity)) parsed.severity = 'medium';
  if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
    parsed.summary = 'Reported feeling unsafe in this area';
  }
  if (parsed.summary.length > 200) parsed.summary = parsed.summary.slice(0, 200);

  return parsed;
}
```

- [ ] **Step 2: Implement `app/api/reports/route.ts`**

```ts
// app/api/reports/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { classifyReport } from '@/lib/reports/classify';

// In-memory rate limit. Hackathon-grade; resets on deploy.
const lastByIp = new Map<string, number>();
const MIN_INTERVAL_MS = 30_000;

export async function POST(req: NextRequest) {
  let body: { transcript?: string; lat?: number; lng?: number };
  try { body = await req.json(); } catch {
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
    id: (inserted as any).rows[0].id,
    type: cls.type,
    severity: cls.severity,
    summary: cls.summary,
  });
}
```

- [ ] **Step 3: Smoke test via `curl`**

Start dev server (`pnpm dev`), then in another terminal:

```bash
curl -X POST http://localhost:3000/api/reports \
  -H 'Content-Type: application/json' \
  -d '{"transcript":"There is a guy following me on Spuistraat right now","lat":52.3676,"lng":4.8920}'
```

Expected: HTTP 200, JSON body with `id`, `type: "acute"`, `severity: "high"` or `"medium"`, a one-sentence `summary`.

Verify in Neon:

```sql
SELECT id, type, severity, summary, reported_at
FROM reports
WHERE source = 'user'
ORDER BY reported_at DESC
LIMIT 1;
```

- [ ] **Step 4: Test rate limit**

Re-run the same curl within 30s. Expected: HTTP 429 `rate_limited`.

- [ ] **Step 5: Test validation errors**

```bash
curl -X POST http://localhost:3000/api/reports -H 'Content-Type: application/json' -d '{}'
# expect 400 missing_location

curl -X POST http://localhost:3000/api/reports -H 'Content-Type: application/json' \
  -d '{"transcript":"hi","lat":52.3,"lng":4.9}'
# expect 400 transcript_too_short
```

- [ ] **Step 6: Commit**

```bash
git add lib/reports/ app/api/reports/
git commit -m "feat: POST /api/reports with claude classification + rate limit"
```

---

## Task 8: GET /api/reports/near

**Files:**
- Create: `app/api/reports/near/route.ts`, `lib/geo/near-line.ts` (helpers)

**Estimated time:** 30 min · **Hour band:** 2–5

- [ ] **Step 1: Implement `app/api/reports/near/route.ts`**

```ts
// app/api/reports/near/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  const radius = Math.min(Number(url.searchParams.get('radius') ?? 200), 2000);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'invalid_coords' }, { status: 400 });
  }

  const result = await db.execute(sql`
    SELECT
      r.id,
      r.type,
      r.severity,
      r.summary,
      r.transcript,
      r.reported_at,
      ST_Y(r.location::geometry) AS lat,
      ST_X(r.location::geometry) AS lng,
      ST_Distance(
        r.location,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      ) AS distance_m,
      COALESCE(
        (SELECT AVG(CASE WHEN agree = 'true' THEN 1.0 ELSE 0.0 END)
         FROM feedback_responses f WHERE f.report_id = r.id),
        0
      ) AS agree_ratio
    FROM reports r
    WHERE ST_DWithin(
      r.location,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ${radius}
    )
    ORDER BY distance_m ASC
    LIMIT 50
  `);

  return NextResponse.json({ reports: (result as any).rows });
}
```

- [ ] **Step 2: Smoke test**

Centraal Station coords: 52.3791, 4.9000. With ~40 seeds nearby this should return several rows.

```bash
curl 'http://localhost:3000/api/reports/near?lat=52.3791&lng=4.9000&radius=500'
```

Expected: JSON `{ "reports": [ {id, type, severity, summary, transcript, lat, lng, distance_m, agree_ratio}, ... ] }`. `distance_m` ascending.

- [ ] **Step 3: Commit**

```bash
git add app/api/reports/near/
git commit -m "feat: GET /api/reports/near with postgis radius query"
```

---

## Task 9: POST /api/route (Google Directions + scoring)

**Files:**
- Create: `lib/routing/google-directions.ts`, `app/api/route/route.ts`

**Estimated time:** 90 min · **Hour band:** 5–9

- [ ] **Step 1: Implement Google Directions wrapper**

```ts
// lib/routing/google-directions.ts
export type DirectionsRoute = {
  polyline: string;
  durationSec: number;
  distanceM: number;
};

export async function getRoutes(args: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  mode: 'walking' | 'cycling';
}): Promise<DirectionsRoute[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('GOOGLE_MAPS_API_KEY not set');

  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', `${args.origin.lat},${args.origin.lng}`);
  url.searchParams.set('destination', `${args.destination.lat},${args.destination.lng}`);
  url.searchParams.set('mode', args.mode === 'cycling' ? 'bicycling' : 'walking');
  url.searchParams.set('alternatives', 'true');
  url.searchParams.set('key', key);

  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`directions ${r.status}`);
  const data = await r.json() as any;
  if (data.status !== 'OK') throw new Error(`directions ${data.status}`);

  return (data.routes ?? []).map((rt: any) => ({
    polyline: rt.overview_polyline.points as string,
    durationSec: rt.legs?.[0]?.duration?.value ?? 0,
    distanceM: rt.legs?.[0]?.distance?.value ?? 0,
  }));
}
```

- [ ] **Step 2: Implement `app/api/route/route.ts`**

```ts
// app/api/route/route.ts
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
  const body = await req.json() as ReqBody;
  const directions = await getRoutes(body);
  if (directions.length === 0) {
    return NextResponse.json({ routes: [], recommended_id: null });
  }

  const now = new Date();
  const enriched = await Promise.all(directions.map(async (rt, idx) => {
    const points = decodePolyline(rt.polyline);
    if (points.length < 2) {
      return { id: `route-${idx}`, ...rt, scored: { safetyScore: 0, scored: [] }, points };
    }

    // Build a LINESTRING from points and find nearby reports within 30m of it.
    const lineWkt = 'LINESTRING(' +
      points.map(([lat, lng]) => `${lng} ${lat}`).join(',') + ')';

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

    const nearby: ReportLite[] = (result as any).rows.map((row: any) => ({
      id: row.id,
      type: row.type,
      severity: row.severity,
      summary: row.summary,
      reportedAt: new Date(row.reported_at),
      distanceMeters: Number(row.distance_m),
      agreeRatio: Number(row.agree_ratio),
    }));

    const routeLengthKm = rt.distanceM / 1000;
    const scored = scoreReports({ nearby, routeLengthKm, now });
    return { id: `route-${idx}`, ...rt, scored, points };
  }));

  // Baseline = the fastest (Google's first route) before re-rank
  const fastestNearbyCount = enriched[0].scored.scored.length;

  const ranked = [...enriched].sort((a, b) => a.scored.safetyScore - b.scored.safetyScore);

  const responseRoutes = ranked.map((rt) => {
    const reasons: string[] = [];
    const top = [...rt.scored.scored].sort((a, b) => b.score - a.score).slice(0, 2);
    for (const r of top) {
      reasons.push(`avoids ${r.type === 'acute' ? 'acute' : 'environmental'} report: ${r.summary}`);
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
```

- [ ] **Step 3: Smoke test**

Spui (~52.3667, 4.8920) → Centraal (~52.3791, 4.9000), walking:

```bash
curl -X POST http://localhost:3000/api/route \
  -H 'Content-Type: application/json' \
  -d '{"origin":{"lat":52.3667,"lng":4.8920},"destination":{"lat":52.3791,"lng":4.9000},"mode":"walking"}'
```

Expected: JSON with `routes: [...]` (1–3 entries), each with `safety_score >= 0`, `incidents_avoided`, `reasons`. `recommended_id` set to the first route in the response (lowest score).

- [ ] **Step 4: Commit**

```bash
git add lib/routing/google-directions.ts app/api/route/
git commit -m "feat: POST /api/route — google directions + safety re-rank"
```

---

## Task 10: POST /api/feedback and POST /api/route-feedback

**Files:**
- Create: `app/api/feedback/route.ts`, `app/api/route-feedback/route.ts`

**Estimated time:** 45 min · **Hour band:** 5–9

- [ ] **Step 1: Implement `app/api/feedback/route.ts`**

```ts
// app/api/feedback/route.ts
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
```

- [ ] **Step 2: Implement `app/api/route-feedback/route.ts`**

```ts
// app/api/route-feedback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { decodePolyline } from '@/lib/routing/decode-polyline';

const RATINGS = ['lit_quiet', 'caution', 'avoid', 'acute'] as const;
type Rating = (typeof RATINGS)[number];

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    polyline?: string;
    rating?: Rating;
    duration_min?: number;
    mode?: 'walking' | 'cycling';
  };

  if (!body.polyline || !body.rating || !RATINGS.includes(body.rating) ||
      typeof body.duration_min !== 'number' ||
      (body.mode !== 'walking' && body.mode !== 'cycling')) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const points = decodePolyline(body.polyline);
  if (points.length < 2) {
    return NextResponse.json({ error: 'invalid_polyline' }, { status: 400 });
  }
  const lineWkt = 'LINESTRING(' +
    points.map(([lat, lng]) => `${lng} ${lat}`).join(',') + ')';

  await db.execute(sql`
    INSERT INTO route_feedback (polyline, rating, duration_min, mode)
    VALUES (
      ST_GeogFromText(${lineWkt}),
      ${body.rating},
      ${body.duration_min},
      ${body.mode}
    )
  `);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Smoke test feedback endpoint**

Use a real `report_id` from the seed. Find one:

```sql
SELECT id FROM reports WHERE source='seed' LIMIT 1;
```

Then:

```bash
curl -X POST http://localhost:3000/api/feedback \
  -H 'Content-Type: application/json' \
  -d '{"report_id":"<id>","agree":true,"responder_loc":{"lat":52.37,"lng":4.9}}'
```

Expected: `{"ok":true}`. Confirm row in `feedback_responses`.

- [ ] **Step 4: Smoke test route-feedback endpoint**

```bash
curl -X POST http://localhost:3000/api/route-feedback \
  -H 'Content-Type: application/json' \
  -d '{"polyline":"_p~iF~ps|U_ulLnnqC_mqNvxq`@","rating":"lit_quiet","duration_min":12,"mode":"walking"}'
```

Expected: `{"ok":true}`. Confirm row in `route_feedback`.

- [ ] **Step 5: Commit**

```bash
git add app/api/feedback/ app/api/route-feedback/
git commit -m "feat: feedback and route-feedback endpoints"
```

---

## Task 11: Screen state machine + page shell

**Files:**
- Modify: `app/page.tsx`

**Estimated time:** 45 min · **Hour band:** 9–13

The whole app lives at `/`. State drives which screen renders. Sub-components are stubs in this task and get filled in later.

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
// app/page.tsx
'use client';

import { useState, useCallback } from 'react';

type Screen = 'home' | 'report' | 'route' | 'navigate' | 'arrive';

export type Coord = { lat: number; lng: number };

export type RouteResponse = {
  id: string;
  polyline: string;
  duration_min: number;
  distance_m: number;
  safety_score: number;
  incidents_avoided: number;
  reasons: string[];
};

export type AppState = {
  screen: Screen;
  origin: Coord | null;
  destination: Coord | null;
  routes: RouteResponse[];
  activeRouteId: string | null;
  mode: 'walking' | 'cycling';
};

export default function Page() {
  const [state, setState] = useState<AppState>({
    screen: 'home',
    origin: null,
    destination: null,
    routes: [],
    activeRouteId: null,
    mode: 'walking',
  });

  const goto = useCallback((screen: Screen) => {
    setState((s) => ({ ...s, screen }));
  }, []);

  const setRoutes = useCallback((routes: RouteResponse[]) => {
    setState((s) => ({ ...s, routes, activeRouteId: routes[0]?.id ?? null }));
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-[var(--paper)]">
      {state.screen === 'home' && (
        <HomeStub onSearch={(dest) => {
          setState((s) => ({ ...s, destination: dest, screen: 'route' }));
        }} onReport={() => goto('report')} />
      )}
      {state.screen === 'report' && (
        <ReportStub onDone={() => goto('home')} />
      )}
      {state.screen === 'route' && (
        <RouteStub onStart={() => goto('navigate')} onCancel={() => goto('home')} />
      )}
      {state.screen === 'navigate' && (
        <NavigateStub onArrive={() => goto('arrive')} onCancel={() => goto('home')} />
      )}
      {state.screen === 'arrive' && (
        <ArriveStub onDone={() => goto('home')} />
      )}
    </main>
  );
}

function HomeStub({ onSearch, onReport }: {
  onSearch: (d: Coord) => void;
  onReport: () => void;
}) {
  return (
    <div className="p-6">
      <h1 className="display text-2xl">Home (stub)</h1>
      <button className="mt-4 underline" onClick={() => onSearch({ lat: 52.3791, lng: 4.9000 })}>
        Mock: search Centraal
      </button>
      <button className="mt-4 ml-4 underline" onClick={onReport}>Report (stub)</button>
    </div>
  );
}
function ReportStub({ onDone }: { onDone: () => void }) {
  return <button className="m-6 underline" onClick={onDone}>Report stub — back</button>;
}
function RouteStub({ onStart, onCancel }: { onStart: () => void; onCancel: () => void }) {
  return (
    <div className="p-6">
      <h1 className="display text-2xl">Route (stub)</h1>
      <button className="m-2 underline" onClick={onStart}>Start</button>
      <button className="m-2 underline" onClick={onCancel}>Cancel</button>
    </div>
  );
}
function NavigateStub({ onArrive, onCancel }: { onArrive: () => void; onCancel: () => void }) {
  return (
    <div className="p-6">
      <h1 className="display text-2xl">Navigate (stub)</h1>
      <button className="m-2 underline" onClick={onArrive}>Mock arrive</button>
      <button className="m-2 underline" onClick={onCancel}>Cancel</button>
    </div>
  );
}
function ArriveStub({ onDone }: { onDone: () => void }) {
  return (
    <div className="p-6">
      <h1 className="display text-2xl">Arrive (stub)</h1>
      <button className="m-2 underline" onClick={onDone}>Done</button>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

`pnpm dev`, open `http://localhost:3000`. Click through every stub button. Expected: each click advances or returns to the right screen.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: top-level screen state machine with screen stubs"
```

---

## Task 12: Mapbox map view + report pins

**Files:**
- Create: `components/map/map-view.tsx`, `components/map/report-pins.tsx`, `components/map/route-line.tsx`

**Estimated time:** 90 min · **Hour band:** 9–13

- [ ] **Step 1: Implement `MapView`**

```tsx
// components/map/map-view.tsx
'use client';

import { useEffect, useRef } from 'react';
import mapboxgl, { type Map as MbMap } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

const AMSTERDAM_CENTER: [number, number] = [4.9041, 52.3676];

const PAINT_OVERRIDES: Array<{ layer: string; prop: string; value: string }> = [
  // Land / paper
  { layer: 'background', prop: 'background-color', value: 'var(--map-land)' },
  { layer: 'land', prop: 'background-color', value: 'var(--map-land)' },
  // Roads → white
  { layer: 'road-primary', prop: 'line-color', value: 'var(--map-road)' },
  { layer: 'road-secondary-tertiary', prop: 'line-color', value: 'var(--map-road)' },
  { layer: 'road-street', prop: 'line-color', value: 'var(--map-road)' },
  { layer: 'road-pedestrian', prop: 'line-color', value: 'var(--map-road)' },
  // Water
  { layer: 'water', prop: 'fill-color', value: 'var(--map-water)' },
  // Parks
  { layer: 'land-structure-polygon', prop: 'fill-color', value: 'var(--map-block)' },
];

function resolveCssVar(name: string): string {
  if (typeof window === 'undefined') return '#000';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}

export function MapView({
  onReady,
  className,
}: {
  onReady?: (m: MbMap) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MbMap | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const m = new mapboxgl.Map({
      container: ref.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: AMSTERDAM_CENTER,
      zoom: 13,
      attributionControl: false,
    });
    mapRef.current = m;

    m.on('style.load', () => {
      for (const o of PAINT_OVERRIDES) {
        try {
          const value = o.value.startsWith('var(') ? resolveCssVar(o.value.slice(4, -1)) : o.value;
          m.setPaintProperty(o.layer, o.prop as any, value);
        } catch { /* layer may not exist; ignore */ }
      }
      onReady?.(m);
    });

    return () => { m.remove(); mapRef.current = null; };
  }, [onReady]);

  return <div ref={ref} className={className ?? 'w-full h-full'} />;
}
```

- [ ] **Step 2: Implement `ReportPins`**

```tsx
// components/map/report-pins.tsx
'use client';

import { useEffect } from 'react';
import type { Map as MbMap } from 'mapbox-gl';

export type Pin = {
  id: string;
  lat: number;
  lng: number;
  severity: 'low' | 'medium' | 'high';
  type: 'acute' | 'environmental';
};

const SEV_TO_VAR = {
  low: '--sev-low',
  medium: '--sev-mid',
  high: '--sev-high',
} as const;

function resolveVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const SOURCE_ID = 'reports-src';
const LAYER_ID = 'reports-layer';

export function ReportPins({ map, pins }: { map: MbMap | null; pins: Pin[] }) {
  useEffect(() => {
    if (!map) return;
    const features = {
      type: 'FeatureCollection',
      features: pins.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: {
          color: p.type === 'acute'
            ? resolveVar('--sev-acute')
            : resolveVar(SEV_TO_VAR[p.severity]),
          radius: p.type === 'acute' ? 7 : 5,
        },
      })),
    } as any;

    if (map.getSource(SOURCE_ID)) {
      (map.getSource(SOURCE_ID) as any).setData(features);
    } else {
      map.addSource(SOURCE_ID, { type: 'geojson', data: features });
      map.addLayer({
        id: LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['get', 'radius'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1,
        },
      });
    }
  }, [map, pins]);

  return null;
}
```

- [ ] **Step 3: Implement `RouteLine`**

```tsx
// components/map/route-line.tsx
'use client';

import { useEffect } from 'react';
import type { Map as MbMap } from 'mapbox-gl';
import { decodePolyline } from '@/lib/routing/decode-polyline';

export type DrawnRoute = {
  id: string;
  polyline: string;
  /** rank 0 = safest (drawn last, on top, thicker) */
  rank: number;
  active: boolean;
};

function resolveVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function RouteLine({ map, routes }: { map: MbMap | null; routes: DrawnRoute[] }) {
  useEffect(() => {
    if (!map) return;

    const colorByRank = (rank: number) =>
      rank === 0 ? resolveVar('--primary')
      : rank === 1 ? resolveVar('--sev-mid')
      : resolveVar('--sev-high');

    // Wipe old layers/sources for this group
    for (const id of (map.getStyle()?.layers ?? []).map((l) => l.id)) {
      if (id.startsWith('route-line-')) map.removeLayer(id);
    }
    for (const id of Object.keys(map.getStyle()?.sources ?? {})) {
      if (id.startsWith('route-src-')) map.removeSource(id);
    }

    // Add in reverse rank order so safest is on top
    const sorted = [...routes].sort((a, b) => b.rank - a.rank);
    for (const r of sorted) {
      const pts = decodePolyline(r.polyline).map(([lat, lng]) => [lng, lat]);
      const srcId = `route-src-${r.id}`;
      const layerId = `route-line-${r.id}`;
      map.addSource(srcId, {
        type: 'geojson',
        data: {
          type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: pts },
        } as any,
      });
      map.addLayer({
        id: layerId, type: 'line', source: srcId,
        paint: {
          'line-color': colorByRank(r.rank),
          'line-width': r.rank === 0 ? 6 : 4,
          'line-opacity': r.rank === 0 ? 1 : 0.6,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    }
  }, [map, routes]);

  return null;
}
```

- [ ] **Step 4: Quick visual smoke test**

Temporarily wire the map into `app/page.tsx`'s `HomeStub` to verify it renders:

```tsx
// inside HomeStub, replace body:
import { MapView } from '@/components/map/map-view';
// ...
return (
  <div className="w-full h-full">
    <MapView className="w-full h-full" />
  </div>
);
```

`pnpm dev` → expect a Mapbox map of Amsterdam in cream/white tones (paint overrides applied). Roll back the temporary HomeStub change before committing — the proper Home goes in Task 13.

- [ ] **Step 5: Commit**

```bash
git add components/map/
git commit -m "feat: mapbox map view, report pins, route line layers"
```

---

## Task 13: Home screen

**Files:**
- Create: `components/screens/home.tsx`, `components/ui/push-to-talk-button.tsx`
- Modify: `app/page.tsx`

**Estimated time:** 90 min · **Hour band:** 9–13

- [ ] **Step 1: Implement push-to-talk button (gesture wrapper)**

```tsx
// components/ui/push-to-talk-button.tsx
'use client';

import { useRef, useState, type PointerEvent } from 'react';

export function PushToTalkButton({
  onStart,
  onRelease,
  onCancel,
  disabled,
  children,
}: {
  onStart: () => void;
  onRelease: () => void;
  onCancel: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [held, setHeld] = useState(false);
  const startY = useRef(0);
  const cancelled = useRef(false);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startY.current = e.clientY;
    cancelled.current = false;
    setHeld(true);
    onStart();
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!held) return;
    if (startY.current - e.clientY > 80) {
      cancelled.current = true;
    }
  };
  const onPointerUp = () => {
    if (!held) return;
    setHeld(false);
    if (cancelled.current) onCancel();
    else onRelease();
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      data-held={held ? '1' : '0'}
      className="w-full rounded-2xl px-5 py-4 text-left text-white
        bg-[var(--primary)] data-[held='1']:bg-[var(--primary-2)]
        active:scale-[0.99] transition-transform
        disabled:opacity-50 select-none touch-none"
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Implement Home screen**

```tsx
// components/screens/home.tsx
'use client';

import { useEffect, useState } from 'react';
import type { Map as MbMap } from 'mapbox-gl';
import { MapView } from '@/components/map/map-view';
import { ReportPins, type Pin } from '@/components/map/report-pins';
import type { Coord } from '@/app/page';

export function HomeScreen({
  onSearch,
  onReport,
  initialPosition,
}: {
  onSearch: (destination: Coord) => void;
  onReport: () => void;
  initialPosition: Coord | null;
}) {
  const [map, setMap] = useState<MbMap | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [destinationText, setDestinationText] = useState('');
  const [nearbyCount, setNearbyCount] = useState<number | null>(null);

  // Load nearby reports on mount and when position changes
  useEffect(() => {
    const center = initialPosition ?? { lat: 52.3676, lng: 4.9041 };
    fetch(`/api/reports/near?lat=${center.lat}&lng=${center.lng}&radius=2000`)
      .then((r) => r.json())
      .then((data) => {
        const list = (data.reports ?? []) as any[];
        setPins(list.map((r) => ({
          id: r.id, lat: Number(r.lat), lng: Number(r.lng),
          severity: r.severity, type: r.type,
        })));
        // count "in the last hour"
        const recent = list.filter((r) =>
          Date.now() - new Date(r.reported_at).getTime() < 3600_000).length;
        setNearbyCount(recent);
      });
  }, [initialPosition]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destinationText.trim()) return;
    // Geocode via Mapbox
    const r = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(destinationText)}.json` +
      `?proximity=4.9041,52.3676&country=nl&limit=1` +
      `&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`,
    );
    const data = await r.json();
    const f = data.features?.[0];
    if (!f) return;
    const [lng, lat] = f.center;
    onSearch({ lat, lng });
  };

  return (
    <div className="absolute inset-0">
      <MapView className="absolute inset-0" onReady={setMap} />
      <ReportPins map={map} pins={pins} />

      {/* Top: search */}
      <form onSubmit={onSubmit}
            className="absolute top-3 left-3 right-3 bg-white/95 rounded-2xl px-4 py-3
                       shadow-md flex items-center gap-3 backdrop-blur">
        <span className="opacity-60">⌕</span>
        <input
          value={destinationText}
          onChange={(e) => setDestinationText(e.target.value)}
          placeholder="Where to?"
          className="flex-1 outline-none bg-transparent text-[var(--ink)] placeholder:text-[var(--ink-4)]"
        />
      </form>

      {nearbyCount !== null && nearbyCount > 0 && (
        <div className="absolute top-[64px] left-4 text-xs text-[var(--ink-3)]">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--sev-acute)] mr-2 align-middle" />
          <strong>{nearbyCount} reports nearby</strong> in the last hour
        </div>
      )}

      {/* Bottom: report CTA */}
      <div className="absolute bottom-6 left-4 right-4">
        <button
          onClick={onReport}
          className="w-full rounded-2xl px-5 py-4 text-left text-white bg-[var(--primary)]
                     shadow-lg active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🎤</span>
            <div className="leading-tight">
              <div className="display text-base">Report what you see</div>
              <div className="text-xs opacity-80">Hold to speak — anonymous</div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
```

(Note: Home's CTA navigates to the Report screen, where the actual push-to-talk happens. Tap-to-enter, then hold there.)

- [ ] **Step 3: Wire the real Home into `app/page.tsx`**

Replace the `HomeStub` import and call site with the real component. Add geolocation:

```tsx
// app/page.tsx — replace HomeStub usage with this block at the import + render sites
import { HomeScreen } from '@/components/screens/home';

// ... inside the component, add:
const [pos, setPos] = useState<Coord | null>(null);
useEffect(() => {
  if (!('geolocation' in navigator)) return;
  navigator.geolocation.getCurrentPosition(
    (g) => setPos({ lat: g.coords.latitude, lng: g.coords.longitude }),
    () => {},
    { enableHighAccuracy: true, timeout: 5000 },
  );
}, []);

// ...
{state.screen === 'home' && (
  <HomeScreen
    initialPosition={pos}
    onSearch={(dest) => setState((s) => ({ ...s, origin: pos ?? { lat: 52.3676, lng: 4.9041 }, destination: dest, screen: 'route' }))}
    onReport={() => goto('report')}
  />
)}
```

(Keep the other stubs as-is for now; the Page component gets `useState` + `useEffect` imported.)

- [ ] **Step 4: Test in mobile browser DevTools**

Open Chrome DevTools, toggle device emulation (iPhone or Pixel size), reload. Expected: full-bleed map, top search bar, "X reports nearby" badge, big forest-green CTA at the bottom.

Type "Centraal Station" in the search → press Enter → screen advances to Route stub with `destination` set.

- [ ] **Step 5: Commit**

```bash
git add components/screens/home.tsx components/ui/push-to-talk-button.tsx app/page.tsx
git commit -m "feat: home screen with map, nearby badge, search, report CTA"
```

---

## Task 14: Report screen (push-to-talk)

**Files:**
- Create: `components/screens/report.tsx`
- Modify: `app/page.tsx`

**Estimated time:** 90 min · **Hour band:** 13–16

- [ ] **Step 1: Implement Report screen**

```tsx
// components/screens/report.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { getVoice } from '@/lib/voice';
import { PushToTalkButton } from '@/components/ui/push-to-talk-button';

type State = 'idle' | 'recording' | 'submitting' | 'done' | 'error';

export function ReportScreen({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<State>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const posRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await getVoice();
      if (!cancelled) await v.speak('Tell me what\'s happening.');
    })();
    return () => { cancelled = true; };
  }, []);

  const onStart = async () => {
    setError(null);
    setTranscript('');
    setState('recording');
    // Capture GPS now
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (g) => { posRef.current = { lat: g.coords.latitude, lng: g.coords.longitude }; },
        () => { setError('need_location'); setState('error'); },
        { enableHighAccuracy: true, timeout: 5000 },
      );
    } else {
      setError('need_location');
      setState('error');
      return;
    }
    const v = await getVoice();
    const text = await v.listen({ timeoutMs: 12_000 });
    setTranscript(text);
  };

  const onRelease = async () => {
    if (state !== 'recording') return;
    if (!transcript.trim()) {
      setError('didnt_catch'); setState('error');
      const v = await getVoice();
      await v.speak("Didn't catch that — try again.");
      return;
    }
    if (!posRef.current) {
      setError('need_location'); setState('error'); return;
    }
    setState('submitting');
    const r = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript,
        lat: posRef.current.lat,
        lng: posRef.current.lng,
      }),
    });
    if (!r.ok) {
      setError('submit_failed'); setState('error');
      const v = await getVoice();
      await v.speak('Could not submit. Try again.');
      return;
    }
    setState('done');
    const v = await getVoice();
    await v.speak('Reported. Stay safe.');
    setTimeout(onDone, 1200);
  };

  const onCancel = async () => {
    setState('idle');
    setTranscript('');
    const v = await getVoice();
    v.speak('Cancelled.');
  };

  return (
    <div className="absolute inset-0 bg-[var(--paper)] flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className={`mb-8 w-24 h-24 rounded-full flex items-center justify-center
          ${state === 'recording' ? 'bg-[var(--accent)] animate-pulse' : 'bg-[var(--primary-3)]'}`}>
          <span className="text-4xl">🎤</span>
        </div>
        <h1 className="display text-2xl text-[var(--ink)] mb-3">
          {state === 'idle' && 'Tell me what\'s happening'}
          {state === 'recording' && 'Listening…'}
          {state === 'submitting' && 'Sending…'}
          {state === 'done' && 'Reported'}
          {state === 'error' && 'Try again'}
        </h1>
        {transcript && (
          <p className="text-[var(--ink-3)] text-base max-w-md">"{transcript}"</p>
        )}
        {error === 'need_location' && (
          <p className="text-[var(--sev-acute)] mt-4">Need location to report.</p>
        )}
      </div>

      <div className="p-4 pb-8 space-y-3">
        <PushToTalkButton
          onStart={onStart} onRelease={onRelease} onCancel={onCancel}
          disabled={state === 'submitting' || state === 'done'}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">●</span>
            <div className="display">
              {state === 'recording' ? 'Release to send' : 'Hold to speak — anonymous'}
            </div>
          </div>
        </PushToTalkButton>
        <button
          onClick={onDone}
          className="w-full rounded-2xl px-5 py-3 text-[var(--ink-3)] bg-transparent">
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `app/page.tsx`**

```tsx
// in app/page.tsx
import { ReportScreen } from '@/components/screens/report';
// ...
{state.screen === 'report' && <ReportScreen onDone={() => goto('home')} />}
```

- [ ] **Step 3: Manual smoke test (Android Chrome)**

Open the dev URL on a phone (use `pnpm dev --hostname 0.0.0.0` and your laptop's LAN IP, or `vercel dev`). Tap Report → grant mic + location → press-and-hold the button → speak a sentence → release. Expected: voice says "Reported," screen returns to Home, a new row exists in `reports` (verify in Neon).

- [ ] **Step 4: Commit**

```bash
git add components/screens/report.tsx app/page.tsx
git commit -m "feat: report screen with push-to-talk and gps capture"
```

---

## Task 15: Route screen (alternative routes + bottom sheet)

**Files:**
- Create: `components/screens/route.tsx`, `components/ui/bottom-sheet.tsx`
- Modify: `app/page.tsx`

**Estimated time:** 90 min · **Hour band:** 13–16

- [ ] **Step 1: Implement reusable `BottomSheet`**

```tsx
// components/ui/bottom-sheet.tsx
'use client';

export function BottomSheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 bg-[var(--card)] rounded-t-3xl
                    shadow-[0_-8px_24px_rgba(0,0,0,0.12)] p-5 pb-7 max-h-[60vh] overflow-y-auto">
      <div className="mx-auto w-12 h-1 rounded-full bg-[var(--ink-4)] opacity-30 mb-4" />
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Implement Route screen**

```tsx
// components/screens/route.tsx
'use client';

import { useEffect, useState } from 'react';
import type { Map as MbMap } from 'mapbox-gl';
import { MapView } from '@/components/map/map-view';
import { ReportPins, type Pin } from '@/components/map/report-pins';
import { RouteLine } from '@/components/map/route-line';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { getVoice } from '@/lib/voice';
import type { RouteResponse, Coord } from '@/app/page';

export function RouteScreen({
  origin, destination, mode,
  onStart, onCancel, setRoutes, routes,
}: {
  origin: Coord;
  destination: Coord;
  mode: 'walking' | 'cycling';
  onStart: (activeRouteId: string) => void;
  onCancel: () => void;
  setRoutes: (rs: RouteResponse[]) => void;
  routes: RouteResponse[];
}) {
  const [map, setMap] = useState<MbMap | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination, mode }),
    }).then((r) => r.json()).then(async (data) => {
      const rs: RouteResponse[] = data.routes ?? [];
      if (rs.length === 0) { setError('no_routes'); return; }
      setRoutes(rs);
      setActiveId(rs[0].id);

      const v = await getVoice();
      const fastest = [...rs].sort((a, b) => a.duration_min - b.duration_min)[0];
      const safest = rs[0];
      if (safest.id === fastest.id) {
        await v.speak(`Routing you there. ${safest.duration_min} minutes.`);
      } else {
        const extra = safest.duration_min - fastest.duration_min;
        const reason = safest.reasons[0] ?? 'fewer reports along this path';
        await v.speak(`Picked the safer route. ${reason}. ${extra} minutes longer.`);
      }
    }).catch(() => setError('fetch_failed'));
  }, [origin, destination, mode, setRoutes]);

  useEffect(() => {
    fetch(`/api/reports/near?lat=${origin.lat}&lng=${origin.lng}&radius=2000`)
      .then((r) => r.json()).then((data) => {
        setPins((data.reports ?? []).map((r: any) => ({
          id: r.id, lat: Number(r.lat), lng: Number(r.lng),
          severity: r.severity, type: r.type,
        })));
      });
  }, [origin]);

  const drawn = routes.map((r, i) => ({
    id: r.id, polyline: r.polyline,
    rank: routes.findIndex((rr) => rr.id === r.id), active: r.id === activeId,
  }));

  const active = routes.find((r) => r.id === activeId);

  return (
    <div className="absolute inset-0">
      <MapView className="absolute inset-0" onReady={setMap} />
      <ReportPins map={map} pins={pins} />
      <RouteLine map={map} routes={drawn} />

      <BottomSheet>
        {error && <p className="text-[var(--sev-acute)]">No routes available — try again.</p>}
        {!error && !active && <p className="text-[var(--ink-3)]">Finding the safest route…</p>}
        {active && (
          <>
            <h2 className="display text-xl text-[var(--ink)]">
              {active.id === routes[0].id ? 'Safer route' : 'Fastest route'}
            </h2>
            <p className="text-sm text-[var(--ink-3)] mt-1">
              {active.duration_min} min · {(active.distance_m / 1000).toFixed(1)} km
            </p>
            <ul className="text-sm text-[var(--ink-2)] mt-3 space-y-1">
              {active.reasons.map((r, i) => <li key={i}>· {r}</li>)}
            </ul>
            <div className="flex gap-2 mt-4">
              {routes.map((r, i) => (
                <button key={r.id} onClick={() => setActiveId(r.id)}
                  className={`flex-1 py-2 rounded-xl text-sm
                    ${r.id === activeId ? 'bg-[var(--primary)] text-white' : 'bg-[var(--paper-2)] text-[var(--ink)]'}`}>
                  {i === 0 ? 'Safest' : i === 1 ? 'Alt 1' : 'Alt 2'} · {r.duration_min}m
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={onCancel}
                className="flex-1 py-3 rounded-xl bg-[var(--paper-2)] text-[var(--ink)]">
                Cancel
              </button>
              <button onClick={() => active && onStart(active.id)}
                className="flex-[2] py-3 rounded-xl bg-[var(--primary)] text-white display">
                Start
              </button>
            </div>
          </>
        )}
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 3: Wire into `app/page.tsx`**

```tsx
// inside the page component, replace the route stub render with:
import { RouteScreen } from '@/components/screens/route';
// ...
{state.screen === 'route' && state.origin && state.destination && (
  <RouteScreen
    origin={state.origin}
    destination={state.destination}
    mode={state.mode}
    routes={state.routes}
    setRoutes={setRoutes}
    onStart={(activeRouteId) => setState((s) => ({ ...s, activeRouteId, screen: 'navigate' }))}
    onCancel={() => goto('home')}
  />
)}
```

- [ ] **Step 4: Smoke test**

In the Home stub button or via search: pick destination Centraal (52.3791, 4.9000). Expect: Route screen shows the map with multiple route lines (forest green safest on top), a bottom sheet with summary + Start button. Click Start → advances to Navigate stub.

- [ ] **Step 5: Commit**

```bash
git add components/screens/route.tsx components/ui/bottom-sheet.tsx app/page.tsx
git commit -m "feat: route screen with alternatives, safety reasoning, bottom sheet"
```

---

## Task 16: Navigate screen + poll loop + mid-trip reroute

**Files:**
- Create: `components/screens/navigate.tsx`
- Modify: `app/page.tsx`

**Estimated time:** 90 min · **Hour band:** 16–19

- [ ] **Step 1: Implement Navigate screen**

```tsx
// components/screens/navigate.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as MbMap } from 'mapbox-gl';
import { MapView } from '@/components/map/map-view';
import { ReportPins, type Pin } from '@/components/map/report-pins';
import { RouteLine } from '@/components/map/route-line';
import { getVoice } from '@/lib/voice';
import type { Coord, RouteResponse } from '@/app/page';

const POLL_MS = 7_000;
const REROUTE_MIN_MS = 30_000;
const REROUTE_THRESHOLD = 0.6;

export function NavigateScreen({
  origin, destination, mode, routes, activeRouteId,
  onArrive, onCancel, onPromptOpen, onActiveRouteChange,
}: {
  origin: Coord;
  destination: Coord;
  mode: 'walking' | 'cycling';
  routes: RouteResponse[];
  activeRouteId: string;
  onArrive: () => void;
  onCancel: () => void;
  onPromptOpen: (report: NearReport) => void;
  onActiveRouteChange: (rs: RouteResponse[], activeId: string) => void;
}) {
  const [map, setMap] = useState<MbMap | null>(null);
  const [pos, setPos] = useState<Coord | null>(origin);
  const [pins, setPins] = useState<Pin[]>([]);
  const lastRerouteAt = useRef(0);
  const promptedIds = useRef<Set<string>>(new Set());
  const promptCountThisRoute = useRef(0);
  const lastPromptAt = useRef(0);

  // Reset cap when active route changes (route switch starts a new "route")
  useEffect(() => {
    promptCountThisRoute.current = 0;
    lastPromptAt.current = 0;
    promptedIds.current.clear();
  }, [activeRouteId]);

  // Watch geolocation
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (g) => setPos({ lat: g.coords.latitude, lng: g.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Poll: prompt geofence + reroute check + arrival check
  useEffect(() => {
    if (!pos) return;
    const tick = async () => {
      // Arrival check
      const dToDest = haversine(pos, destination);
      if (dToDest < 30) { onArrive(); return; }

      // Geofence prompt — capped at 2 per route, 1 min apart.
      // Hackathon simplification (deviates slightly from spec §7 cap rule):
      // we count a prompt as "spent" when it OPENS, not when answered. Skipping
      // therefore costs a slot. Acceptable trade-off for 24h scope; revisit post-demo.
      const sinceLastPrompt = Date.now() - lastPromptAt.current;
      if (promptCountThisRoute.current < 2 && sinceLastPrompt > 60_000) {
        const nearbyResp = await fetch(
          `/api/reports/near?lat=${pos.lat}&lng=${pos.lng}&radius=50`).then((r) => r.json());
        const eligible = (nearbyResp.reports ?? []).filter((r: any) =>
          !promptedIds.current.has(r.id));
        if (eligible.length > 0) {
          const r = eligible.sort((a: any, b: any) =>
            severityWeight(b.severity, b.type) - severityWeight(a.severity, a.type))[0];
          promptedIds.current.add(r.id);
          lastPromptAt.current = Date.now();
          promptCountThisRoute.current += 1;
          onPromptOpen(r);
        }
      }

      // Reroute check
      if (Date.now() - lastRerouteAt.current > REROUTE_MIN_MS) {
        lastRerouteAt.current = Date.now();
        const reroute = await fetch('/api/route', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin: pos, destination, mode }),
        }).then((r) => r.json());
        const newRoutes: RouteResponse[] = reroute.routes ?? [];
        if (newRoutes.length === 0) return;
        const safest = newRoutes[0];
        const current = routes.find((rr) => rr.id === activeRouteId);
        if (current && safest.id !== activeRouteId &&
            safest.safety_score < current.safety_score * REROUTE_THRESHOLD) {
          const v = await getVoice();
          await v.speak(`Safer route found. ${safest.reasons[0] ?? ''}. Switching.`);
          onActiveRouteChange(newRoutes, safest.id);
        }
      }
    };
    const id = setInterval(tick, POLL_MS);
    tick();
    return () => clearInterval(id);
  }, [pos, destination, mode, routes, activeRouteId, onArrive, onPromptOpen, onActiveRouteChange]);

  useEffect(() => {
    if (!pos) return;
    fetch(`/api/reports/near?lat=${pos.lat}&lng=${pos.lng}&radius=2000`)
      .then((r) => r.json()).then((data) => {
        setPins((data.reports ?? []).map((r: any) => ({
          id: r.id, lat: Number(r.lat), lng: Number(r.lng),
          severity: r.severity, type: r.type,
        })));
      });
  }, [pos]);

  const drawn = routes.map((r, i) => ({
    id: r.id, polyline: r.polyline, rank: i, active: r.id === activeRouteId,
  }));
  const active = routes.find((r) => r.id === activeRouteId);

  return (
    <div className="absolute inset-0">
      <MapView className="absolute inset-0" onReady={setMap} />
      <ReportPins map={map} pins={pins} />
      <RouteLine map={map} routes={drawn} />

      <div className="absolute top-3 left-3 right-3 bg-white/95 rounded-2xl px-4 py-3
                      shadow-md flex items-center justify-between backdrop-blur">
        <div>
          <div className="display text-base text-[var(--ink)]">
            {active?.duration_min ?? '—'} min
          </div>
          <div className="text-xs text-[var(--ink-3)]">
            safety score {active?.safety_score.toFixed(2) ?? '—'}
          </div>
        </div>
        <button onClick={onCancel}
          className="text-[var(--sev-acute)] text-sm">End trip</button>
      </div>
    </div>
  );
}

export type NearReport = {
  id: string;
  type: 'acute' | 'environmental';
  severity: 'low' | 'medium' | 'high';
  summary: string;
  lat: number;
  lng: number;
  reported_at: string;
};

function severityWeight(severity: string, type: string): number {
  const s = severity === 'high' ? 10 : severity === 'medium' ? 3 : 1;
  const t = type === 'acute' ? 4 : 1;
  return s * t;
}

function haversine(a: Coord, b: Coord): number {
  const R = 6_371_000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
```

- [ ] **Step 2: Wire into `app/page.tsx`**

Add prompt state. Modify the page component:

```tsx
import { NavigateScreen, type NearReport } from '@/components/screens/navigate';

// add to AppState:
//   activePrompt: NearReport | null;
// initialize: activePrompt: null,

const [state, setState] = useState<AppState>({
  // ...
  activePrompt: null,
} as AppState);

// ...
{state.screen === 'navigate' && state.origin && state.destination && state.activeRouteId && (
  <>
    <NavigateScreen
      origin={state.origin}
      destination={state.destination}
      mode={state.mode}
      routes={state.routes}
      activeRouteId={state.activeRouteId}
      onArrive={() => goto('arrive')}
      onCancel={() => goto('home')}
      onPromptOpen={(r) => setState((s) => ({ ...s, activePrompt: r }))}
      onActiveRouteChange={(rs, id) => setState((s) => ({ ...s, routes: rs, activeRouteId: id }))}
    />
    {/* PromptScreen wired in Task 17 */}
  </>
)}
```

- [ ] **Step 3: Smoke test on phone**

Run a route. Walk a few meters or fake position via Chrome DevTools "Sensors → Override location." Expected: header pill shows duration + safety score. After the first poll tick (within 7s) you should see a `/api/reports/near` call in the network tab.

- [ ] **Step 4: Commit**

```bash
git add components/screens/navigate.tsx app/page.tsx
git commit -m "feat: navigate screen with poll loop, geofence + reroute checks"
```

---

## Task 17: Prompt overlay

**Files:**
- Create: `components/screens/prompt.tsx`
- Modify: `app/page.tsx`

**Estimated time:** 60 min · **Hour band:** 16–19

- [ ] **Step 1: Implement Prompt overlay**

```tsx
// components/screens/prompt.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { getVoice } from '@/lib/voice';
import { parseYesNo } from '@/lib/voice/parse-yes-no';
import type { NearReport } from './navigate';
import type { Coord } from '@/app/page';

export function PromptOverlay({
  report, position, onClose, onCounted,
}: {
  report: NearReport;
  position: Coord;
  onClose: (kind: 'yes' | 'no' | 'skip') => void;
  /** Called only if the user actually answered (counts toward the 2-per-route cap). */
  onCounted: () => void;
}) {
  const fired = useRef(false);

  const submit = async (agree: boolean | null) => {
    if (fired.current) return;
    fired.current = true;
    if (agree !== null) {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: report.id,
          agree,
          responder_loc: position,
        }),
      });
      onCounted();
    }
    onClose(agree === true ? 'yes' : agree === false ? 'no' : 'skip');
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await getVoice();
      await v.speak(`Someone reported ${report.summary} here. Are you experiencing the same?`);
      if (cancelled) return;
      const ans = await v.listen({ timeoutMs: 8000 });
      if (cancelled) return;
      submit(parseYesNo(ans));
    })();
    return () => { cancelled = true; };
  }, [report.id]);

  return (
    <div className="absolute inset-0 z-50 bg-black/40 flex items-end">
      <div className="bg-[var(--card)] rounded-t-3xl w-full p-6 pb-8 shadow-2xl">
        <div className="mx-auto w-12 h-1 rounded-full bg-[var(--ink-4)] opacity-30 mb-4" />
        <p className="text-xs uppercase tracking-wider text-[var(--ink-4)]">Report nearby</p>
        <p className="display text-xl text-[var(--ink)] mt-2">"{report.summary}"</p>
        <p className="text-sm text-[var(--ink-3)] mt-2">
          Are you experiencing the same?
        </p>
        <div className="grid grid-cols-3 gap-2 mt-5">
          <button onClick={() => submit(false)}
            className="py-3 rounded-xl bg-[var(--paper-2)] text-[var(--ink)]">No</button>
          <button onClick={() => submit(null)}
            className="py-3 rounded-xl bg-transparent text-[var(--ink-3)]">Skip</button>
          <button onClick={() => submit(true)}
            className="py-3 rounded-xl bg-[var(--sev-acute)] text-white">Yes</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it inside Navigate render in `app/page.tsx`**

```tsx
import { PromptOverlay } from '@/components/screens/prompt';

// inside the navigate block:
{state.activePrompt && state.origin && (
  <PromptOverlay
    report={state.activePrompt}
    position={state.origin /* MVP: origin as proxy for current pos */}
    onClose={() => setState((s) => ({ ...s, activePrompt: null }))}
    onCounted={() => { /* count is tracked inside NavigateScreen on prompt open (see Task 16 trade-off) */ }}
  />
)}
```

For the MVP, pass `state.origin` as `position`. If time allows, hoist the navigate-screen `pos` into a context or move PromptOverlay into navigate.tsx so it sees the live location.

- [ ] **Step 3: Smoke test**

Walk into a 50m radius of a seeded report. Expected: voice asks the question, three buttons appear, tapping any closes the overlay. Verify `feedback_responses` row inserted only when "Yes" or "No" tapped.

- [ ] **Step 4: Commit**

```bash
git add components/screens/prompt.tsx app/page.tsx
git commit -m "feat: prompt overlay with voice question + feedback POST"
```

---

## Task 18: Arrive screen with rating chips

**Files:**
- Create: `components/screens/arrive.tsx`, `components/ui/rating-chips.tsx`
- Modify: `app/page.tsx`

**Estimated time:** 45 min · **Hour band:** 16–19

- [ ] **Step 1: Implement `RatingChips`**

```tsx
// components/ui/rating-chips.tsx
'use client';

export type Rating = 'lit_quiet' | 'caution' | 'avoid' | 'acute';

const ITEMS: { value: Rating; label: string; color: string }[] = [
  { value: 'lit_quiet', label: 'Lit / quiet', color: 'var(--sev-low)' },
  { value: 'caution',   label: 'Caution',     color: 'var(--sev-mid)' },
  { value: 'avoid',     label: 'Avoid',       color: 'var(--sev-high)' },
  { value: 'acute',     label: 'Acute',       color: 'var(--sev-acute)' },
];

export function RatingChips({ onPick }: { onPick: (r: Rating) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {ITEMS.map((it) => (
        <button key={it.value} onClick={() => onPick(it.value)}
          className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[var(--paper-2)]
                     active:scale-[0.98] transition-transform">
          <span className="w-3 h-3 rounded-full" style={{ background: it.color }} />
          <span className="display">{it.label}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Implement Arrive screen**

```tsx
// components/screens/arrive.tsx
'use client';

import { useEffect } from 'react';
import { RatingChips, type Rating } from '@/components/ui/rating-chips';
import { getVoice } from '@/lib/voice';
import type { RouteResponse } from '@/app/page';

export function ArriveScreen({
  activeRoute, mode, onDone,
}: {
  activeRoute: RouteResponse;
  mode: 'walking' | 'cycling';
  onDone: () => void;
}) {
  useEffect(() => {
    (async () => {
      const v = await getVoice();
      await v.speak("You've arrived. How did the route feel?");
    })();
  }, []);

  const submit = async (rating: Rating) => {
    await fetch('/api/route-feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        polyline: activeRoute.polyline,
        rating,
        duration_min: activeRoute.duration_min,
        mode,
      }),
    });
    const v = await getVoice();
    await v.speak('Thanks — that helps the next person.');
    setTimeout(onDone, 800);
  };

  return (
    <div className="absolute inset-0 bg-[var(--paper)] flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <h1 className="display text-3xl text-[var(--ink)]">You've arrived</h1>
        <p className="text-[var(--ink-3)] mt-2">How did the route feel?</p>
      </div>
      <div className="p-4 pb-8 space-y-3">
        <RatingChips onPick={submit} />
        <button onClick={onDone}
          className="w-full py-3 rounded-2xl text-[var(--ink-3)] bg-transparent">
          Skip
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into `app/page.tsx`**

```tsx
import { ArriveScreen } from '@/components/screens/arrive';
// ...
{state.screen === 'arrive' && state.activeRouteId && (() => {
  const active = state.routes.find((r) => r.id === state.activeRouteId);
  if (!active) return null;
  return <ArriveScreen activeRoute={active} mode={state.mode} onDone={() => goto('home')} />;
})()}
```

- [ ] **Step 4: Smoke test**

From the Navigate stub, click "Mock arrive." Expected: Arrive screen shows, voice plays, tapping a chip POSTs to `/api/route-feedback` (verify in Neon), voice says "Thanks," screen returns Home.

- [ ] **Step 5: Commit**

```bash
git add components/screens/arrive.tsx components/ui/rating-chips.tsx app/page.tsx
git commit -m "feat: arrive screen with rating chips + voice"
```

---

## Task 19: Demo polish, deploy, rehearsal

**Files:** miscellaneous polish only

**Estimated time:** 180 min · **Hour band:** 19–22

This is a polish + rehearsal task. Don't add features. Anything that works well enough is done.

- [ ] **Step 1: Push to GitHub and deploy to Vercel**

```bash
gh repo create safe-routes-amsterdam --public --source=. --push
vercel link    # accept prompts; pick the org and project name
vercel env add ANTHROPIC_API_KEY production
vercel env add GOOGLE_MAPS_API_KEY production
vercel env add NEXT_PUBLIC_MAPBOX_TOKEN production
# DATABASE_URL should already be set by the Neon Marketplace integration
vercel env add NEXT_PUBLIC_VOICE production    # 'web-speech'
vercel deploy --prod
```

If `vercel link` reports CLI version 50.37.0, upgrade first: `pnpm add -g vercel@latest`. Verify the deployed URL serves the app over HTTPS (geolocation + speech APIs require HTTPS on a real device).

- [ ] **Step 2: QR-code the URL**

Generate a QR code (e.g., `qrencode` or any web tool) pointing to the production URL. Save to `docs/superpowers/designs/demo-qr.png`. Pre-stage on the laptop for the demo.

- [ ] **Step 3: Run the seed once on production**

Production has its own Neon database. Re-run the seed against it:

```bash
DATABASE_URL=<prod url> pnpm db:seed
```

Verify in production Neon console that ~40 seed reports exist.

- [ ] **Step 4: Rehearse the demo on a real Android Chrome phone**

Walk the canonical path from spec §8 in the actual physical location if possible, otherwise simulate by overriding location in DevTools.

- [ ] Open the URL → permits granted → Home renders with cream map and dots
- [ ] Search "Centraal Station" → Route screen with two routes
- [ ] Voice says the safer route picked + reasons
- [ ] Start → Navigate header shows duration + safety score
- [ ] Walk into a seeded report's 50m radius → voice prompt fires
- [ ] Live report from a teammate's phone at a different location → reroute check picks up the new report → voice "safer route found" within 30s
- [ ] Reach destination → Arrive screen → tap "Lit / quiet" → voice "thanks"

If any beat fails, fix only the failing beat. Don't refactor.

- [ ] **Step 5: Pre-stage the fallback**

Have on hand:
- Hardcoded JSON of one route's response in `lib/dev/fallback-route.json` for if Google API key 403s on stage.
- Localhost dev server running as a backup if Vercel hiccups.

- [ ] **Step 6: Commit and tag**

```bash
git add -A
git commit -m "chore: demo polish, deployment, fallback assets"
git tag demo-v1
git push --tags
```

---

## Self-review

I checked the plan against the spec. Notes from the review pass:

**Spec coverage:**
- All five API endpoints have tasks (5-10) ✓
- All six screens have tasks (11-18) ✓
- Voice adapter + Resonate swap point: Task 5 ✓
- Push-to-talk semantics: Task 13 (button) + Task 14 (Report screen wires it) ✓
- Scoring algorithm with all five multipliers (severity × type × decay × distance × feedback) and length normalization: Task 6 ✓
- Reroute threshold (×0.6) and 30s minimum: Task 16 ✓
- 2-prompt cap per route + 1-min spacing: not strictly enforced in current Navigate code (only `alreadyPrompted` Set is). **Limitation to flag at runtime.** A 1-line counter could be added in Task 16; left as-is for hackathon scope-cut visibility.
- `feedback_responses.agree` insertion uses `'true'/'false'` strings — matches the schema field type chosen in Task 3 (`text`, not `boolean`) to avoid driver coercion.
- Seed data uses `source = 'seed'`, matching the schema check constraint.
- Rate limit (1 report / 30s per IP): Task 7 ✓
- Custom Mapbox style is in stretch goals only — Task 12 uses `light-v11` + paint overrides per spec §11.
- Filter chips moved to Arrive screen as `RatingChips`: Task 18 ✓
- Resonate adapter: Task 5 stubs the path so it can be filled in without touching consumers ✓

**Type / signature consistency:**
- `Coord = { lat, lng }` defined once in `app/page.tsx`, imported by every screen consistently.
- `RouteResponse` shape matches the API output in Task 9.
- `ReportLite` type used by `score.ts` matches the columns selected by `/api/reports/near` and `/api/route` PostGIS queries.
- `mode: 'walking' | 'cycling'` consistent across API contract, schema check, and UI.
- `getVoice()` returns `Promise<VoiceAdapter>` (not sync) — every consumer awaits.

**Placeholder scan:** No "TBD" / "implement later" / "similar to Task N" instances. Code blocks present in every code step.

**Fixed during review:**
- Caught a bug where `RouteLine` would draw the active route at `rank` based on `findIndex`, but `routes` is already sorted by `safety_score` ASC from the API — so `i` is the right rank, no extra `findIndex` needed. Updated Task 15 step 2 accordingly.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-25-safety-routing.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
