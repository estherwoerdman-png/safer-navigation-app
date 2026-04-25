'use client';

import { useEffect, useRef } from 'react';
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
      }).catch(() => { /* DB not ready */ });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id]);

  return (
    <div className="absolute inset-0 z-50 bg-black/40 flex items-end">
      <div className="bg-[var(--card)] rounded-t-3xl w-full p-6 pb-8 shadow-2xl">
        <div className="mx-auto w-12 h-1 rounded-full bg-[var(--ink-4)] opacity-30 mb-4" />
        <p className="text-xs uppercase tracking-wider text-[var(--ink-4)]">Report nearby</p>
        <p className="display text-xl text-[var(--ink)] mt-2">&ldquo;{report.summary}&rdquo;</p>
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
