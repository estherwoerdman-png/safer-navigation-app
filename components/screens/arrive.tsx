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
    }).catch(() => { /* DB not ready */ });
    const v = await getVoice();
    await v.speak('Thanks — that helps the next person.');
    setTimeout(onDone, 800);
  };

  return (
    <div className="absolute inset-0 bg-[var(--paper)] flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[var(--primary)] mb-4 appear"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <h1 className="display text-3xl text-[var(--ink)] appear">You&rsquo;ve arrived</h1>
        <p className="text-[var(--ink-3)] mt-2 appear">How did the route feel?</p>
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
