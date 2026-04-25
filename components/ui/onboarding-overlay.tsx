'use client';

import { useEffect, useState } from 'react';

const SLIDES = [
  {
    title: 'Speak up, anonymously',
    description:
      'Tap the green button to report what you see — voice only. No typing, no identity, no trail.',
    icon: (
      <svg
        width="80"
        height="80"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="9" y="2" width="6" height="13" rx="3" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <path d="M12 19v3" />
      </svg>
    ),
  },
  {
    title: 'Pins show recent reports',
    description:
      'Green is calm. Yellow says caution. Orange is risky. Red is acute. Tap any pin to confirm or deny what was reported.',
    icon: (
      <svg
        width="80"
        height="80"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    title: 'Safer, not just faster',
    description:
      'We route around reported incidents — even when it costs you a few extra minutes. Your call to take it or take the fastest path.',
    icon: (
      <svg
        width="80"
        height="80"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="6" cy="19" r="3" />
        <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
        <circle cx="18" cy="5" r="3" />
      </svg>
    ),
  },
];

export function OnboardingOverlay() {
  const [done, setDone] = useState(true);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      setDone(localStorage.getItem('onboarding-seen') === '1');
    } catch {
      setDone(true);
    }
  }, []);

  if (done) return null;

  const finish = () => {
    try {
      localStorage.setItem('onboarding-seen', '1');
    } catch {
      /* ignore */
    }
    setDone(true);
  };

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-[70] bg-[var(--paper)] flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="mb-8 text-[var(--primary)] appear">{slide.icon}</div>
        <h1 className="display text-2xl text-[var(--ink)] mb-3 appear">
          {slide.title}
        </h1>
        <p className="text-[var(--ink-3)] max-w-sm appear">
          {slide.description}
        </p>
      </div>

      <div className="p-6 pb-8 space-y-4">
        <div className="flex justify-center gap-2">
          {SLIDES.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all
                ${
                  i === step
                    ? 'bg-[var(--primary)] w-6'
                    : 'bg-[var(--ink-4)] opacity-30'
                }`}
            />
          ))}
        </div>

        <button
          onClick={() => (isLast ? finish() : setStep(step + 1))}
          className="w-full py-4 rounded-2xl bg-[var(--primary)] text-white display text-base
                     active:scale-[0.99] transition-transform"
        >
          {isLast ? 'Get started' : 'Next'}
        </button>

        {!isLast && (
          <button
            onClick={finish}
            className="w-full py-2 text-[var(--ink-3)] text-sm"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
