"use client";

type GroupAction = "thread" | "invest";

export function GroupActionSheet({
  open,
  onClose,
  onPick,
  threadLabel,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (action: GroupAction) => void;
  threadLabel: string;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[28rem] rounded-t-[1.5rem] border border-b-0 border-[var(--line)] bg-[var(--bg)] px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[var(--line)]" />
        <div className="space-y-1.5 p-1">
          <button
            type="button"
            onClick={() => onPick("thread")}
            className="flex w-full items-center gap-3 rounded-2xl bg-[var(--surface)] px-4 py-3 text-left transition active:scale-[0.995]"
          >
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--ink)]"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[15px] text-[var(--ink)]">
                {threadLabel}
              </span>
              <span className="text-[12px] text-[var(--ink-soft)]">
                Open a new conversation in this circle
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => onPick("invest")}
            className="flex w-full items-center gap-3 rounded-2xl bg-[var(--surface)] px-4 py-3 text-left transition active:scale-[0.995]"
          >
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--ink)]"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 17l6-6 4 4 8-8" />
                <path d="M14 7h7v7" />
              </svg>
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[15px] text-[var(--ink)]">Invest</span>
              <span className="text-[12px] text-[var(--ink-soft)]">
                Record a contribution to this circle
              </span>
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-2xl px-4 py-3 text-[14px] text-[var(--ink-soft)] transition hover:text-[var(--ink)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
