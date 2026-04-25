'use client';

export function SearchField({
  value,
  onChange,
  onSubmit,
  placeholder = 'Where to?',
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="bg-white/95 rounded-2xl px-4 py-3 shadow-md flex items-center gap-3 backdrop-blur"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-[var(--ink-3)] shrink-0"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search destination"
        className="flex-1 outline-none bg-transparent text-[var(--ink)] placeholder:text-[var(--ink-4)]"
      />
    </form>
  );
}
