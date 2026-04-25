import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export type RouteContext = {
  id: string;
  /** 0 = safest (recommended). Higher = less safe. */
  rank: number;
  duration_min: number;
  distance_m: number;
  topReports: Array<{
    type: 'acute' | 'environmental' | 'positive';
    severity: 'low' | 'medium' | 'high';
    summary: string;
  }>;
  /** Meters of this route others rated as well-lit and quiet. */
  litQuietMeters: number;
  /** Meters of this route others rated as avoid or acute. */
  unsafeRatedMeters: number;
};

const SYSTEM = `You write short voice-friendly reasons for a women's safety routing app in Amsterdam.

Input is JSON: { "routes": [{ id, rank, duration_min, distance_m, topReports, litQuietMeters, unsafeRatedMeters }] }
  - rank 0 is the SAFEST route (the recommended one); higher rank = less safe alternative.
  - topReports lists nearby reports influencing this route's safety score (acute = an event happened; environmental = how the place feels; positive = others rated it safe).
  - litQuietMeters = meters of this route that others have rated as well-lit and quiet.
  - unsafeRatedMeters = meters of this route that others have rated as avoid or acute.

For each route, output 1–3 reasons. Each reason:
  - ≤80 characters (it will be read aloud).
  - calm, conversational, specific. Mention real signal — a particular report, the lit/quiet stretch, etc.
  - avoid clinical phrasing like "avoids 521m of stretches"; say something like "skirts a stretch other women avoid".
  - if a route has no concerning data, give an honest positive reason (e.g. "Quiet, uneventful route." or "Nothing reported along this path.").
  - the rank-0 route should sound like a recommendation; higher-ranked routes should explain why they're less ideal.

Output ONLY a JSON object of the shape:
  { "routes": [{ "id": "...", "reasons": ["...", "..."] }] }
No code fences, no commentary, no extra keys.`;

/**
 * Generate natural-language reasons for each candidate route. One Claude
 * Haiku call summarizes all routes together (cheaper + lower latency than
 * per-route calls). Returns null if the call times out or errors — caller
 * should fall back to template reasons.
 */
export async function generateReasons(
  routes: RouteContext[],
  timeoutMs = 2500,
): Promise<Map<string, string[]> | null> {
  if (routes.length === 0) return new Map();

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await getClient().messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: JSON.stringify({ routes }) }],
      },
      { signal: ctrl.signal },
    );

    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')
      .trim();
    const json = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(json) as {
      routes?: Array<{ id?: string; reasons?: unknown }>;
    };

    const map = new Map<string, string[]>();
    for (const r of parsed.routes ?? []) {
      if (typeof r.id !== 'string' || !Array.isArray(r.reasons)) continue;
      const cleaned = r.reasons
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.trim().slice(0, 100))
        .slice(0, 3);
      if (cleaned.length > 0) map.set(r.id, cleaned);
    }
    return map.size > 0 ? map : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
