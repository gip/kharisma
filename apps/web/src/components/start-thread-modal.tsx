"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useT } from "@/i18n/i18n-provider";

export function StartThreadModal({
  open,
  busy,
  onClose,
  onCreate,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (input: { title: string; firstMessage: string }) => Promise<void>;
}) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setFirstMessage("");
      setLocalError(null);
      queueMicrotask(() => titleRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setLocalError(t("thread.startTitle"));
      return;
    }
    try {
      await onCreate({ title: trimmed, firstMessage: firstMessage.trim() });
    } catch (cause) {
      setLocalError(
        cause instanceof Error ? cause.message : "Failed to start thread",
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[26rem] space-y-3 rounded-[22px] bg-[var(--bg)] p-5 shadow-[0_20px_40px_-20px_rgba(44,42,37,0.35)]"
      >
        <h2
          className="text-[22px] leading-[1.1] tracking-[-0.01em] text-[var(--ink)]"
          style={{ fontFamily: "var(--font-serif)", fontWeight: 400 }}
        >
          {t("thread.start")}
        </h2>
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
          placeholder={t("thread.startTitle")}
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] disabled:opacity-60"
          maxLength={140}
        />
        <textarea
          value={firstMessage}
          onChange={(e) => setFirstMessage(e.target.value)}
          disabled={busy}
          placeholder={t("thread.startFirstMessage")}
          rows={3}
          className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] disabled:opacity-60"
        />
        {localError ? (
          <p className="text-[12px] text-[var(--danger-ink)]">{localError}</p>
        ) : null}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl px-3 py-2 text-[13px] text-[var(--ink-soft)] disabled:opacity-40"
          >
            {t("thread.createCancel")}
          </button>
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-[13px] font-medium text-[var(--bg)] transition active:scale-[0.97] disabled:opacity-40"
          >
            {t("thread.create")}
          </button>
        </div>
      </form>
    </div>
  );
}
