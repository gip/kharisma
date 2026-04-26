"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { VideoRecorder } from "@/components/video-recorder";
import { useT } from "@/i18n/i18n-provider";
import {
  extractVideoThumbnail,
  normalizeVideoToPortrait,
} from "@/media/portrait-video";
import type {
  GroupJoinApproval,
  GroupJoinPolicy,
  GroupLanguageCode,
} from "@/backend/types";
import type { AppEnvironment } from "@/wallet/environment";

function Spinner() {
  return <span className="spinner" aria-hidden />;
}

const MIN_DESCRIPTION_LENGTH = 20;
const MIN_MEMBERS = 2;
const MAX_MEMBERS = 200;

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "ko", label: "Korean" },
  { code: "ja", label: "Japanese" },
] as const satisfies readonly {
  code: GroupLanguageCode;
  label: string;
}[];

const JOIN_POLICY_OPTIONS = [
  { value: "H_ONLY", label: "Humans Only" },
  { value: "H_AND_HA", label: "Human Agents" },
  { value: "H_HA_AND_A", label: "All" },
] as const satisfies readonly {
  value: GroupJoinPolicy;
  label: string;
}[];

const JOIN_APPROVAL_OPTIONS = [
  { value: "NONE", label: "Open" },
  { value: "ONE_MEMBER", label: "Approve" },
] as const satisfies readonly {
  value: GroupJoinApproval;
  label: string;
}[];

export function CreateGroupModal({
  open,
  busy,
  environment,
  onClose,
  onCreate,
}: {
  open: boolean;
  busy: boolean;
  environment: AppEnvironment;
  onClose: () => void;
  onCreate: (
    title: string,
    description: string,
    videoFile: File,
    thumbnailFile: File,
    languages: GroupLanguageCode[],
    joinPolicy: GroupJoinPolicy,
    joinApproval: GroupJoinApproval,
    maxMembers: number,
  ) => Promise<boolean>;
}) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [languages, setLanguages] = useState<GroupLanguageCode[]>([]);
  const [joinPolicy, setJoinPolicy] = useState<GroupJoinPolicy>("H_ONLY");
  const [joinApproval, setJoinApproval] = useState<GroupJoinApproval>("NONE");
  const [maxMembers, setMaxMembers] = useState(12);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [isPreparingVideo, setIsPreparingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prepareTaskRef = useRef(0);

  const resetForm = useCallback(() => {
    prepareTaskRef.current += 1;
    setTitle("");
    setDescription("");
    setLanguages([]);
    setJoinPolicy("H_ONLY");
    setJoinApproval("NONE");
    setMaxMembers(12);
    setVideoFile(null);
    setThumbnailFile(null);
    setIsPreparingVideo(false);
    setVideoError(null);
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    setThumbnailPreview(null);
    setShowRecorder(false);
  }, [thumbnailPreview]);

  if (!open) return null;

  const trimmedDescription = description.trim();
  const descriptionValid = trimmedDescription.length >= MIN_DESCRIPTION_LENGTH;
  const canSubmit =
    title.trim() &&
    descriptionValid &&
    languages.length > 0 &&
    videoFile &&
    thumbnailFile &&
    !isPreparingVideo &&
    maxMembers >= MIN_MEMBERS &&
    maxMembers <= MAX_MEMBERS &&
    !busy;

  function toggleLanguage(language: GroupLanguageCode) {
    setLanguages((current) =>
      current.includes(language)
        ? current.filter((code) => code !== language)
        : [...current, language],
    );
  }

  async function handleVideoSelect(file: File) {
    const taskId = ++prepareTaskRef.current;
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    setIsPreparingVideo(true);
    setVideoError(null);
    setVideoFile(null);
    setThumbnailFile(null);
    setThumbnailPreview(null);

    try {
      const normalizedFile = await normalizeVideoToPortrait(file);
      if (prepareTaskRef.current !== taskId) return;

      setVideoFile(normalizedFile);

      try {
        const thumb = await extractVideoThumbnail(normalizedFile);
        if (prepareTaskRef.current !== taskId) return;

        setThumbnailFile(thumb);
        setThumbnailPreview(URL.createObjectURL(thumb));
      } catch {
        if (prepareTaskRef.current !== taskId) return;

        // Keep uploads usable even when browser thumbnail extraction fails.
        const canvas = document.createElement("canvas");
        canvas.width = 720;
        canvas.height = 900;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#1c1c1e";
        ctx.fillRect(0, 0, 720, 900);
        canvas.toBlob(
          (blob) => {
            if (!blob || prepareTaskRef.current !== taskId) return;

            const fallback = new File([blob], `thumb-${Date.now()}.jpg`, {
              type: "image/jpeg",
            });
            setThumbnailFile(fallback);
            setThumbnailPreview(URL.createObjectURL(fallback));
          },
          "image/jpeg",
          0.85,
        );
      }
    } catch {
      if (prepareTaskRef.current !== taskId) return;
      setVideoError("Failed to prepare portrait video.");
    } finally {
      if (prepareTaskRef.current === taskId) {
        setIsPreparingVideo(false);
      }
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleVideoSelect(file);
    e.target.value = "";
  }

  function handleRemoveVideo() {
    prepareTaskRef.current += 1;
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    setVideoFile(null);
    setThumbnailFile(null);
    setThumbnailPreview(null);
    setVideoError(null);
    setIsPreparingVideo(false);
  }

  function handleVideoRecorded(file: File) {
    void handleVideoSelect(file);
    setShowRecorder(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    const success = await onCreate(
      title.trim(),
      trimmedDescription,
      videoFile,
      thumbnailFile,
      languages,
      joinPolicy,
      joinApproval,
      maxMembers,
    );
    if (success) {
      resetForm();
      onClose();
    }
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex h-[100dvh] items-end justify-center overflow-y-auto bg-black/40 pt-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-group-title"
          className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[28rem] flex-col overflow-hidden rounded-t-[1.5rem] border border-b-0 border-[var(--line)] bg-[var(--bg)] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
        >
          <div className="mb-1 flex shrink-0 items-center justify-between">
            <h2
              id="create-group-title"
              className="text-[22px] leading-[1.1] tracking-[-0.01em] text-[var(--ink)]"
              style={{ fontFamily: "var(--font-serif)", fontWeight: 400 }}
            >
              {t("createGroup.title")}
            </h2>
            <button
              type="button"
              onClick={handleClose}
              className="text-[var(--ink-soft)] transition hover:text-[var(--ink)]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form
            onSubmit={handleSubmit}
            className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1"
          >
            {/* Title */}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              placeholder={t("createGroup.namePlaceholder")}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-soft)] focus:border-[var(--accent)] disabled:opacity-60"
            />

            {/* Description */}
            <div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={busy}
                placeholder={t("createGroup.descriptionPlaceholder")}
                rows={3}
                className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-soft)] focus:border-[var(--accent)] disabled:opacity-60"
              />
              <p
                className={`mt-1 text-right text-[12px] ${
                  description.trim().length > 0 && !descriptionValid
                    ? "text-red-400"
                    : "text-[var(--ink-soft)]"
                }`}
              >
                {trimmedDescription.length}/{MIN_DESCRIPTION_LENGTH}
              </p>
            </div>

            {/* Languages */}
            <fieldset>
              <legend className="mb-2 text-[12px] text-[var(--ink-soft)]">
                {t("createGroup.languagesLabel")}
              </legend>
              <div className="flex flex-wrap gap-2">
                {LANGUAGE_OPTIONS.map((language) => {
                  const selected = languages.includes(language.code);
                  return (
                    <button
                      key={language.code}
                      type="button"
                      onClick={() => toggleLanguage(language.code)}
                      disabled={busy}
                      aria-pressed={selected}
                      className="rounded-lg border px-3 py-1.5 text-[12px] transition disabled:opacity-60"
                      style={
                        selected
                          ? {
                              borderColor: "var(--accent)",
                              background: "var(--accent)",
                              color: "var(--bg)",
                            }
                          : {
                              borderColor: "var(--line)",
                              color: "var(--ink-soft)",
                            }
                      }
                    >
                      {language.code.toUpperCase()}
                    </button>
                  );
                })}
              </div>
              {languages.length === 0 ? (
                <p className="mt-1 text-[12px] text-red-400">
                  {t("createGroup.selectAtLeastOne")}
                </p>
              ) : null}
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-[12px] text-[var(--ink-soft)]">
                Join policy
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {JOIN_POLICY_OPTIONS.map(({ value, label }) => {
                  const selected = joinPolicy === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setJoinPolicy(value)}
                      disabled={busy}
                      className="flex min-h-8 items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-[10px] leading-tight transition disabled:opacity-60"
                      style={
                        selected
                          ? {
                              borderColor: "var(--accent)",
                              background: "var(--accent)",
                              color: "var(--bg)",
                            }
                          : {
                              borderColor: "var(--line)",
                              color: "var(--ink-soft)",
                              background: "var(--surface)",
                        }
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-[12px] text-[var(--ink-soft)]">
                Join approval
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {JOIN_APPROVAL_OPTIONS.map(({ value, label }) => {
                  const selected = joinApproval === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setJoinApproval(value)}
                      disabled={busy}
                      className="flex min-h-8 items-center justify-center rounded-lg border px-2 py-1.5 text-center text-[11px] leading-tight transition disabled:opacity-60"
                      style={
                        selected
                          ? {
                              borderColor: "var(--accent)",
                              background: "var(--accent)",
                              color: "var(--bg)",
                            }
                          : {
                              borderColor: "var(--line)",
                              color: "var(--ink-soft)",
                              background: "var(--surface)",
                            }
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <label className="mb-2 block text-[12px] text-[var(--ink-soft)]">
                Max members
              </label>
              <input
                type="number"
                min={MIN_MEMBERS}
                max={MAX_MEMBERS}
                step={1}
                value={maxMembers}
                onChange={(e) => {
                  const next = Number.parseInt(e.target.value || "0", 10);
                  setMaxMembers(
                    Number.isFinite(next)
                      ? Math.max(MIN_MEMBERS, Math.min(MAX_MEMBERS, next))
                      : MIN_MEMBERS,
                  );
                }}
                disabled={busy}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--ink)] outline-none transition focus:border-[var(--accent)] disabled:opacity-60"
              />
            </div>

            {/* Video picker */}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="hidden"
            />

            {thumbnailPreview ? (
              <div className="relative overflow-hidden rounded-xl border border-[var(--line)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailPreview}
                  alt={t("createGroup.thumbnailAlt")}
                  className="aspect-[4/5] w-full object-cover"
                />
                {/* Remove / Replace buttons */}
                <div className="absolute right-2 top-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy || isPreparingVideo}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70"
                    aria-label={t("createGroup.replaceVideo")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveVideo}
                    disabled={busy || isPreparingVideo}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70"
                    aria-label={t("createGroup.removeVideo")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy || isPreparingVideo}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-6 text-[14px] text-[var(--ink-soft)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-60"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                  {t("createGroup.upload")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRecorder(true)}
                  disabled={busy || isPreparingVideo}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-6 text-[14px] text-[var(--ink-soft)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-60"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="4" fill="currentColor" />
                  </svg>
                  {t("createGroup.record")}
                </button>
              </div>
            )}

            {isPreparingVideo ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[13px] text-[var(--ink-soft)]">
                <Spinner />
                Preparing portrait video...
              </div>
            ) : null}

            {videoError ? (
              <div className="rounded-[14px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-3.5 py-3 text-sm text-[var(--danger-ink)]">
                {videoError}
              </div>
            ) : null}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-[14px] font-medium text-[var(--bg)] transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy || isPreparingVideo ? <Spinner /> : null}
              {t("createGroup.create")}
            </button>
          </form>
        </div>
      </div>

      <VideoRecorder
        open={showRecorder}
        environment={environment}
        onClose={() => setShowRecorder(false)}
        onRecorded={handleVideoRecorded}
      />
    </>
  );
}
