"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useT } from "@/i18n/i18n-provider";

export const MEMBER_NAME_PATTERN = /^[A-Za-z0-9_-]{3,10}$/;

export function HandlePromptModal({
  open,
  suggested,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  suggested: string;
  busy: boolean;
  error: string | null;
  onSubmit: (handle: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [handle, setHandle] = useState(suggested);

  useEffect(() => {
    if (open) {
      setHandle(suggested);
    }
  }, [open, suggested]);

  if (!open) return null;

  const trimmed = handle.trim();
  const isValid = MEMBER_NAME_PATTERN.test(trimmed);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid || busy) return;
    onSubmit(trimmed);
  }

  function handleCancel() {
    if (busy) return;
    onCancel();
  }

  return (
    <div
      data-testid="handle-prompt-overlay"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40"
      onClick={(event) => {
        if (event.target === event.currentTarget) handleCancel();
      }}
    >
      <div className="w-full max-w-[28rem] rounded-t-[1.5rem] border border-b-0 border-[var(--line)] bg-[var(--bg)] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
        <div className="mb-1 flex items-center justify-between">
          <h2
            className="text-[22px] leading-[1.1] tracking-[-0.01em] text-[var(--ink)]"
            style={{ fontFamily: "var(--font-serif)", fontWeight: 400 }}
          >
            {t("handle.title")}
          </h2>
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            aria-label={t("handle.cancel")}
            className="text-[var(--ink-soft)] transition hover:text-[var(--ink)] disabled:opacity-40"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <input
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              disabled={busy}
              placeholder={t("handle.placeholder")}
              autoFocus
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-soft)] focus:border-[var(--accent)] disabled:opacity-60"
            />
            <p className="mt-2 text-[12px] leading-[1.4] text-[var(--ink-soft)]">
              {t("handle.rules")}
            </p>
            {error ? (
              <p className="mt-2 text-[12px] leading-[1.4] text-red-600">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              className="rounded-xl border border-[var(--line)] px-4 py-2 text-[12px] font-medium text-[var(--ink)] transition active:scale-[0.97] disabled:opacity-40"
            >
              {t("handle.cancel")}
            </button>
            <button
              type="submit"
              disabled={!isValid || busy}
              className="ml-auto rounded-xl bg-[var(--accent)] px-4 py-2 text-[12px] font-medium text-[var(--bg)] transition active:scale-[0.97] disabled:opacity-40"
            >
              {t("handle.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
