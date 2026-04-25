'use client';

import type { NearReport } from '@/components/screens/navigate';

export function ReportDetailSheet({
  report,
  onAnswer,
  onDismiss,
}: {
  report: NearReport;
  onAnswer: (agree: boolean | null) => void;
  onDismiss: () => void;
}) {
  const minutes = Math.max(
    1,
    Math.floor((Date.now() - new Date(report.reported_at).getTime()) / 60000),
  );
  const timeLabel =
    minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ago`;

  return (
    <div
      className="absolute inset-0 z-50 bg-black/40 flex items-end"
      onClick={onDismiss}
    >
      <div
        className="bg-[var(--card)] rounded-t-3xl w-full p-6 pb-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-12 h-1 rounded-full bg-[var(--ink-4)] opacity-30 mb-4" />
        <p className="text-xs uppercase tracking-wider text-[var(--ink-4)]">
          Reported {timeLabel}
        </p>
        <p className="display text-xl text-[var(--ink)] mt-2">
          &ldquo;{report.summary}&rdquo;
        </p>
        <p className="text-sm text-[var(--ink-3)] mt-2">
          Are you experiencing the same?
        </p>
        <div className="grid grid-cols-3 gap-2 mt-5">
          <button
            onClick={() => onAnswer(false)}
            className="py-3 rounded-xl bg-[var(--paper-2)] text-[var(--ink)] active:scale-[0.98] transition-transform"
          >
            No
          </button>
          <button
            onClick={() => onAnswer(null)}
            className="py-3 rounded-xl bg-transparent text-[var(--ink-3)] active:scale-[0.98] transition-transform"
          >
            Skip
          </button>
          <button
            onClick={() => onAnswer(true)}
            className="py-3 rounded-xl bg-[var(--sev-acute)] text-white active:scale-[0.98] transition-transform"
          >
            Yes
          </button>
        </div>
      </div>
    </div>
  );
}
