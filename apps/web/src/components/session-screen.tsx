"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session-provider";
import { BottomNav } from "@/components/bottom-nav";
import { CreateGroupModal } from "@/components/create-group-modal";
import { Portrait, colorFromString } from "@/components/design/primitives";
import { ProtectedRouteLoading } from "@/components/protected-route-loading";
import {
  GroupMediaPreview,
  InlineGroupMediaPlayer,
  LanguageChips,
} from "@/components/group-media";
import { DEMO_GROUP } from "@/demo/mock-circle";
import { useT } from "@/i18n/i18n-provider";
import type {
  KharismaGroupSummary,
  KharismaSenderSummary,
  GroupLanguageCode,
} from "@/backend/types";

const LANGUAGE_OPTIONS = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "pt", label: "PT" },
  { code: "ko", label: "KO" },
  { code: "ja", label: "JA" },
] as const satisfies readonly {
  code: GroupLanguageCode;
  label: string;
}[];

function Spinner() {
  return <span className="spinner" aria-hidden />;
}

/*
function LiveNowStrip({
  groups,
}: {
  groups: readonly KharismaGroupSummary[];
}) {
  const t = useT();

  type LeadEntry = {
    key: string;
    name: string;
    color: string;
  };

  const leads: LeadEntry[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    const lead = group.senders.find((s) => s.role === "H" || s.role === "HA");
    if (!lead) continue;
    const key = `${group.groupId}:${lead.inboxId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    leads.push({
      key,
      name: lead.name,
      color: colorFromString(lead.inboxId),
    });
    if (leads.length >= 6) break;
  }

  if (leads.length === 0) return null;

  return (
    <section className="mb-5">
      <p className="mb-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--ink-soft)]">
        {t("session.liveNow")}
      </p>
      <div className="-mx-5 flex gap-3.5 overflow-x-auto px-5 pb-1">
        {leads.map((lead) => (
          <div
            key={lead.key}
            className="flex shrink-0 flex-col items-center gap-1.5"
          >
            <div
              style={{
                padding: 2,
                borderRadius: 999,
                background: `conic-gradient(from 0deg, ${lead.color}, ${lead.color}44, ${lead.color})`,
              }}
            >
              <div
                style={{
                  padding: 2,
                  borderRadius: 999,
                  background: "var(--bg)",
                }}
              >
                <Portrait name={lead.name} color={lead.color} size={48} />
              </div>
            </div>
            <span className="max-w-[64px] truncate text-[11px] text-[var(--ink)]">
              {lead.name.split(/[\s_]+/)[0]}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
*/

function MemberStack({
  senders,
}: {
  senders: readonly KharismaSenderSummary[];
}) {
  const shown = senders.slice(0, 4);
  if (shown.length === 0) return null;
  return (
    <div className="flex">
      {shown.map((sender, i) => (
        <div key={sender.inboxId} style={{ marginLeft: i === 0 ? 0 : -10 }}>
          <Portrait
            name={sender.name}
            color={colorFromString(sender.inboxId)}
            size={22}
            ring
          />
        </div>
      ))}
    </div>
  );
}

type Filter = "all" | "active" | "mine";

const AUTO_REFRESH_MS = 5 * 60 * 1000;

export function SessionScreen() {
  const router = useRouter();
  const t = useT();
  const [filter, setFilter] = useState<Filter>("all");
  const [languageFilters, setLanguageFilters] = useState<GroupLanguageCode[]>(
    [],
  );
  const [showCreate, setShowCreate] = useState(false);
  const [inlinePlayingId, setInlinePlayingId] = useState<string | null>(null);
  const requestedRef = useRef(false);
  const {
    environment,
    session,
    error,
    xmtpStatus,
    xmtpError,
    kharismaStatus,
    kharismaError,
    kharismaGroups,
    isRecovering,
    refreshKharismaGroups,
    createKharismaGroup,
    joinKharismaGroup,
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
      requestedRef.current
    ) {
      return;
    }
    requestedRef.current = true;
    void refreshKharismaGroups();
  }, [kharismaStatus, refreshKharismaGroups, session, xmtpStatus]);

  useEffect(() => {
    if (!session || xmtpStatus !== "connected") return;
    const interval = setInterval(() => {
      void refreshKharismaGroups();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [session, xmtpStatus, refreshKharismaGroups]);

  const isKharismaBusy =
    kharismaStatus === "listing" ||
    kharismaStatus === "verifying" ||
    kharismaStatus === "creating" ||
    kharismaStatus === "joining";

  const isLoadingGroups =
    isRecovering ||
    xmtpStatus === "connecting" ||
    kharismaStatus === "listing" ||
    (xmtpStatus === "connected" && kharismaStatus === "idle");

  const canUseKharisma =
    xmtpStatus === "connected" && kharismaStatus !== "idle";

  const groupsWithDemo = [
    DEMO_GROUP,
    ...kharismaGroups.filter((group) => group.groupId !== DEMO_GROUP.groupId),
  ];

  const filteredGroups = groupsWithDemo.filter((group) => {
    if (filter === "mine" && !group.isMember) return false;
    if (
      languageFilters.length > 0 &&
      !group.languages.some((language) => languageFilters.includes(language))
    ) {
      return false;
    }
    return true;
  });

  function toggleLanguageFilter(language: GroupLanguageCode) {
    setLanguageFilters((current) =>
      current.includes(language)
        ? current.filter((code) => code !== language)
        : [...current, language],
    );
  }

  function handleJoin(group: KharismaGroupSummary) {
    void joinKharismaGroup({
      groupId: group.groupId,
      syncInboxId: group.syncInboxId,
    });
  }

  if (!session) {
    return isRecovering ? <ProtectedRouteLoading /> : null;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[28rem] flex-col px-5 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
      {/* Editorial header */}
      <div className="flex items-end justify-between pt-2 pb-3">
        <h1
          className="text-[34px] leading-[1.05] tracking-[-0.01em] text-[var(--ink)]"
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 400,
          }}
        >
          {t("session.rooms")}
        </h1>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          disabled={!canUseKharisma || isKharismaBusy}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] transition hover:text-[var(--accent)] disabled:opacity-40"
          aria-label={t("session.createRoom")}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {/* Live-now strip disabled for now. Re-enable when live rooms return. */}
      {/* <LiveNowStrip groups={kharismaGroups} /> */}

      {/* Filter pills */}
      <div className="flex gap-2 pb-4">
        {(
          [
            ["all", t("session.filter.all")],
            ["active", t("session.filter.activeCalls")],
            ["mine", t("session.filter.myGroups")],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className="rounded-full px-3 py-1.5 text-[12px] transition"
            style={
              filter === key
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

      {/* Language filters */}
      <div className="flex flex-wrap gap-2 pb-4">
        {LANGUAGE_OPTIONS.map((language) => {
          const selected = languageFilters.includes(language.code);
          return (
            <button
              key={language.code}
              type="button"
              onClick={() => toggleLanguageFilter(language.code)}
              aria-pressed={selected}
              className="rounded-lg px-2.5 py-1.5 text-[12px] transition"
              style={
                selected
                  ? {
                      background: "var(--accent)",
                      color: "var(--bg)",
                      fontWeight: 500,
                    }
                  : {
                      border: "1px solid var(--line)",
                      color: "var(--ink-soft)",
                    }
              }
            >
              {language.label}
            </button>
          );
        })}
      </div>

      {/* Error states */}
      {xmtpError ? (
        <section className="mb-3 rounded-[14px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-3.5 py-3 text-sm text-[var(--danger-ink)]">
          {xmtpError}
        </section>
      ) : null}

      {kharismaError ? (
        <section className="mb-3 rounded-[14px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-3.5 py-3 text-sm text-[var(--danger-ink)]">
          {kharismaError}
        </section>
      ) : null}

      {error ? (
        <section className="mb-3 rounded-[14px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-3.5 py-3 text-sm text-[var(--danger-ink)]">
          {error}
        </section>
      ) : null}

      {/* Loading */}
      {isLoadingGroups ? (
        <div className="flex items-center gap-2 py-8 text-sm text-[var(--ink-soft)]">
          <Spinner />
          {t("session.loadingRooms")}
        </div>
      ) : null}

      {/* Empty */}
      {!isLoadingGroups && filteredGroups.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--ink-soft)]">
          {filter === "mine"
            ? t("session.emptyJoined")
            : t("session.emptyAvailable")}
        </p>
      ) : null}

      {/* Circle cards */}
      <div className="space-y-3">
        {filteredGroups.map((group) => {
          const accent = colorFromString(group.groupId);
          const leadSender =
            group.senders.find((s) => s.role === "H" || s.role === "HA") ??
            group.senders[0] ??
            null;
          const leadName = leadSender?.name ?? group.title;
          const onlineSenders = group.senders.filter(
            (s) => s.role === "H" || s.role === "HA",
          );
          const userAddress = session?.address.toLowerCase();
          // group.isMember reflects whether the backend-owned XMTP client has
          // been added to the MLS group. When the browser recognizes a sender
          // wallet matching the signed-in user the membership is effectively
          // the same, so we treat that as member to avoid a join prompt loop
          // during the brief window before the backend refreshes isMember.
          const isEffectiveMember =
            group.isMember ||
            (userAddress
              ? group.senders.some(
                  (s) => s.walletAddress?.toLowerCase() === userAddress,
                )
              : false);

          const socialRow = (
            <div className="mt-3 flex items-center gap-3">
              {onlineSenders.length > 0 ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-2.5 text-[11px] font-medium"
                  style={{
                    background: "rgba(90,143,60,0.14)",
                    color: "var(--green)",
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: "var(--green)",
                      boxShadow: "0 0 0 3px rgba(90,143,60,0.18)",
                    }}
                  />
                  {t("session.liveCount", { count: onlineSenders.length })}
                </span>
              ) : (
                <span className="text-[11px] text-[var(--ink-soft)]">
                  {t("session.quietToday")}
                </span>
              )}
              <MemberStack senders={group.senders} />
              <span className="text-[12px] text-[var(--ink-soft)]">
                {group.memberCount}/{group.maxMembers}{" "}
                {group.memberCount === 1
                  ? t("session.member.one")
                  : t("session.member.other")}
              </span>
            </div>
          );

          const isInlinePlaying =
            inlinePlayingId === group.groupId && !!group.mediaUrl;

          const titleBlock = (
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-[var(--ink-soft)]">
                {t("session.ledBy", { name: leadName })}
              </p>
              <p
                className="mt-0.5 text-[22px] leading-[1.1] tracking-[-0.01em] text-[var(--ink)]"
                style={{ fontFamily: "var(--font-serif)", fontWeight: 400 }}
              >
                {group.title}
              </p>
              {group.description ? (
                <p
                  className="mt-1.5 overflow-hidden text-[13px] leading-[1.4] text-[var(--ink-soft)]"
                  style={{
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: 2,
                  }}
                >
                  {group.description}
                </p>
              ) : null}
              <LanguageChips languages={group.languages} />
            </div>
          );

          const isFull = group.availableSeats <= 0;
          const showsJoin = !isEffectiveMember && !isFull;
          const joinAction = showsJoin ? (
            <button
              type="button"
              onClick={() => handleJoin(group)}
              disabled={isKharismaBusy}
              className="absolute right-4 top-4 z-20 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--bg)] shadow-sm transition active:scale-[0.97] disabled:opacity-40"
            >
              {t("session.join")}
            </button>
          ) : null;

          const cardInner = (
            <>
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
              {isInlinePlaying ? (
                <>
                  <InlineGroupMediaPlayer
                    group={group}
                    onClose={() => setInlinePlayingId(null)}
                  />
                  <div className="relative mt-3">{titleBlock}</div>
                </>
              ) : (
                <div
                  className={`relative flex items-start gap-3.5 ${showsJoin ? "pr-16" : ""}`}
                >
                  <GroupMediaPreview
                    group={group}
                    onPlay={() => setInlinePlayingId(group.groupId)}
                  />
                  {titleBlock}
                </div>
              )}
              {joinAction}
              {socialRow}
            </>
          );

          if (isEffectiveMember) {
            return (
              <article
                key={group.groupId}
                className="relative overflow-hidden rounded-[22px] bg-[var(--surface)] p-4 transition active:scale-[0.995]"
                style={{
                  boxShadow:
                    "0 1px 2px rgba(44,42,37,0.04), 0 10px 24px -10px rgba(44,42,37,0.10)",
                }}
              >
                <Link
                  href={`/groups/${encodeURIComponent(group.groupId)}`}
                  className="absolute inset-0 z-10 rounded-[22px]"
                  aria-label={group.title}
                />
                {cardInner}
              </article>
            );
          }

          return (
            <article
              key={group.groupId}
              className="relative overflow-hidden rounded-[22px] bg-[var(--surface)] p-4"
              style={{
                boxShadow:
                  "0 1px 2px rgba(44,42,37,0.04), 0 10px 24px -10px rgba(44,42,37,0.10)",
              }}
            >
              {cardInner}
            </article>
          );
        })}
      </div>

      <CreateGroupModal
        open={showCreate}
        busy={isKharismaBusy}
        environment={environment}
        onClose={() => setShowCreate(false)}
        onCreate={(
          title,
          description,
          videoFile,
          thumbnailFile,
          languages,
          joinPolicy,
          joinApproval,
          maxMembers,
        ) =>
          createKharismaGroup({
            title,
            description,
            mediaFile: videoFile,
            thumbnailFile,
            languages,
            joinPolicy,
            joinApproval,
            maxMembers,
          })
        }
      />

      <BottomNav />
    </main>
  );
}
