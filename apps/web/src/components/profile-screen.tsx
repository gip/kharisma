"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session-provider";
import { useTheme } from "@/components/theme-provider";
import { BottomNav } from "@/components/bottom-nav";
import { ProtectedRouteLoading } from "@/components/protected-route-loading";
import { useI18n, useT } from "@/i18n/i18n-provider";
import {
  ensureWorldAppMicrophonePermission,
  ensureWorldAppNotificationPermission,
  getWorldAppPermissionStatuses,
} from "@/media/world-app-permissions";
import { SUPPORTED_LOCALES, LANGUAGE_LABELS, type Locale } from "@/i18n/messages";
import type { MessageKey } from "@/i18n/messages";

function formatAddress(address: `0x${string}`) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ProfileScreen() {
  const router = useRouter();
  const t = useT();
  const { locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const {
    environment,
    session,
    kharismaProfile,
    isBusy,
    isRecovering,
    logout,
  } = useSession();
  const [permissionBusy, setPermissionBusy] = useState<
    "notifications" | "audio" | null
  >(null);
  const [notificationMessageKey, setNotificationMessageKey] =
    useState<MessageKey>("notifications.notEnabled");
  const [audioMessageKey, setAudioMessageKey] =
    useState<MessageKey>("recorder.microphoneDisabled");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const nextTheme = theme === "dark" ? "light" : "dark";
  const nextThemeLabel = t(nextTheme === "dark" ? "profile.dark" : "profile.light");

  useEffect(() => {
    if (!session && !isRecovering) {
      router.replace("/");
    }
  }, [isRecovering, router, session]);

  useEffect(() => {
    if (!session || environment !== "world-app") return;
    let cancelled = false;
    void getWorldAppPermissionStatuses()
      .then(({ notifications, audio }) => {
        if (cancelled) return;
        setNotificationsEnabled(notifications.granted);
        setNotificationMessageKey(
          notifications.granted ? "notifications.enabled" : notifications.messageKey,
        );
        setAudioEnabled(audio.granted);
        setAudioMessageKey(
          audio.granted ? "recorder.microphoneReady" : audio.messageKey,
        );
      })
    return () => {
      cancelled = true;
    };
  }, [environment, session]);

  if (!session) {
    return isRecovering ? <ProtectedRouteLoading /> : null;
  }

  function handleLogout() {
    void (async () => {
      const success = await logout();
      if (success) router.replace("/");
    })();
  }

  function handleEnablePermission(kind: "notifications" | "audio") {
    if (permissionBusy) return;
    void (async () => {
      setPermissionBusy(kind);
      const result =
        kind === "notifications"
          ? await ensureWorldAppNotificationPermission()
          : await ensureWorldAppMicrophonePermission();
      if (kind === "notifications") {
        setNotificationsEnabled(result.granted);
        setNotificationMessageKey(
          result.granted ? "notifications.enabled" : result.messageKey,
        );
      } else {
        setAudioEnabled(result.granted);
        setAudioMessageKey(
          result.granted ? "recorder.microphoneReady" : result.messageKey,
        );
      }
      setPermissionBusy(null);
    })();
  }

  function PermissionRow({
    label,
    enabled,
    messageKey,
    busy,
    enableLabel,
    onEnable,
  }: {
    label: string;
    enabled: boolean;
    messageKey: MessageKey;
    busy: boolean;
    enableLabel: string;
    onEnable: () => void;
  }) {
    const content = (
      <>
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-[var(--ink)]">{label}</p>
          <p className="mt-1 truncate text-[12px] text-[var(--ink-soft)]">
            {busy ? t("profile.permissionsChecking") : t(messageKey)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium ${
            enabled
              ? "bg-[var(--accent)] text-[var(--bg)]"
              : "border border-[var(--line)] text-[var(--ink)]"
          }`}
        >
          {enabled
            ? t("profile.permissionOn")
            : busy
              ? t("profile.permissionEnabling")
              : enableLabel}
        </span>
      </>
    );

    if (enabled) {
      return <div className="flex w-full items-center justify-between gap-3 py-4">{content}</div>;
    }

    return (
      <button
        type="button"
        aria-label={enableLabel}
        onClick={onEnable}
        disabled={busy || !!permissionBusy}
        className="flex w-full items-center justify-between gap-3 py-4 text-left transition active:scale-[0.99] disabled:opacity-50"
      >
        {content}
      </button>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[28rem] flex-col px-5 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="py-4">
        <h1
          className="text-[34px] leading-[1.05] tracking-[-0.01em] text-[var(--ink)]"
          style={{ fontFamily: "var(--font-serif)", fontWeight: 400 }}
        >
          {t("profile.title")}
        </h1>
      </div>

      <div className="mt-4 space-y-3">
        {/* Wallet info */}
        <div
          className="rounded-[22px] bg-[var(--surface)] p-4"
          style={{
            boxShadow:
              "0 1px 2px rgba(44,42,37,0.04), 0 10px 24px -10px rgba(44,42,37,0.10)",
          }}
        >
          <p className="text-[12px] text-[var(--ink-soft)]">{t("profile.connectedWallet")}</p>
          <p className="mt-1 font-[family-name:var(--font-mono)] text-[15px] font-medium text-[var(--ink)]">
            {formatAddress(session.address)}
          </p>
          <p className="mt-1 text-[12px] text-[var(--ink-soft)]">
            {t("profile.via", { provider: session.providerLabel })}
          </p>
          <p className="mt-3 text-[12px] text-[var(--ink-soft)]">
            Verification:{" "}
            <span className="text-[var(--ink)]">
              {kharismaProfile
                ? `${kharismaProfile.status} / ${kharismaProfile.verificationLevel}`
                : "unknown"}
            </span>
          </p>
          {kharismaProfile?.handle ? (
            <p className="mt-1 text-[12px] text-[var(--ink-soft)]">
              Handle: <span className="text-[var(--ink)]">{kharismaProfile.handle}</span>
            </p>
          ) : null}
        </div>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={() => setTheme(nextTheme)}
          className="flex w-full items-center justify-between rounded-[22px] bg-[var(--surface)] p-4 text-left transition active:scale-[0.99]"
          style={{
            boxShadow:
              "0 1px 2px rgba(44,42,37,0.04), 0 10px 24px -10px rgba(44,42,37,0.10)",
          }}
          aria-label={t("profile.switchToLabel", { mode: nextThemeLabel })}
        >
          <div>
            <p className="text-[15px] font-medium text-[var(--ink)]">
              {t("profile.appearance")}
            </p>
            <p className="mt-1 text-[12px] text-[var(--ink-soft)]">
              {theme === "dark" ? t("profile.darkMode") : t("profile.lightMode")}
            </p>
          </div>
          <span
            aria-hidden="true"
            className="relative h-[30px] w-[52px] rounded-full transition-colors"
            style={{
              background: theme === "dark" ? "var(--accent)" : "var(--line)",
            }}
          >
            <div
              className="absolute top-[3px] h-[24px] w-[24px] rounded-full bg-[var(--bg)] transition-all"
              style={{
                left: theme === "dark" ? "25px" : "3px",
              }}
            />
          </span>
        </button>

        {environment === "world-app" ? (
          <div
            className="rounded-[22px] bg-[var(--surface)] p-4"
            style={{
              boxShadow:
                "0 1px 2px rgba(44,42,37,0.04), 0 10px 24px -10px rgba(44,42,37,0.10)",
            }}
          >
            <p className="mb-1 text-[15px] font-medium text-[var(--ink)]">
              {t("profile.permissions")}
            </p>
            <PermissionRow
              label={t("profile.notifications")}
              enabled={notificationsEnabled}
              messageKey={notificationMessageKey}
              busy={permissionBusy === "notifications"}
              enableLabel={t("profile.enableNotifications")}
              onEnable={() => handleEnablePermission("notifications")}
            />
            <PermissionRow
              label={t("profile.audio")}
              enabled={audioEnabled}
              messageKey={audioMessageKey}
              busy={permissionBusy === "audio"}
              enableLabel={t("profile.enableAudio")}
              onEnable={() => handleEnablePermission("audio")}
            />
          </div>
        ) : null}

        {/* Language switcher */}
        <div
          className="rounded-[22px] bg-[var(--surface)] p-4"
          style={{
            boxShadow:
              "0 1px 2px rgba(44,42,37,0.04), 0 10px 24px -10px rgba(44,42,37,0.10)",
          }}
        >
          <p className="text-[15px] font-medium text-[var(--ink)]">
            {t("profile.language")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUPPORTED_LOCALES.map((code) => {
              const active = code === locale;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLocale(code as Locale)}
                  className="rounded-full border px-3 py-1.5 text-[13px] transition active:scale-95"
                  style={{
                    background: active ? "var(--accent)" : "transparent",
                    borderColor: active ? "var(--accent)" : "var(--line)",
                    color: active ? "var(--bg)" : "var(--ink)",
                    fontWeight: active ? 500 : 400,
                  }}
                  aria-pressed={active}
                >
                  {LANGUAGE_LABELS[code]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={isBusy}
          className="w-full rounded-[22px] bg-[var(--surface)] p-4 text-left text-[15px] font-medium text-[#c44] transition active:scale-[0.99] disabled:opacity-50"
          style={{
            boxShadow:
              "0 1px 2px rgba(44,42,37,0.04), 0 10px 24px -10px rgba(44,42,37,0.10)",
          }}
        >
          {t("profile.logout")}
        </button>
      </div>

      <BottomNav />
    </main>
  );
}
