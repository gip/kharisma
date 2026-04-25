"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session-provider";
import { ThreadRow } from "@/components/thread-row";
import { StartThreadModal } from "@/components/start-thread-modal";
import { InvestModal } from "@/components/invest-modal";
import { GroupActionSheet } from "@/components/group-action-sheet";
import { BottomNav } from "@/components/bottom-nav";
import { Portrait, colorFromString } from "@/components/design/primitives";
import { ProtectedRouteLoading } from "@/components/protected-route-loading";
import {
  GroupMediaPreview,
  InlineGroupMediaPlayer,
  LanguageChips,
} from "@/components/group-media";
import { useT } from "@/i18n/i18n-provider";
import { GENERAL_THREAD_ID, type ThreadSummary } from "@/backend/types";

function Spinner() {
  return <span className="spinner" aria-hidden />;
}

const AUTO_REFRESH_MS = 60 * 1000;

export function CircleScreen({ groupId }: { groupId: string }) {
  const router = useRouter();
  const t = useT();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showStart, setShowStart] = useState(false);
  const [showInvest, setShowInvest] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [creating, setCreating] = useState(false);
  const [isHeroPlaying, setIsHeroPlaying] = useState(false);
  const requestedGroupsRef = useRef(false);
  const {
    session,
    xmtpStatus,
    xmtpError,
    kharismaStatus,
    kharismaError,
    kharismaGroups,
    isRecovering,
    refreshKharismaGroups,
    listGroupThreads,
    createGroupThread,
    getInvestmentConfig,
    submitInvestment,
    latestXmtpMessageEvent,
    environment,
  } = useSession();

  // Pin these callbacks in refs so effects below don't re-fire every time
  // SessionProvider re-renders (those functions aren't memoized upstream).
  const listGroupThreadsRef = useRef(listGroupThreads);
  const refreshKharismaGroupsRef = useRef(refreshKharismaGroups);
  useEffect(() => {
    listGroupThreadsRef.current = listGroupThreads;
    refreshKharismaGroupsRef.current = refreshKharismaGroups;
  }, [listGroupThreads, refreshKharismaGroups]);

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
    void refreshKharismaGroupsRef.current();
  }, [kharismaStatus, session, xmtpStatus]);

  const group = kharismaGroups.find((g) => g.groupId === groupId);
  const canLoadThreads = !!group?.isMember && !!group.conversationId;

  useEffect(() => {
    if (!canLoadThreads) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    void listGroupThreadsRef.current(groupId)
      .then((next) => {
        if (!cancelled) setThreads(next);
      })
      .catch((cause) => {
        if (!cancelled)
          setLoadError(
            cause instanceof Error ? cause.message : "Failed to load threads",
          );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canLoadThreads, groupId]);

  // Auto-refresh threads periodically so lastActivity stays fresh.
  useEffect(() => {
    if (!canLoadThreads) return;
    const interval = setInterval(() => {
      void listGroupThreadsRef.current(groupId)
        .then((next) => setThreads(next))
        .catch(() => undefined);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [canLoadThreads, groupId]);

  // Cheap reactivity: when a new message arrives in this conversation,
  // re-fetch the thread list. Backend derives lastActivity per thread.
  useEffect(() => {
    if (!latestXmtpMessageEvent || !group?.conversationId) return;
    if (latestXmtpMessageEvent.conversationId !== group.conversationId) return;
    void listGroupThreadsRef.current(groupId)
      .then((next) => setThreads(next))
      .catch(() => undefined);
  }, [group?.conversationId, groupId, latestXmtpMessageEvent]);

  async function handleCreate(input: { title: string; firstMessage: string }) {
    setCreating(true);
    try {
      const result = await createGroupThread({
        groupId,
        title: input.title,
        firstMessage: input.firstMessage,
      });
      setShowStart(false);
      router.push(
        `/groups/${encodeURIComponent(groupId)}/threads/${encodeURIComponent(result.thread.threadId)}`,
      );
    } finally {
      setCreating(false);
    }
  }

  if (!session) {
    return isRecovering ? <ProtectedRouteLoading /> : null;
  }

  const isLoadingGroups =
    isRecovering ||
    xmtpStatus === "connecting" ||
    kharismaStatus === "listing" ||
    (xmtpStatus === "connected" && kharismaStatus === "idle");

  // Keep the implicit General thread discoverable and pinned above
  // activity-sorted explicit threads.
  const displayThreads: ThreadSummary[] = (() => {
    if (!group?.isMember) return [];
    const general = threads.find(
      (thread) => thread.threadId === GENERAL_THREAD_ID,
    ) ?? {
        threadId: GENERAL_THREAD_ID,
        conversationId: group.conversationId ?? "",
        title: t("thread.generalTitle"),
        createdAt: null,
        createdBy: null,
        lastActivityAt: new Date().toISOString(),
        lastMessageId: "",
        lastMessagePreview: null,
        lastMessageSenderInboxId: "",
        replyCount: 0,
      };
    return [
      general,
      ...threads.filter((thread) => thread.threadId !== GENERAL_THREAD_ID),
    ];
  })();

  const accent = colorFromString(groupId);
  const circleDetails = group ? (
    <div className="min-w-0 flex-1">
      <p
        className="text-[22px] leading-[1.1] tracking-[-0.01em] text-[var(--ink)]"
        style={{ fontFamily: "var(--font-serif)", fontWeight: 400 }}
      >
        {group.title}
      </p>
      {group.description ? (
        <p className="mt-1 line-clamp-2 text-[13px] leading-[1.4] text-[var(--ink-soft)]">
          {group.description}
        </p>
      ) : null}
      <LanguageChips languages={group.languages} />
      <p className="mt-1.5 text-[12px] text-[var(--ink-soft)]">
        {group.memberCount}{" "}
        {group.memberCount === 1
          ? t("session.member.one")
          : t("session.member.other")}
      </p>
    </div>
  ) : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[28rem] flex-col px-5 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
      {/* Header */}
      <div className="flex items-center gap-2 py-3">
        <Link
          href="/groups"
          className="flex items-center text-[var(--ink-soft)] transition hover:text-[var(--ink)]"
          aria-label="Back to circles"
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
      </div>

      {/* Circle hero */}
      {group ? (
        <section
          className="relative mb-4 overflow-hidden rounded-[22px] bg-[var(--surface)] p-4"
          style={{
            boxShadow:
              "0 1px 2px rgba(44,42,37,0.04), 0 10px 24px -10px rgba(44,42,37,0.10)",
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: -40,
              right: -40,
              width: 140,
              height: 140,
              borderRadius: 999,
              background: `radial-gradient(circle, ${accent}26, transparent 70%)`,
              pointerEvents: "none",
            }}
          />
          <div className="relative">
            {isHeroPlaying && group.mediaUrl ? (
              <>
                <InlineGroupMediaPlayer
                  group={group}
                  onClose={() => setIsHeroPlaying(false)}
                />
                <div className="mt-3.5 flex items-start gap-3">
                  <Portrait name={group.title} color={accent} size={44} />
                  {circleDetails}
                </div>
              </>
            ) : (
              <div className="flex items-start gap-3.5">
                {group.mediaUrl || group.thumbnailUrl ? (
                  <GroupMediaPreview
                    group={group}
                    onPlay={() => setIsHeroPlaying(true)}
                  />
                ) : (
                  <Portrait name={group.title} color={accent} size={44} />
                )}
                {circleDetails}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {/* Errors */}
      {xmtpError ? (
        <div className="mb-3 rounded-[14px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-3.5 py-3 text-sm text-[var(--danger-ink)]">
          {xmtpError}
        </div>
      ) : null}
      {kharismaError ? (
        <div className="mb-3 rounded-[14px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-3.5 py-3 text-sm text-[var(--danger-ink)]">
          {kharismaError}
        </div>
      ) : null}
      {loadError ? (
        <div className="mb-3 rounded-[14px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-3.5 py-3 text-sm text-[var(--danger-ink)]">
          {loadError}
        </div>
      ) : null}

      {/* Threads section */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-soft)]">
          {t("thread.latestTitle")}
        </p>
        {group?.isMember ? (
          <button
            type="button"
            onClick={() => setShowActions(true)}
            disabled={creating}
            aria-label="New"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--bg)] transition active:scale-[0.95] disabled:opacity-40"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        ) : null}
      </div>

      {isLoading || isLoadingGroups ? (
        <div className="flex items-center gap-2 py-6 text-sm text-[var(--ink-soft)]">
          <Spinner />
          {t("session.loadingRooms")}
        </div>
      ) : null}

      {!isLoading && !isLoadingGroups && displayThreads.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--ink-soft)]">
          {t("thread.empty")}
        </p>
      ) : null}

      <div className="space-y-2.5">
        {displayThreads.map((thread) => (
          <ThreadRow
            key={thread.threadId}
            thread={thread}
            groupId={groupId}
          />
        ))}
      </div>

      <GroupActionSheet
        open={showActions}
        onClose={() => setShowActions(false)}
        threadLabel={t("thread.start")}
        onPick={(action) => {
          setShowActions(false);
          if (action === "thread") setShowStart(true);
          else setShowInvest(true);
        }}
      />

      <StartThreadModal
        open={showStart}
        busy={creating}
        onClose={() => setShowStart(false)}
        onCreate={handleCreate}
      />

      {group ? (
        <InvestModal
          open={showInvest}
          groupId={groupId}
          syncInboxId={group.syncInboxId}
          environment={environment}
          getInvestmentConfig={getInvestmentConfig}
          submitInvestment={submitInvestment}
          onClose={() => setShowInvest(false)}
          onRecorded={() => {
            void refreshKharismaGroups();
            if (canLoadThreads) {
              void listGroupThreads(groupId)
                .then((next) => setThreads(next))
                .catch(() => undefined);
            }
          }}
        />
      ) : null}

      <BottomNav />
    </main>
  );
}
