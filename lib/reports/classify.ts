import Anthropic from '@anthropic-ai/sdk';

let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (_anthropic) return _anthropic;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  _anthropic = new Anthropic({ apiKey: key });
  return _anthropic;
}

export type SafetyClassification = {
  type: 'acute' | 'environmental' | 'positive';
  severity: 'low' | 'medium' | 'high';
  summary: string;
};

export type IrrelevantClassification = {
  type: 'irrelevant';
  reason: string;
};

export type Classification = SafetyClassification | IrrelevantClassification;

const SYSTEM = `You classify what women in Amsterdam say when reporting on a safety-routing app.
Input may be in any language (English, Dutch, etc.). The summary you produce MUST always be in English.
Output ONLY a single JSON object. No prose, no markdown, no code fences.

Possible classifications:

1) ACUTE — something is happening or just happened to the speaker (followed, grabbed,
   harassed, exposed-to, threatened, groped). The actor is a person doing something.
   Required keys: type="acute", severity, summary.

2) ENVIRONMENTAL — the speaker is describing how a place feels or looks: dim, isolated,
   sketchy crowd, watched, intimidating layout. This includes personal judgements about
   people in the area when no specific event has occurred (e.g. "men staring from a van"
   feels off but is a vibe, not an incident). Annoyance about non-threatening behaviour
   like noisy kids also counts as environmental.
   Required keys: type="environmental", severity, summary.

3) POSITIVE — the speaker is reporting that the route or place felt safe, calm, or
   pleasant. Use this for "I just got home safely", "this stretch was fine", "well-lit
   and busy".
   Required keys: type="positive", severity="low", summary (in English, e.g. "Walked home
   through Vondelpark and felt safe.").

4) IRRELEVANT — the input is not about personal safety at all (traffic complaints, bike
   lane width, weather, lost-and-found, property damage, generic city gripes).
   Required keys: type="irrelevant", reason (one short English sentence explaining why
   it was rejected).

Severity scale (only for acute / environmental / positive):

For ACUTE (events the speaker experiences):
  - low: a single brief moment, no contact, no sustained pursuit
    (e.g. one kissing sound, one honk, one yell, brief uncomfortable stare,
    one persistent number request)
  - medium: sustained or repeated, multiple actors, escalating, blocking path
    (e.g. cycling alongside and asking questions, group yelling continuously)
  - high: physical contact (grabbed, touched, groped), exposure, weapons,
    explicit threats, being followed/pursued, assault attempted

For ENVIRONMENTAL (vibe / place):
  - low: mild aesthetic issue (slightly dim, uneven, slightly off, would prefer
    a busier route)
  - medium: general unease, isolation, dimness, watched feeling, low foot traffic
  - high: speaker uses words like dangerous, threatening, aggressive, intimidating,
    or says "I would never walk here alone", or describes a clearly hostile crowd
    or active loitering that feels physically threatening

For POSITIVE: always severity="low".

The summary is one short sentence in English, past tense, third person, ≤120 chars.
It will be read aloud to other users as "someone reported {summary} — same?".

Edge cases:
  - Secondhand reports about a real event ("my friend got harassed here last week",
    "someone was attacked on this street") are still ACUTE, classified by what
    happened, not by who was speaking. They are useful safety data for the area.
    Set severity by the seriousness of the underlying event.
  - Groping or unwanted touching is always severity="high" even if brief.
  - "A man stared from a van and I felt watched" → environmental (vibe-based judgement,
    not an event).
  - "Probably fine but I'd prefer a busier route" → environmental/low (a preference
    for safer routing, NOT positive). Positive is reserved for explicit affirmations
    that the place or route felt safe/calm/good.
  - Non-Dutch/English input is fine — translate the situation into a clean English summary.

Output schema:
  acute / environmental / positive: { "type": "...", "severity": "...", "summary": "..." }
  irrelevant: { "type": "irrelevant", "reason": "..." }`;

export async function classifyReport(transcript: string): Promise<Classification> {
  const resp = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 250,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: transcript }],
  });

  const text = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')
    .trim();

  const json = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(json) as {
    type?: string;
    severity?: string;
    summary?: string;
    reason?: string;
  };

  // Defensive validation — model can drift.
  const allowedTypes = ['acute', 'environmental', 'positive', 'irrelevant'] as const;
  type AllowedType = (typeof allowedTypes)[number];
  const isAllowed = (t: unknown): t is AllowedType =>
    typeof t === 'string' && (allowedTypes as readonly string[]).includes(t);

  if (!isAllowed(parsed.type)) {
    return {
      type: 'irrelevant',
      reason: `Could not classify (model returned type=${parsed.type ?? 'undefined'})`,
    };
  }

  if (parsed.type === 'irrelevant') {
    return {
      type: 'irrelevant',
      reason: typeof parsed.reason === 'string' && parsed.reason.trim()
        ? parsed.reason.slice(0, 200)
        : 'Not a safety concern',
    };
  }

  // acute | environmental | positive
  const severity = ['low', 'medium', 'high'].includes(parsed.severity ?? '')
    ? (parsed.severity as 'low' | 'medium' | 'high')
    : 'medium';
  const summary = typeof parsed.summary === 'string' && parsed.summary.trim()
    ? parsed.summary.slice(0, 200)
    : 'Reported a safety observation';

  return {
    type: parsed.type as 'acute' | 'environmental' | 'positive',
    severity: parsed.type === 'positive' ? 'low' : severity,
    summary,
  };
}
