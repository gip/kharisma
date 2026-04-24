"use client";

import Link from "next/link";
import { Portrait, colorFromString } from "@/components/design/primitives";
import { useT } from "@/i18n/i18n-provider";
import type { MessageKey } from "@/i18n/messages";
import type { ThreadSummary } from "@/backend/types";

type Translator = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

function timeAgo(iso: string, t: Translator) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return t("conversation.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("conversation.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("conversation.hoursAgo", { count: hours });
  return t("conversation.daysAgo", { count: Math.floor(hours / 24) });
}

export function ThreadRow({
  thread,
  groupId,
  contextLabel,
  senderName,
}: {
  thread: ThreadSummary;
  groupId: string;
  /** Optional Circle name; rendered above the title when present (Latest view). */
  contextLabel?: string;
  /** Optional last sender's display name; rendered as a portrait. */
  senderName?: string;
}) {
  const t = useT();
  const portraitColor = colorFromString(
    thread.lastMessageSenderInboxId || thread.threadId,
  );
  const replyLabel =
    thread.replyCount === 1
      ? t("thread.replyCount.one", { count: thread.replyCount })
      : t("thread.replyCount.other", { count: thread.replyCount });

  return (
    <Link
      href={`/groups/${encodeURIComponent(groupId)}/threads/${encodeURIComponent(thread.threadId)}`}
      className="group flex items-start gap-3 rounded-2xl bg-[var(--surface)] p-3.5 shadow-[0_1px_2px_rgba(44,42,37,0.04),_0_8px_20px_-12px_rgba(44,42,37,0.10)] transition active:scale-[0.997]"
      aria-label={t("thread.openThread", { title: thread.title })}
    >
      <Portrait
        name={senderName ?? thread.title}
        color={portraitColor}
        size={32}
        ring
      />
      <div className="min-w-0 flex-1">
        {contextLabel ? (
          <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-faint)]">
            {contextLabel}
          </p>
        ) : null}
        <p
          className="truncate text-[15px] leading-[1.25] text-[var(--ink)]"
          style={{ fontFamily: "var(--font-serif)", fontWeight: 500 }}
        >
          {thread.title}
        </p>
        {thread.lastMessagePreview ? (
          <p className="mt-0.5 line-clamp-1 text-[13px] text-[var(--ink-soft)]">
            {thread.lastMessagePreview}
          </p>
        ) : null}
        <p className="mt-1 text-[11px] text-[var(--ink-faint)]">
          {timeAgo(thread.lastActivityAt, t)} · {replyLabel}
        </p>
      </div>
    </Link>
  );
}
