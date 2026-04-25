'use client';

export function ReportsNearbyBadge({ count }: { count: number }) {
  if (count <= 0) {
    return (
      <div className="text-xs text-[var(--ink-3)] flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-[var(--sev-low)]" />
        <span>Quiet here right now</span>
      </div>
    );
  }
  return (
    <div className="text-xs text-[var(--ink-3)]">
      <span className="inline-block w-2 h-2 rounded-full bg-[var(--sev-acute)] mr-2 align-middle" />
      <strong>{count} reports nearby</strong> in the last hour
    </div>
  );
}
