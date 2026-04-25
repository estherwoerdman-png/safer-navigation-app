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
