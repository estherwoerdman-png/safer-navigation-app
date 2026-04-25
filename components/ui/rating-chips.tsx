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
