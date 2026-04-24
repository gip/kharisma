"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session-provider";
import { BottomNav } from "@/components/bottom-nav";
import { ProtectedRouteLoading } from "@/components/protected-route-loading";
import { ThreadRow } from "@/components/thread-row";
import { useT } from "@/i18n/i18n-provider";
import type { ThreadSummary } from "@/backend/types";

function Spinner() {
  return <span className="spinner" aria-hidden />;
}

type Mode = "latest" | "by-circle";

const AUTO_REFRESH_MS = 60 * 1000;

export function LatestScreen() {
  const router = useRouter();
  const t = useT();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("latest");
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
    listLatestThreads,
    latestXmtpMessageEvent,
  } = useSession();

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

  useEffect(() => {
    if (xmtpStatus !== "connected") return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    void listLatestThreads(50)
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
  }, [listLatestThreads, xmtpStatus]);

  useEffect(() => {
    if (xmtpStatus !== "connected") return;
    const interval = setInterval(() => {
      void listLatestThreads(50)
        .then((next) => setThreads(next))
        .catch(() => undefined);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [listLatestThreads, xmtpStatus]);

  // Re-fetch on any new message in the user's groups.
  useEffect(() => {
    if (!latestXmtpMessageEvent) return;
    void listLatestThreads(50)
      .then((next) => setThreads(next))
      .catch(() => undefined);
  }, [latestXmtpMessageEvent, listLatestThreads]);

  const groupById = new Map(kharismaGroups.map((g) => [g.conversationId, g]));

  if (!session) {
    return isRecovering ? <ProtectedRouteLoading /> : null;
  }

  // Group threads by their conversation id (Circle) for the by-Circle mode.
  const byCircle = (() => {
    const byKey = new Map<string, ThreadSummary[]>();
    for (const thread of threads) {
      const list = byKey.get(thread.conversationId) ?? [];
      list.push(thread);
      byKey.set(thread.conversationId, list);
    }
    // Sort circles by their most-recent thread.
    return [...byKey.entries()]
      .map(([conversationId, list]) => ({
        conversationId,
        threads: list,
        lastActivity: list[0]?.lastActivityAt ?? "",
      }))
      .sort(
        (left, right) =>
          new Date(right.lastActivity).getTime() -
          new Date(left.lastActivity).getTime(),
      );
  })();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[28rem] flex-col px-5 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="py-4">
        <p className="text-[12px] text-[var(--ink-soft)]">{t("nav.latest")}</p>
        <h1
          className="mt-0.5 text-[34px] leading-[1.05] tracking-[-0.01em] text-[var(--ink)]"
          style={{ fontFamily: "var(--font-serif)", fontWeight: 400 }}
        >
          {t("thread.latestTitle")}
        </h1>
      </div>

      <div className="mb-3 flex gap-2">
        {(
          [
            ["latest", t("thread.latestToggle")],
            ["by-circle", t("thread.byCircleToggle")],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className="rounded-full px-3 py-1.5 text-[12px] transition"
            style={
              mode === key
                ? { background: "var(--ink)", color: "var(--bg)", fontWeight: 500 }
                : {
                    border: "1px solid var(--line)",
                    color: "var(--ink-soft)",
                  }
            }
          >
            {label}
          </button>
        ))}
      </div>

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

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-[var(--ink-soft)]">
          <Spinner />
          {t("session.loadingRooms")}
        </div>
      ) : null}

      {!isLoading && threads.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--ink-soft)]">
          {t("thread.latestEmpty")}
        </p>
      ) : null}

      {mode === "latest" ? (
        <div className="space-y-2.5">
          {threads.map((thread) => {
            const group = groupById.get(thread.conversationId);
            if (!group) return null;
            return (
              <ThreadRow
                key={`${thread.conversationId}:${thread.threadId}`}
                thread={thread}
                groupId={group.groupId}
                contextLabel={group.title}
              />
            );
          })}
        </div>
      ) : (
        <div className="space-y-5">
          {byCircle.map((bucket) => {
            const group = groupById.get(bucket.conversationId);
            if (!group) return null;
            return (
              <section key={bucket.conversationId}>
                <p
                  className="mb-2 text-[15px] leading-[1.2] text-[var(--ink)]"
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontWeight: 500,
                  }}
                >
                  {group.title}
                </p>
                <div className="space-y-2.5">
                  {bucket.threads.map((thread) => (
                    <ThreadRow
                      key={`${thread.conversationId}:${thread.threadId}`}
                      thread={thread}
                      groupId={group.groupId}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <BottomNav />
    </main>
  );
}
