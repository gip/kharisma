"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session-provider";
import { VideoRecorder } from "@/components/video-recorder";
import { Portrait } from "@/components/design/primitives";
import { ProtectedRouteLoading } from "@/components/protected-route-loading";
import { useT } from "@/i18n/i18n-provider";
import type { MessageKey } from "@/i18n/messages";
import type { XmtpMessage } from "@/xmtp/types";
import {
  GENERAL_THREAD_ID,
  type KharismaGroupSummary,
  type KharismaSenderSummary,
} from "@/backend/types";

const SENDER_COLORS = ["#D4805A", "#9B8EC4", "#6BA3A0", "#C9A87C", "#8BBF6A"];

function senderColorByIndex(index: number) {
  return SENDER_COLORS[index % SENDER_COLORS.length];
}

function Spinner() {
  return <span className="spinner" aria-hidden />;
}

export function visibleMessageText(message: XmtpMessage) {
  if (message.threadCreate) return null;
  return message.content ?? message.fallback;
}

function upsertMessage(messages: XmtpMessage[], nextMessage: XmtpMessage) {
  return [
    nextMessage,
    ...messages.filter((message) => message.id !== nextMessage.id),
  ].sort((left, right) => right.sentAt.getTime() - left.sentAt.getTime());
}

type Translator = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

function timeAgo(date: Date, t: Translator) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return t("conversation.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("conversation.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("conversation.hoursAgo", { count: hours });
  return t("conversation.daysAgo", { count: Math.floor(hours / 24) });
}

function roleBadge(sender: KharismaSenderSummary, color: string, t: Translator) {
  const isAgent = sender.role === "A";
  const label = isAgent
    ? t("conversation.role.agent", { name: sender.name })
    : t("conversation.role.human");
  return (
    <span
      className="font-[family-name:var(--font-mono)] text-[9px] rounded-md px-1.5 py-[1px]"
      style={{
        background: `${color}18`,
        color,
      }}
    >
      {label}
    </span>
  );
}

function VideoThumbnail({
  src,
  thumbnailUrl,
}: {
  src: string;
  thumbnailUrl?: string | null;
}) {
  const t = useT();
  const [playing, setPlaying] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const hasPoster = !!thumbnailUrl && !posterFailed;

  if (playing) {
    return (
      <div className="relative aspect-[4/5] bg-black">
        <video
          src={src}
          autoPlay
          controls
          playsInline
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/5] bg-black">
      {hasPoster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setPosterFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface)]">
          <span className="text-xs text-[var(--ink-faint)]">
            {t("conversation.videoFallback")}
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className="absolute inset-0 flex items-center justify-center"
        aria-label={t("conversation.playVideo")}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </button>
    </div>
  );
}

function CircleIntroEntry({
  group,
  isOwn,
  t,
}: {
  group: KharismaGroupSummary;
  isOwn: boolean;
  t: Translator;
}) {
  const lead =
    group.senders.find((s) => s.role === "H" || s.role === "HA") ?? null;
  const name = lead?.name ?? t("conversation.unknown");
  const color = senderColorByIndex(0);
  const hasMedia = !!group.mediaUrl;

  return (
    <div className="relative mb-[18px]">
      <div className="absolute top-0" style={{ left: "-30px" }}>
        <Portrait name={name} color={color} size={22} ring />
      </div>

      <div className="mb-1 flex min-h-[22px] items-center gap-1.5">
        <span className="text-[13px] font-medium leading-none" style={{ color }}>
          {name}
          {isOwn ? ` (${t("conversation.you")})` : ""}
        </span>
        {lead ? roleBadge(lead, color, t) : null}
        <span className="text-[10px] leading-none text-[var(--ink-faint)]">
          {t("conversation.createdCircle")}
        </span>
      </div>

      {hasMedia ? (
        <div className="mb-2 w-[200px] overflow-hidden rounded-2xl bg-[var(--surface)]">
          <VideoThumbnail
            src={group.mediaUrl as string}
            thumbnailUrl={group.thumbnailUrl}
          />
        </div>
      ) : null}

      {group.description ? (
        <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.55] text-[var(--ink)]">
          {group.description}
        </p>
      ) : null}
    </div>
  );
}

export function ThreadScreen({
  groupId,
  threadId,
}: {
  groupId: string;
  threadId: string;
}) {
  const router = useRouter();
  const t = useT();
  const [messages, setMessages] = useState<XmtpMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  const requestedGroupsRef = useRef(false);
  const {
    session,
    error,
    xmtpStatus,
    xmtpError,
    xmtpInfo,
    latestXmtpMessageEvent,
    kharismaStatus,
    kharismaError,
    kharismaGroups,
    isRecovering,
    refreshKharismaGroups,
    listThreadMessages,
    sendThreadMessage,
    sendThreadVideo,
  } = useSession();
  const listMessagesRef = useRef(listThreadMessages);

  useEffect(() => {
    listMessagesRef.current = listThreadMessages;
  }, [listThreadMessages]);

  useEffect(() => {
    if (!session && !isRecovering) {
      router.replace("/");
    }
  }, [isRecovering, router, session]);

  useEffect(() => {
    if (
      !session ||
      xmtpStatus !== "connected" ||
      kharismaStatus !== "idle" ||
      requestedGroupsRef.current
    ) {
      return;
    }
    requestedGroupsRef.current = true;
    void refreshKharismaGroups();
  }, [kharismaStatus, refreshKharismaGroups, session, xmtpStatus]);

  const group = kharismaGroups.find((c) => c.groupId === groupId);
  const isGeneralThread = threadId === GENERAL_THREAD_ID;
  const messageLoadKey =
    group?.isMember && group.conversationId
      ? `${group.groupId}:${group.conversationId}:${threadId}`
      : null;
  const renderedMessages = [...messages]
    .sort((left, right) => right.sentAt.getTime() - left.sentAt.getTime())
    .filter((m) => visibleMessageText(m) || m.attachment);

  // Group consecutive messages from the same sender within 10 minutes
  const messageGroups = (() => {
    const chronological = [...renderedMessages].reverse();
    const groups: XmtpMessage[][] = [];
    for (const msg of chronological) {
      const prev = groups[groups.length - 1];
      if (
        prev &&
        prev[0].senderInboxId === msg.senderInboxId &&
        Math.abs(msg.sentAt.getTime() - prev[prev.length - 1].sentAt.getTime()) <
          10 * 60 * 1000
      ) {
        prev.push(msg);
      } else {
        groups.push([msg]);
      }
    }
    return groups;
  })();
  const isLoadingGroups =
    isRecovering ||
    xmtpStatus === "connecting" ||
    kharismaStatus === "listing" ||
    (xmtpStatus === "connected" && kharismaStatus === "idle");
  const canShowGroupState =
    !isLoadingGroups &&
    xmtpStatus !== "error" &&
    !xmtpError &&
    kharismaStatus !== "error";

  // Build a color map for senders
  const senderColorMap = new Map<string, { color: string; index: number }>();
  if (group) {
    group.senders.forEach((sender, i) => {
      senderColorMap.set(sender.inboxId, {
        color: senderColorByIndex(i),
        index: i,
      });
    });
  }

  function getSenderDetails(message: XmtpMessage) {
    const sender = group?.senders.find(
      (c) => c.inboxId === message.senderInboxId,
    );
    const colorInfo = senderColorMap.get(message.senderInboxId);
    return {
      sender: sender ?? null,
      name: sender?.name ?? t("conversation.unknown"),
      role: sender?.role ?? "H",
      color: colorInfo?.color ?? SENDER_COLORS[0],
    };
  }

  function isOwnMessage(message: XmtpMessage) {
    return Boolean(
      xmtpInfo?.inboxId && message.senderInboxId === xmtpInfo.inboxId,
    );
  }

  // Load messages
  useEffect(() => {
    if (!messageLoadKey) return;
    let cancelled = false;
    setIsLoadingMessages(true);
    setLoadError(null);

    void listMessagesRef
      .current(groupId, threadId)
      .then((nextMessages) => {
        if (!cancelled) setMessages(nextMessages);
      })
      .catch((cause) => {
        if (!cancelled)
          setLoadError(
            cause instanceof Error ? cause.message : t("conversation.failedToLoad"),
          );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMessages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [groupId, threadId, messageLoadKey]);

  // Real-time updates: only ingest messages that match this thread.
  useEffect(() => {
    if (!latestXmtpMessageEvent || !group?.conversationId) return;
    if (latestXmtpMessageEvent.conversationId !== group.conversationId) return;
    const incoming = latestXmtpMessageEvent.message;
    if (isGeneralThread) {
      if (incoming.replyTo || incoming.threadCreate) return;
    } else {
      // For an explicit thread, accept only the root or a reply pointing at it.
      if (incoming.id !== threadId && incoming.replyTo !== threadId) return;
    }
    setMessages((current) => upsertMessage(current, incoming));
  }, [group?.conversationId, isGeneralThread, latestXmtpMessageEvent, threadId]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setIsSending(true);
    setSendError(null);
    try {
      const message = await sendThreadMessage(groupId, threadId, text);
      setMessages((current) => upsertMessage(current, message));
      setDraft("");
    } catch (cause) {
      setSendError(
        cause instanceof Error ? cause.message : t("conversation.failedToSend"),
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleVideoRecorded(file: File) {
    setShowVideoRecorder(false);
    setIsSending(true);
    setSendError(null);
    try {
      const message = await sendThreadVideo(groupId, threadId, file);
      setMessages((current) => upsertMessage(current, message));
    } catch (cause) {
      setSendError(
        cause instanceof Error ? cause.message : t("conversation.failedToSendVideo"),
      );
    } finally {
      setIsSending(false);
    }
  }

  if (!session) {
    return isRecovering ? <ProtectedRouteLoading /> : null;
  }

  // Determine thread title: explicit threads use the root message's
  // thread-create payload; the General thread is labelled as such.
  const rootMessage = messages.find((m) => m.id === threadId) ?? null;
  const threadTitle = isGeneralThread
    ? t("thread.generalTitle")
    : rootMessage?.threadCreate?.title ?? t("thread.fallbackTitle");
  const headerTitle = group ? `${group.title} · ${threadTitle}` : threadTitle;

  return (
    <main className="mx-auto flex h-screen w-full max-w-[28rem] flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 px-5 pb-3.5 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          href={`/groups/${encodeURIComponent(groupId)}`}
          className="flex items-center text-[var(--ink-soft)] transition hover:text-[var(--ink)]"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <span
          className="truncate text-[22px] leading-[1.1] tracking-[-0.01em] text-[var(--ink)]"
          style={{ fontFamily: "var(--font-serif)", fontWeight: 400 }}
        >
          {headerTitle}
        </span>
      </div>

      {/* Error states */}
      {xmtpError ? (
        <div className="mx-5 mb-3 rounded-[14px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-3.5 py-3 text-sm text-[var(--danger-ink)]">
          {xmtpError}
        </div>
      ) : null}

      {isLoadingGroups ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-[var(--ink-soft)]">
            <Spinner />
            {t("conversation.loading")}
          </div>
        </div>
      ) : null}

      {!isLoadingGroups && kharismaStatus === "error" && kharismaError ? (
        <div className="mx-5 mb-3 rounded-[14px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-3.5 py-3 text-sm text-[var(--danger-ink)]">
          {kharismaError}
        </div>
      ) : null}

      {canShowGroupState && !group ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--ink-soft)]">
          {t("conversation.notFound")}
        </div>
      ) : null}

      {canShowGroupState && group && !group.isMember ? (
        <div className="mx-5 rounded-[14px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-3.5 py-3 text-sm text-[var(--danger-ink)]">
          {t("conversation.joinFirst")}
        </div>
      ) : null}

      {/* Thread */}
      {canShowGroupState && group?.isMember ? (
        <>
          {/* Scrollable messages */}
          <div className="flex-1 overflow-y-auto px-5 pt-3">
            {isLoadingMessages ? (
              <div className="flex items-center gap-2 py-8 text-sm text-[var(--ink-soft)]">
                <Spinner />
                {t("conversation.loadingMessages")}
              </div>
            ) : null}

            {loadError ? (
              <div className="rounded-[14px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-3.5 py-3 text-sm text-[var(--danger-ink)]">
                {loadError}
              </div>
            ) : null}

            {!isLoadingMessages && !loadError ? (
              <div className="relative ml-3.5 pb-5 pl-4">
                <span
                  aria-hidden
                  className="absolute left-0 top-0 w-[1.5px] bg-[var(--line)]"
                  style={{ bottom: "calc(1.25rem - 3px)" }}
                />
                <span
                  aria-hidden
                  className="absolute h-1.5 w-1.5 rounded-full bg-[var(--line)]"
                  style={{ left: "-2.25px", bottom: "calc(1.25rem - 6px)" }}
                />
                {isGeneralThread ? (() => {
                  const lead =
                    group.senders.find(
                      (s) => s.role === "H" || s.role === "HA",
                    ) ?? null;
                  const ownCreator = Boolean(
                    lead?.inboxId &&
                      xmtpInfo?.inboxId &&
                      lead.inboxId === xmtpInfo.inboxId,
                  );
                  return (
                    <CircleIntroEntry
                      group={group}
                      isOwn={ownCreator}
                      t={t}
                    />
                  );
                })() : null}
                {messageGroups.length === 0 ? (
                  <p className="py-4 text-[13px] text-[var(--ink-soft)]">
                    {t("conversation.emptyThread")}
                  </p>
                ) : null}
                {messageGroups.map((group) => {
                  const first = group[0];
                  const last = group[group.length - 1];
                  const { sender, name, role, color } = getSenderDetails(first);
                  const isAgent = role === "A";
                  const own = isOwnMessage(first);

                  return (
                    <div key={first.id} className="relative mb-[18px]">
                      <div
                        className="absolute top-0"
                        style={{ left: "-30px" }}
                      >
                        <Portrait name={name} color={color} size={22} ring />
                      </div>

                      <div className="mb-1 flex min-h-[22px] items-center gap-1.5">
                        <span
                          className="text-[13px] font-medium leading-none"
                          style={{ color }}
                        >
                          {name}
                          {own ? ` (${t("conversation.you")})` : ""}
                        </span>
                        {sender ? roleBadge(sender, color, t) : null}
                        <span className="text-[10px] leading-none text-[var(--ink-faint)]">
                          {timeAgo(last.sentAt, t)}
                        </span>
                      </div>

                      {group.map((message) => {
                        const text = visibleMessageText(message);
                        const attachment = message.attachment;
                        const isVideo = attachment?.mimeType?.startsWith("video/");

                        return (
                          <div key={message.id}>
                            {isVideo && attachment ? (
                              <div className="mb-2 w-[200px] overflow-hidden rounded-2xl bg-[var(--surface)]">
                                <VideoThumbnail
                                  src={attachment.url}
                                  thumbnailUrl={attachment.thumbnailUrl}
                                />
                              </div>
                            ) : null}
                            {text ? (
                              <p
                                className="whitespace-pre-wrap break-words leading-[1.55]"
                                style={{
                                  fontSize: isAgent ? "13px" : "15px",
                                  color: isAgent
                                    ? "var(--ink-soft)"
                                    : "var(--ink)",
                                }}
                              >
                                {text}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Send error */}
          {sendError ? (
            <div className="mx-5 mb-2 rounded-[14px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-3.5 py-2 text-[13px] text-[var(--danger-ink)]">
              {sendError}
            </div>
          ) : null}

          {/* Input bar */}
          <form
            onSubmit={handleSend}
            className="flex shrink-0 items-center gap-2 border-t border-[var(--line)] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2.5"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={isSending}
              placeholder={t("conversation.draftPlaceholder")}
              className="min-w-0 flex-1 rounded-[20px] bg-[var(--surface)] px-3.5 py-2.5 text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setShowVideoRecorder(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface)]"
              aria-label={t("conversation.recordLabel")}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--ink-soft)"
                strokeWidth="2"
              >
                <rect x="2" y="4" width="14" height="16" rx="3" />
                <path d="M16 10l5-3v10l-5-3" />
              </svg>
            </button>
            <button
              type="submit"
              disabled={isSending || !draft.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40"
              style={{ background: "var(--accent)" }}
              aria-label={t("conversation.sendLabel")}
            >
              {isSending ? (
                <Spinner />
              ) : draft.trim() ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="var(--bg)"
                  stroke="none"
                >
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="var(--bg)"
                  stroke="none"
                >
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
              )}
            </button>
          </form>
        </>
      ) : null}

      {error ? (
        <div className="mx-5 mb-3 rounded-[14px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-3.5 py-3 text-sm text-[var(--danger-ink)]">
          {error}
        </div>
      ) : null}

      <VideoRecorder
        open={showVideoRecorder}
        onClose={() => setShowVideoRecorder(false)}
        onRecorded={handleVideoRecorded}
      />
    </main>
  );
}
