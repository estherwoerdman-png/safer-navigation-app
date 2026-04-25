# Safety-Optimized Routing for Amsterdam — Design Spec

**Date:** 2026-04-25
**Context:** 24-hour hackathon project. Vibe-code build, voice partner: Resonate.
**Working name:** TBD.

## 1. Pitch

Mainstream maps optimize for *fastest* or *shortest*. For women walking and cycling in Amsterdam, neither is the right objective — they care about *safest*. This app is a mobile-first PWA that lets women report unsafe places by voice, and routes them around those places using a safety score derived from community reports.

The product has two voice-first surfaces:

1. **Reporting** — natural-language voice ("there's a guy following me on the canal") captured with the user's live GPS, classified by an LLM into `acute` vs `environmental` and a severity, stored anonymously.
2. **Navigation** — voice-guided routes that prefer safer paths, mid-trip rerouting if the situation changes, and a "did you feel this too?" prompt when the user passes a previously reported location.

## 2. Goals & non-goals

### MVP goals (24h)

- Report unsafe places by **push-to-talk** voice from the user's current GPS.
- LLM-classified reports stored in Postgres.
- Safety-scored alternative routes between two points (walking + cycling).
- Mid-trip rerouting if a clearly-safer route emerges.
- Geofence-triggered "did you feel this too?" prompts (max 2 per route).
- All six canonical screens shipped: Home / Report / Route / Navigate / Prompt / Arrive.
- Arrive screen captures one-tap retrospective route ratings (`Lit/quiet`, `Caution`, `Avoid`, `Acute`).
- Visual fidelity to the prototype's tokens, typography, and bespoke map cartography.
- Demo on a real phone via the deployed Vercel URL.

### Non-goals (MVP)

- User accounts, login, or identity verification.
- Identity tags on reports (women-only is assumed by the product framing, not by data fields).
- Retroactive pin placement — you can only report from where you are right now.
- Editing or deleting your own reports.
- Photo/video attachments.
- Native iOS/Android apps.
- Background notifications when the app is closed.
- Cities other than Amsterdam.
- Anti-abuse beyond a per-IP rate limit.

### Stretch goals (only if 4+ hours under budget)

- ElevenLabs TTS for nicer navigation voice.
- OSM environmental priors: `lit=no` streets and tunnels via Overpass API.
- Time-of-day modifier on environmental reports.
- Identity self-declaration on first launch (women / lgbtq+ / other) with per-identity weighting.
- Multi-identity scope (queer men, BIPOC, etc.).
- Route ratings (`route_feedback`) wired into the safety score — overlapping `avoid`/`acute`-rated polylines add a per-segment penalty.
- Custom Mapbox Studio style matching the prototype's full cartographic palette.

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                  Mobile-first PWA (Next.js 16)                   │
│                                                                  │
│  ┌──────────┐   ┌──────────────┐   ┌────────────────────────┐    │
│  │  Voice   │   │   Map UI     │   │  Navigation runtime    │    │
│  │ adapter  │   │  (Mapbox GL) │   │  (geo polling, prompts)│    │
│  │ (Resonate│   └──────────────┘   └────────────────────────┘    │
│  │  later)  │                                                    │
│  └────┬─────┘                                                    │
└───────┼──────────────────────────────────────────────────────────┘
        │ fetch
        ▼
┌──────────────────────────────────────────────────────────────────┐
│              Next.js API routes (Vercel Functions)               │
│                                                                  │
│  POST /api/reports         — submit a voice report               │
│  GET  /api/reports/near    — fetch reports near a point          │
│  POST /api/route           — get scored alternative routes       │
│  POST /api/feedback        — yes/no to a "did you feel this?"    │
│  POST /api/route-feedback  — one-tap rating from Arrive screen   │
└────┬─────────────────────────────────────────────────────┬───────┘
     │                                                     │
     ▼                                                     ▼
┌──────────────────────┐                       ┌──────────────────┐
│ Anthropic Claude API │                       │ Google Directions│
│  (classify report:   │                       │  API (alternative│
│   type+severity+     │                       │   routes)        │
│   summary)           │                       └──────────────────┘
└──────────────────────┘
                    │
                    ▼
       ┌──────────────────────────┐
       │ Neon Postgres + PostGIS  │
       │  reports, feedback_resp. │
       │  + seeded Amsterdam data │
       └──────────────────────────┘
```

### Tech stack (locked)

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 App Router on Vercel | Frontend + API in one deploy; QR-code-friendly URL |
| DB | Neon Postgres (Vercel Marketplace) + PostGIS | Free tier, auto-provisioned env vars, geo queries |
| ORM | Drizzle | Typed queries, fast setup |
| Map display | Mapbox GL JS | Free tier, beautiful default styles, easy polylines |
| Routing | Google Directions API (`alternatives=true`) | Up to 3 alts, walking + cycling, $200/mo free credit |
| Geocoding | Mapbox Geocoder | Bundles with Mapbox GL, free tier |
| Voice (MVP) | Web Speech API (browser) | Zero setup, free, swap point for Resonate |
| LLM | Anthropic Claude Haiku 4.5 | Fast classification (<1s), cheap |
| Hosting | Vercel | One-command deploy |

### Why this stack

- **Build speed > everything else** for 24h. Vercel + Neon + Drizzle gets us a deployed, typed, geo-capable backend in under an hour.
- **PostGIS** makes "reports within 30m of this polyline" a one-liner instead of hand-rolled haversine.
- **Mapbox for display, Google for routing** is a pragmatic decoupling — Mapbox GL is far easier to render polylines and markers in, but Google's `alternatives=true` is the only way to cheaply get re-rankable alt routes.
- **Web Speech API now, Resonate later** keeps voice working on day one with a 30-minute integration. The voice adapter is a single file; swapping in Resonate is a one-line provider change.

## 4. Data model

```sql
-- Reports filed by users, plus the seed corpus.
reports (
  id            uuid primary key default gen_random_uuid(),
  location      geography(point, 4326) not null,
  reported_at   timestamptz not null default now(),

  transcript    text not null,                    -- raw voice → text
  type          text not null check (type in ('acute','environmental')),
  severity      text not null check (severity in ('low','medium','high')),
  summary       text not null,                    -- 1-line model summary

  source        text not null default 'user'      -- 'user' | 'seed'
)

-- Yes/no answers to the "did you feel this too?" prompt.
feedback_responses (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references reports(id) on delete cascade,
  agree         boolean not null,
  responded_at  timestamptz not null default now(),
  responder_loc geography(point, 4326) not null
)

-- One-tap retrospective rating of a completed route (Arrive screen).
-- See Section 7.5 for semantics and decisions.
route_feedback (
  id            uuid primary key default gen_random_uuid(),
  polyline      geography(linestring, 4326) not null,
  rating        text not null check (rating in ('lit_quiet','caution','avoid','acute')),
  rated_at      timestamptz not null default now(),
  duration_min  int not null,
  mode          text not null check (mode in ('walking','cycling'))
)

create index reports_loc_gix on reports using gist (location);
create index route_feedback_geom_gix on route_feedback using gist (polyline);
```

### Notes

- `geography(point, 4326)` so PostGIS distance queries return meters directly.
- `source` distinguishes seeded from live reports — useful for honest demo counts and future analytics filters.
- `effective_severity` (with feedback ratio) and `time_decay` are computed at query/JS time, not stored, so the formulas can be tweaked without migrations.

### Seed data

~40–60 reports hand-placed across Amsterdam, matching archetypes documented in 2025 reporting on women's safety in the city — bicycle tunnels, station underpasses, industrial-edge streets, named locations from the AT5 / Pointer coverage. Mixed `type` and `severity`. Stored as `seeds/amsterdam-reports.json`, loaded via `pnpm db:seed`.

Reference for archetypes: AT5 (2025) found 85% of Amsterdam women avoid certain areas; named patterns include bicycle tunnels, post-closing shopping streets, station areas. The Pointer/AD map (~14k locations from ~12k women) is gated; we will email `onveilig@kro-ncrv.nl` post-hackathon to ask about real data access.

## 5. Reporting flow

### User experience (screens **Home → Report**)

1. From Home, **press and hold** the bottom CTA: "Report what you see — Hold to speak — anonymous." This switches to the Report screen.
2. App: *"Tell me what's happening."*
3. User speaks freely while holding — no categories, no dropdowns. *"There's a guy following me on the canal near Spui, I'm scared."*
4. App captures GPS at press-down; transcript finalizes on release.
5. Release → background `POST /api/reports` with `{ transcript, lat, lng }`.
6. Server calls Claude → returns structured fields → writes to DB.
7. App returns to Home and says: *"Reported. Stay safe — switching to the safest route home."* (if currently navigating)
8. Swiping up while pressed cancels without submitting.

### Voice adapter

```ts
// lib/voice/index.ts — the swap point for Resonate
export interface VoiceAdapter {
  speak(text: string): Promise<void>;
  listen(opts?: { timeoutMs?: number }): Promise<string>;
}

// lib/voice/web-speech.ts — MVP implementation
export class WebSpeechAdapter implements VoiceAdapter { ... }

// lib/voice/resonate.ts — placeholder, fill in when Resonate SDK arrives
export class ResonateAdapter implements VoiceAdapter { ... }

export const voice = process.env.NEXT_PUBLIC_VOICE === 'resonate'
  ? new ResonateAdapter() : new WebSpeechAdapter();
```

**Action item Sunday morning:** grab Resonate's API/SDK docs to confirm the interface fits — push-to-talk, streaming STT, TTS playback. The current shape assumes async `listen()` resolves with the full transcript at speech-end. If Resonate is streaming-first, `listen()` may need an iterator return.

### Classification call

```ts
const resp = await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 200,
  system: `You classify safety reports from women in Amsterdam.
Output JSON only, with keys: type, severity, summary.
- type: "acute" if something is happening or just happened (followed, harassed, attacked).
        "environmental" if it's a feeling about the place (dark, isolated, sketchy).
- severity: "low" | "medium" | "high"
- summary: one short sentence in past tense, third person, ≤120 chars.
        Used to ask other women: "someone reported {summary} — same?"`,
  messages: [{ role: 'user', content: transcript }],
});
```

Use prompt caching on the system message — this prompt fires on every report and is identical across calls.

### Edge cases (MVP)

- Empty/garbled transcript → server returns 400, app says *"Didn't catch that — try again."*
- GPS unavailable → app refuses to submit, says *"Need location to report."*
- Network failure mid-submit → optimistic local cache (one-deep), retry on next online event.
- Per-IP rate limit: 1 report / 30s.

## 6. Routing flow

### User experience (screens **Home → Route → Navigate**)

1. From Home, user taps the search field "Where to?" and speaks or types a destination: *"Take me to Centraal."*
2. App geocodes → calls `POST /api/route` → switches to the Route screen.
3. Route screen shows 1–3 ranked alternatives on the map, color-coded:
   - safest: `--primary` (deep forest), thicker line, drawn on top
   - alternatives: `--sev-mid` and `--sev-high` (mustard/burnt-orange), thinner, semi-transparent
4. Bottom sheet (Fraunces display headline + Inter body): *"Picked the safer route. Avoids 2 reported incidents near Spui. 3 min longer."* Plus a small toggle to switch to the fastest.
5. Voice mirrors the bottom-sheet copy.
6. User taps "Start" (or says "go") → switches to Navigate.

### `POST /api/route` contract

```ts
// request
{ origin: {lat, lng}, destination: {lat, lng}, mode: 'walking' | 'cycling' }

// response
{
  routes: [
    {
      id: 'route-0',
      polyline: 'encoded_string',
      duration_min: 14,
      distance_m: 2300,
      safety_score: 0.23,           // lower = safer
      incidents_avoided: 3,
      reasons: [
        "avoids 2 acute reports near Spui",
        "no high-severity reports along this path"
      ]
    }
    // ...up to 3, sorted ascending by safety_score
  ],
  recommended_id: 'route-0'
}
```

### Scoring algorithm

```
For each candidate route (1-3 alternatives from Google):

1. Decode Google's polyline → array of [lat, lng] segments.
2. PostGIS query for reports within 30m of any segment:
     SELECT * FROM reports
     WHERE ST_DWithin(location, ST_GeogFromText('LINESTRING(...)'), 30)
3. For each report r at time `now`:
     score(r) =
        severity_w[r.severity]              // low=1, medium=3, high=10
      × type_w[r.type]                      // environmental=1, acute=4
      × time_decay(r, now)                  // acute: e^(-hours/72), environmental: 1.0
      × distance_falloff(r, route)          // 1 / (1 + (dist_m / 30)²)
      × feedback_multiplier(r)              // 1 + 0.5 × agree_ratio (0 if no feedback)
4. safety_score = sum(score(r)) / route_length_km   // normalize so longer routes aren't unfairly penalized
5. incidents_avoided = count(reports near baseline) - count(reports near this)
                       (baseline = the fastest Google route)
6. reasons[] = top 2-3 highest-scoring reports avoided, formatted via templates
```

### Fastest route is always returned

We re-rank, we don't hide. The fastest route appears as one alternative so the user can override and see the tradeoff. This matters ethically (don't make the choice for them) and pragmatically (when there are no nearby reports, the fastest *is* the recommended).

### Reasons templating (no LLM in routing path)

```
"avoids {n} {type} reports near {nearest_landmark}"
"prefers areas with no recent acute reports"
```

LLM polish is a stretch goal.

### Edge cases

- Google returns only 1 route → still return it with `safety_score`; no comparison message.
- No reports near any route → all `safety_score: 0`; recommended = fastest. App: *"No safety concerns reported on any route — going fastest."*
- Route crosses water/non-walkable → trust Google's output.

## 7. Mid-trip rerouting + feedback prompt

(Active screen: **Navigate**. Geofence triggers slide up the **Prompt** overlay; arrival switches to **Arrive**.)

While navigating, the PWA polls every ~7s:

```ts
setInterval(async () => {
  const pos = await getCurrentPosition();

  // 1. Geofence check: any reports within 50m we haven't prompted on yet?
  const nearby = await fetch(`/api/reports/near?lat=${pos.lat}&lng=${pos.lng}&radius=50`);
  const eligible = nearby
    .filter(r => !alreadyPrompted.has(r.id))
    .filter(r => r.id !== ownReportIds)
    .sort(byScoreDesc)
    .slice(0, 1);

  if (eligible.length && promptCountThisRoute < 2 && minutesSinceLastPrompt > 1) {
    const r = eligible[0];
    voice.speak(`Someone reported ${r.summary} here. Are you experiencing the same?`);
    const answer = await voice.listen({ timeoutMs: 8000 });
    const agree = parseYesNo(answer);  // true | false | null
    alreadyPrompted.add(r.id);  // never re-prompt on the same report
    if (agree !== null) {
      await fetch('/api/feedback', { method: 'POST', body: JSON.stringify({
        report_id: r.id, agree, responder_loc: pos
      })});
      promptCountThisRoute++;  // only counts when user actually engaged
    }
  }

  // 2. Reroute check: is the remaining route clearly safer via an alt?
  if (timeSinceLastRerouteCheck > 30_000) {
    const alts = await fetch('/api/route', {
      method: 'POST',
      body: JSON.stringify({ origin: pos, destination, mode })
    });
    const current = alts.routes.find(r => r.id === activeRouteId);
    const safest = alts.routes[0];
    if (safest.id !== current.id && safest.safety_score < current.safety_score * 0.6) {
      voice.speak(`Safer route found. ${safest.reasons[0]}. Two minutes longer. Switching.`);
      switchToRoute(safest);
    }
  }
}, 7000);
```

### Cap rules

- Max **2 feedback prompts per route**. Counter resets when a new route starts (initial pick or mid-trip reroute switch).
- Min **1 minute between prompts** (so two adjacent acute reports don't double-fire).
- Pick the **highest-scoring eligible report** when several are in range.
- **Skip own reports** entirely. (`ownReportIds` is the set of report IDs filed from this device this session.)
- Skip-on-no-answer (`agree === null`) does **not** count against the cap — but the prompted report is added to `alreadyPrompted` so the same one doesn't fire again on the next tick.

### Reroute trigger threshold

- Only switch if `safest_score < current_score × 0.6` (40% improvement). Prevents flapping.
- Re-check at most every 30 seconds.
- Voice announces *before* switching — gives mental warning.

### `parseYesNo()`

Tiny keyword matcher — yes/yeah/ja → true; no/nope/nee → false; anything else → null (skip). No LLM needed.

### Background-tab handling

- Foreground only at MVP (push notifications = v2).
- iOS Safari kills `setInterval` aggressively; use Page Visibility API to pause when hidden, resume on focus. Phone screen will be on for the demo anyway.

### Edge cases

- Voice prompt fires while user is mid-sentence reporting → queue, don't interrupt.
- User says nothing within 8s → `agree: null` (skip), don't count against prompt cap.
- GPS jitter (sudden 200m jump) → ignore positions whose accuracy >50m or whose delta from last >100m/s.

## 7.5. Arrive: retrospective route rating

(Active screen: **Arrive**. Triggered when the user reaches the destination — within 30m of the destination point for 5 consecutive seconds.)

### User experience

1. Voice: *"You've arrived. How did the route feel?"*
2. Arrive screen shows four one-tap chips, side by side, using `--sev-*` tokens for the dot color:
   - 🟢 **Lit / quiet** — pleasant, well-lit, populated
   - 🟡 **Caution** — slightly off
   - 🟠 **Avoid** — wouldn't take it again
   - 🔴 **Acute** — actively unsafe
3. User taps one → `POST /api/route-feedback` → app says *"Thanks — that helps the next person."*
4. Skipping is fine: a "skip" button (or 30s of inactivity) closes Arrive without rating.

### Why this is its own mechanic, not a regular report

A regular report says "this place is unsafe right now." A route rating says "the whole path I just walked felt {tag}." Different scope, different signal — averaging it across the route's segments gives us a passive safety prior even when the user has nothing specific to report.

### Data flow

`POST /api/route-feedback` writes to a new table:

```sql
route_feedback (
  id            uuid primary key default gen_random_uuid(),
  polyline      geography(linestring, 4326) not null,
  rating        text not null check (rating in ('lit_quiet','caution','avoid','acute')),
  rated_at      timestamptz not null default now(),
  duration_min  int not null,         -- of the original route
  mode          text not null         -- 'walking' | 'cycling'
)

create index route_feedback_geom_gix on route_feedback using gist (polyline);
```

### Wired into routing scoring? (decision)

For MVP, **no** — the chips capture data, but the routing score in Section 6 doesn't yet read from `route_feedback`. The demo shows the chip flow and the data persisting; the feedback loop closes in v2.

Stretch goal if hours allow: per-segment penalty when a route's polyline overlaps a recently-`avoid`-rated polyline by more than 30m for >100m of length. Cheap PostGIS query, ~1 hour.

### Edge cases

- User dismisses Arrive without rating → no row, fine.
- Trip ended early (user cancelled before destination) → still show Arrive but voice changes to *"Trip cancelled. How did it feel?"*
- Rapid double-tap → debounce, only the first tap submits.

## 8. Demo scenario (90 seconds, rehearse exactly)

1. **Home screen on a real phone.** Cream-paper map of Amsterdam, scattered severity dots (seeded reports), search field on top, "Report what you see" pill at the bottom. *"Every dot is a place a woman reported feeling unsafe."*
2. **Search → Route screen.** Speak destination: *"Take me from Spui to Centraal."* Two routes appear: forest-green safer drawn over mustard fastest. Voice + bottom sheet: *"Picked the safer route. Avoids 2 reports near Rokin. 3 min longer."*
3. **Tap Start → Navigate screen, walk a few meters.** Geofence fires the **Prompt** overlay. Voice: *"Someone reported 'a man followed me into the alley' near here last Tuesday — are you experiencing the same?"* Say *"no."*
4. **Live report on stage (Home → Report screen).** A teammate, standing at a different seeded location, presses-and-holds the report button: *"Group of guys yelling at me, I don't feel safe."* Releases. Two seconds later, the demo phone's Navigate screen updates and reroutes around the new point. **Wow moment.**
5. **Arrive screen.** Voice: *"You've arrived. How did the route feel?"* Tap the 🟢 *Lit / quiet* chip. *"Thanks — that helps the next person."*
6. **Close.** *"Every report — and every route rating — makes the next woman's route safer. Built in 24 hours, runs in any browser, ready for any city."*

### Demo failure modes to harden against

- Wifi flaky on stage → cache seeded data + last route in localStorage so the map still renders offline.
- Voice doesn't trigger on iOS → demo on Android Chrome (test ahead of time).
- Google API key 403s → keep a hardcoded fallback route + reports in dev for the worst case.

## 9. 24h timebox

| Hours | What ships |
|---|---|
| 0–2 | Repo bootstrap (Next.js + Vercel + Neon + Drizzle), schema, seed data loaded, design tokens + fonts wired |
| 2–5 | `POST /api/reports` + Claude classification + `GET /api/reports/near` |
| 5–9 | `POST /api/route` with Google Directions + scoring algorithm |
| 9–13 | Home + Route screens: Mapbox with custom style (or `light-v11` + paint overrides), severity dots, route lines |
| 13–16 | Voice adapter (Web Speech), Report screen with push-to-talk, destination flow |
| 16–19 | Navigate + Prompt + Arrive screens; poll loop, geofence prompts, mid-trip reroute |
| 19–22 | Polish: voice copy, route reasons, Arrive chips wiring, demo script rehearsal |
| 22–24 | Buffer for the inevitable demo gremlins. **Do not skip this.** |

### Scope-cut order if behind

Drop in this order — shipping the demo matters more than any feature:

1. Wiring `route_feedback` into the routing score (already a stretch goal; keep as data-only) — saves ~1h
2. Mid-trip rerouting (keep safety scoring on initial route; cut live re-pick) — saves ~2h
3. Feedback prompt + `feedback_responses` table — saves ~1.5h
4. Live reporting during the demo (use only seeded data) — saves ~1h
5. Arrive screen entirely (cut chips + voice prompt) — saves ~45 min
6. Voice output beyond destination + route announcement — saves ~30 min
7. Multiple routes — show only the safest — saves ~30 min

## 10. Open items to resolve at start of build

- **Resonate API shape** — confirm push-to-talk vs streaming so the `VoiceAdapter` interface is right the first time.
- **Google Maps API key** — confirm one team member has billing enabled. Test `alternatives=true` returns 2+ routes for the demo origin/dest pair before committing to it on stage.
- **Mapbox token** — free public token is fine for the demo URL.
- **Anthropic API key** — already known available.
- **Test phone** — confirm the demo phone is Android Chrome (Web Speech API is reliable there).
- **Pointer dataset** — email `onveilig@kro-ncrv.nl` for real data access *after* the hackathon, not during.

## 11. Design system

A visual prototype lives at [`docs/superpowers/designs/`](../designs/) with screenshots and an `index.html` defining the design tokens. The spec defers to the prototype for any visual question; this section captures what implementation needs to know.

### Tokens (CSS custom properties)

```css
/* Ink (text) */
--ink:        #1a1a1a;     /* primary */
--ink-2:      #2b2b2b;
--ink-3:      #5b5852;     /* secondary */
--ink-4:      #8a857c;     /* tertiary */

/* Paper (background) — warm cream, NOT cold white */
--paper:      #f5f1e8;
--paper-2:    #ece6d6;
--card:       #ffffff;

/* Brand */
--primary:    #2f4a3a;     /* deep forest — trustworthy, ungendered, calm */
--primary-2:  #3e5e4b;
--primary-3:  #c8d4cc;
--accent:     #c2693e;     /* burnt amber — used for the report CTA + bridges */

/* Severity (desaturated traffic light) */
--sev-low:    #6b9c5e;
--sev-mid:    #d8b34a;
--sev-high:   #d8843a;
--sev-acute:  #c44a3e;

/* Map cartography — bespoke, do not use Mapbox default */
--map-land:        #f0e9d6;
--map-block:       #e6dec8;
--map-water:       #b8cfd6;
--map-park:        #cfdbb8;
--map-road:        #ffffff;
--map-road-edge:   #e0d6bd;
--map-bridge:      #c2693e;
--map-text:        #6b665a;
--sky:             #f5f1e8;
```

### Typography

- **UI:** Inter — 400, 500, 600, 700.
- **Editorial / display:** Fraunces (variable, optical-size 9–144), 400–600. Used sparingly — section headers, brand moments.
- Loaded from Google Fonts; inlined as a `<link>` in `app/layout.tsx`.

### Map style

The design uses a custom cartographic palette (cream land, sage parks, white roads, amber bridges). **Default for the hackathon: Mapbox `light-v11` with paint overrides** via `map.setPaintProperty()` to swap in the `--map-*` tokens. ~30 min, gets us 80% of the look.

Stretch goal (only if 4+ hours under budget): a full Mapbox Studio style matching the tokens. Don't author this on critical path.

Emergency fallback: a hardcoded static SVG of the rehearsed demo route. Reserve for if the Mapbox token fails on stage.

### Tone

Warm, calm, protective. Not panic-coded. Not gendered. Cream + forest + amber reads as editorial / civic / trustworthy — closer to Stamen-style cartography than mainstream maps.

### Canonical screens

| # | Name | Purpose |
|---|---|---|
| 01 | **Home** | Map view with reports + search field + push-to-talk report CTA |
| 02 | **Report** | Active recording state — voice capture overlay |
| 03 | **Route** | Alternative routes shown on map + bottom sheet with safety reasoning |
| 04 | **Navigate** | Active turn-by-turn-ish, voice-led, glanceable |
| 05 | **Prompt** | "Did you feel this too?" geofence-triggered overlay |
| 06 | **Arrive** | Trip done — optional "report anything from this trip?" |

### Components reflected in the prototype

- **Search field** — pill-shaped, warm-white, magnifier left, sun/compass affordance right (time-of-day toggle, stretch goal).
- **Reports-nearby badge** — small dot + "3 reports nearby in the last hour" under the search.
- **Map controls** — layers toggle (top-right), recenter (below it).
- **Severity dots** — small filled circles using the `--sev-*` tokens; map labels for districts (italic, `--map-text`); bridges named in burnt amber.
- **Report CTA** — full-width pill at bottom of Home. Deep-forest fill, leading mic icon. Two-line label: "Report what you see / Hold to speak — anonymous". **Push-to-talk**, not tap-to-toggle.
- **Route-rating chips** (on the **Arrive** screen, not Home): `Lit / quiet`, `Caution`, `Avoid`, `Acute`. One-tap retrospective rating of the route just completed. See Section 7.5 for behavior.

### Push-to-talk semantics

- Press = start recording, GPS captured at press.
- Release = stop, transcript finalized, submit.
- Cancel = swipe up while pressed (gesture from the prototype).
- Mid-recording haptic tick every 5s.
- Maps cleanly to the `VoiceAdapter.listen()` interface — the press/release lifecycle wraps the adapter call.

### Implementation notes

- Tokens become a single `app/styles/tokens.css` import.
- Inter + Fraunces via `next/font/google` with `display: 'swap'` and a fallback stack.
- Don't ship the `tweaks-panel.jsx` runtime — it's prototype-only.
- The radial canal-ring map look in the prototype is genuinely Amsterdam's geography — Mapbox at zoom 13 + the custom style will reproduce it for free. No SVG hand-tracing required.

## 12. Out of scope (explicit)

- No multi-tenant city support — Amsterdam only, hardcoded map bounds.
- No moderation / abuse handling beyond rate limiting.
- No analytics / observability beyond Vercel's built-in.
- No tests beyond manual demo rehearsal. Hackathon trade-off; document this so we don't pretend otherwise.
- No accessibility audit. The voice-first design helps, but a full WCAG pass is post-hackathon.
- No i18n. UI copy is English; voice copy is English. Dutch voice is a v2.
