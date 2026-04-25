'use client';

export function EmergencyButton() {
  return (
    <a
      href="tel:112"
      aria-label="Emergency call 112"
      className="fixed top-3 right-3 z-[60] bg-[var(--sev-acute)] text-white
                 w-12 h-12 rounded-full flex items-center justify-center
                 shadow-lg active:scale-[0.95] transition-transform"
    >
      <span className="text-xs font-bold tracking-wider">SOS</span>
    </a>
  );
}
