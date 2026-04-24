"use client";

import { useState } from "react";
import { Portrait, colorFromString } from "@/components/design/primitives";
import { useT } from "@/i18n/i18n-provider";
import type { KharismaGroupSummary, GroupLanguageCode } from "@/backend/types";

export function LanguageChips({
  languages,
}: {
  languages: readonly GroupLanguageCode[];
}) {
  if (languages.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {languages.map((language) => (
        <span
          key={language}
          className="rounded-md border border-[var(--line)] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[var(--ink-soft)]"
        >
          {language}
        </span>
      ))}
    </div>
  );
}

export function GroupMediaPreview({
  group,
  onPlay,
  size = "compact",
}: {
  group: KharismaGroupSummary;
  onPlay?: () => void;
  size?: "compact" | "hero";
}) {
  const t = useT();
  const color = colorFromString(group.groupId);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [mediaVideoFailed, setMediaVideoFailed] = useState(false);
  const [mediaImageFailed, setMediaImageFailed] = useState(false);
  const canPlay = !!group.mediaUrl && !!onPlay;
  const isHero = size === "hero";
  const frameClass = isHero
    ? "w-full overflow-hidden rounded-[18px] bg-[var(--surface)]"
    : "w-[72px] shrink-0 overflow-hidden rounded-2xl bg-[var(--surface)]";
  const buttonClass = isHero
    ? "relative z-20 w-full overflow-hidden rounded-[18px] bg-[var(--surface)] text-left shadow-[0_8px_24px_-12px_rgba(44,42,37,0.3)]"
    : "relative z-20 w-[72px] shrink-0 overflow-hidden rounded-2xl bg-[var(--surface)] text-left shadow-[0_4px_14px_-8px_rgba(44,42,37,0.25)]";

  const preview =
    group.thumbnailUrl && !thumbnailFailed ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={group.thumbnailUrl}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setThumbnailFailed(true)}
      />
    ) : group.mediaUrl && !mediaVideoFailed ? (
      <video
        src={`${group.mediaUrl}#t=0.1`}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
        onError={() => setMediaVideoFailed(true)}
      />
    ) : group.mediaUrl && !mediaImageFailed ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={group.mediaUrl}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setMediaImageFailed(true)}
      />
    ) : (
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ background: `${color}1a` }}
      >
        <Portrait name={group.title} color={color} size={isHero ? 72 : 44} />
      </div>
    );

  if (canPlay) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onPlay();
        }}
        className={buttonClass}
        aria-label={t("session.playVideoLabel", { title: group.title })}
      >
        <div className="aspect-[4/5] w-full">{preview}</div>
        {isHero ? (
          <span className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div className={frameClass} aria-hidden>
      <div className="aspect-[4/5] w-full">{preview}</div>
    </div>
  );
}

export function InlineGroupMediaPlayer({
  group,
  onClose,
  size = "compact",
}: {
  group: KharismaGroupSummary;
  onClose: () => void;
  size?: "compact" | "hero";
}) {
  const t = useT();
  const [videoFailed, setVideoFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  if (!group.mediaUrl) return null;

  const radius = size === "hero" ? "rounded-[18px]" : "rounded-2xl";
  const shadow =
    size === "hero"
      ? "shadow-[0_8px_24px_-12px_rgba(44,42,37,0.3)]"
      : "shadow-[0_8px_24px_-12px_rgba(44,42,37,0.3)]";

  return (
    <div className={`relative z-20 overflow-hidden bg-black ${radius} ${shadow}`}>
      {!videoFailed ? (
        <video
          src={group.mediaUrl}
          autoPlay
          controls
          playsInline
          className="aspect-[4/5] w-full object-cover"
          onClick={(event) => event.stopPropagation()}
          onError={() => setVideoFailed(true)}
        />
      ) : !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={group.mediaUrl}
          alt=""
          className="aspect-[4/5] w-full object-cover"
          onClick={(event) => event.stopPropagation()}
          onError={() => setImageFailed(true)}
        />
      ) : null}
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
        className="absolute right-2 top-2 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70"
        aria-label={t("session.closeVideoLabel")}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
