"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session-provider";
import { useTheme } from "@/components/theme-provider";
import { BottomNav } from "@/components/bottom-nav";
import { Portrait } from "@/components/design/primitives";
import { ProtectedRouteLoading } from "@/components/protected-route-loading";
import { useI18n, useT } from "@/i18n/i18n-provider";
import {
  ensureWorldAppMicrophonePermission,
  ensureWorldAppNotificationPermission,
  getWorldAppPermissionStatuses,
} from "@/media/world-app-permissions";
import { SUPPORTED_LOCALES, LANGUAGE_LABELS, type Locale } from "@/i18n/messages";
import type { MessageKey } from "@/i18n/messages";

const CARD_SHADOW =
  "0 1px 2px rgba(44,42,37,0.04), 0 10px 24px -10px rgba(44,42,37,0.10)";

function formatAddress(address: `0x${string}`) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 px-4 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-soft)]">
      {children}
    </p>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-[22px] bg-[var(--surface)]"
      style={{ boxShadow: CARD_SHADOW }}
    >
      {children}
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors"
      style={{ background: on ? "var(--accent)" : "var(--line)" }}
    >
      <span
        className="absolute top-[3px] h-[24px] w-[24px] rounded-full bg-[var(--bg)] transition-all"
        style={{ left: on ? "25px" : "3px" }}
      />
    </span>
  );
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
  const [developerMode, setDeveloperMode] = useState(false);
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
    withDivider,
  }: {
    label: string;
    enabled: boolean;
    messageKey: MessageKey;
    busy: boolean;
    enableLabel: string;
    onEnable: () => void;
    withDivider: boolean;
  }) {
    const dividerClass = withDivider ? "border-t border-[var(--line)]" : "";
    const content = (
      <>
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-[var(--ink)]">{label}</p>
          <p className="mt-0.5 truncate text-[12px] text-[var(--ink-soft)]">
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
      return (
        <div
          className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 ${dividerClass}`}
        >
          {content}
        </div>
      );
    }

    return (
      <button
        type="button"
        aria-label={enableLabel}
        onClick={onEnable}
        disabled={busy || !!permissionBusy}
        className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition active:bg-[var(--line)]/40 disabled:opacity-50 ${dividerClass}`}
      >
        {content}
      </button>
    );
  }

  const verificationValue = kharismaProfile
    ? `${kharismaProfile.status} · ${kharismaProfile.verificationLevel}`
    : t("profile.unknown");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[28rem] flex-col px-5 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1
        className="mb-6 mt-2 text-[34px] leading-[1.05] tracking-[-0.01em] text-[var(--ink)]"
        style={{ fontFamily: "var(--font-serif)", fontWeight: 400 }}
      >
        {t("profile.title")}
      </h1>

      <div className="space-y-6">
        {/* Account */}
        <section>
          <SectionLabel>{t("profile.account")}</SectionLabel>
          <Card>
            <div className="flex items-center gap-3 px-4 py-4">
              <Portrait
                name={kharismaProfile?.handle || session.address}
                size={44}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-[family-name:var(--font-mono)] text-[15px] font-medium text-[var(--ink)]">
                  {formatAddress(session.address)}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-[var(--ink-soft)]">
                  {t("profile.via", { provider: session.providerLabel })}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3.5">
              <p className="text-[13px] text-[var(--ink-soft)]">
                {t("profile.verification")}
              </p>
              <p className="text-[13px] font-medium text-[var(--ink)]">
                {verificationValue}
              </p>
            </div>
            {kharismaProfile?.handle ? (
              <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3.5">
                <p className="text-[13px] text-[var(--ink-soft)]">
                  {t("profile.handle")}
                </p>
                <p className="truncate text-[13px] font-medium text-[var(--ink)]">
                  {kharismaProfile.handle}
                </p>
              </div>
            ) : null}
          </Card>
        </section>

        {/* Preferences */}
        <section>
          <SectionLabel>{t("profile.preferences")}</SectionLabel>
          <Card>
            <button
              type="button"
              onClick={() => setTheme(nextTheme)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition active:bg-[var(--line)]/40"
              aria-label={t("profile.switchToLabel", { mode: nextThemeLabel })}
            >
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-[var(--ink)]">
                  {t("profile.appearance")}
                </p>
                <p className="mt-0.5 text-[12px] text-[var(--ink-soft)]">
                  {theme === "dark" ? t("profile.darkMode") : t("profile.lightMode")}
                </p>
              </div>
              <Toggle on={theme === "dark"} />
            </button>
            <div className="border-t border-[var(--line)] px-4 py-3.5">
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
          </Card>
        </section>

        {/* Permissions (World App only) */}
        {environment === "world-app" ? (
          <section>
            <SectionLabel>{t("profile.permissions")}</SectionLabel>
            <Card>
              <PermissionRow
                label={t("profile.notifications")}
                enabled={notificationsEnabled}
                messageKey={notificationMessageKey}
                busy={permissionBusy === "notifications"}
                enableLabel={t("profile.enableNotifications")}
                onEnable={() => handleEnablePermission("notifications")}
                withDivider={false}
              />
              <PermissionRow
                label={t("profile.audio")}
                enabled={audioEnabled}
                messageKey={audioMessageKey}
                busy={permissionBusy === "audio"}
                enableLabel={t("profile.enableAudio")}
                onEnable={() => handleEnablePermission("audio")}
                withDivider
              />
            </Card>
          </section>
        ) : null}

        {/* Advanced */}
        <section>
          <SectionLabel>{t("profile.advanced")}</SectionLabel>
          <Card>
            <button
              type="button"
              onClick={() => setDeveloperMode((enabled) => !enabled)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition active:bg-[var(--line)]/40"
              aria-pressed={developerMode}
            >
              <p className="text-[15px] font-medium text-[var(--ink)]">
                {t("profile.developerMode")}
              </p>
              <Toggle on={developerMode} />
            </button>
            {developerMode ? (
              <button
                type="button"
                onClick={() => router.push("/xmtp")}
                className="flex w-full items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3.5 text-left transition active:bg-[var(--line)]/40"
              >
                <p className="text-[15px] font-medium text-[var(--ink)]">
                  {t("profile.inspectXmtp")}
                </p>
                <span aria-hidden className="text-[var(--ink-soft)]">
                  ›
                </span>
              </button>
            ) : null}
          </Card>
        </section>

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={isBusy}
          className="w-full rounded-[22px] bg-[var(--surface)] px-4 py-4 text-center text-[15px] font-medium text-[#c44] transition active:scale-[0.99] disabled:opacity-50"
          style={{ boxShadow: CARD_SHADOW }}
        >
          {t("profile.logout")}
        </button>
      </div>

      <BottomNav />
    </main>
  );
}
