"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session-provider";
import { useT } from "@/i18n/i18n-provider";

type LoginButtonProps = {
  children: React.ReactNode;
  disabled: boolean;
  tone: "primary" | "secondary" | "muted";
  onClick: () => void;
};

function Spinner() {
  return <span className="spinner" aria-hidden />;
}

function WorldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" fill="currentColor" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="2"
        y="6"
        width="20"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M2 10h20" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18" cy="16" r="1.5" fill="currentColor" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="2"
        y="4"
        width="20"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M22 4l-10 8L2 4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ConvictionMark() {
  return (
    <div
      aria-hidden
      className="conviction-mark relative mx-auto h-[120px] w-[120px]"
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(201,168,124,0.32) 0%, rgba(201,168,124,0.10) 45%, transparent 75%)",
          animation: "conviction-glow 4.2s ease-in-out infinite",
        }}
      />
      <div
        className="absolute inset-0 rounded-full border border-[#3E3B37]"
        style={{ animation: "conviction-breathe 4.2s ease-in-out infinite" }}
      />
      <div
        className="absolute inset-[14px] rounded-full border border-[#5C5850]"
        style={{
          animation: "conviction-breathe 4.2s ease-in-out infinite",
          animationDelay: "0.6s",
        }}
      />
      <div
        className="absolute inset-[30px] rounded-full border border-[#C9A87C]"
        style={{
          animation: "conviction-breathe 4.2s ease-in-out infinite",
          animationDelay: "1.2s",
        }}
      />
      <div
        className="absolute inset-[50%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#C9A87C]"
        style={{
          width: 6,
          height: 6,
          marginLeft: -3,
          marginTop: -3,
          boxShadow: "0 0 16px 2px rgba(201,168,124,0.55)",
        }}
      />
    </div>
  );
}

type Pillar = { title: string; body: string };

function Pillars({ items }: { items: Pillar[] }) {
  return (
    <ul className="grid grid-cols-3 gap-3" aria-hidden={false}>
      {items.map((pillar, idx) => (
        <li
          key={pillar.title}
          className="flex flex-col gap-1.5 border-l border-[#2A2825] pl-3"
        >
          <span className="text-[10px] uppercase tracking-[0.14em] text-[#5C5850]">
            {String(idx + 1).padStart(2, "0")}
          </span>
          <span className="text-[13px] leading-tight text-[#D4D0CA]">
            {pillar.title}
          </span>
          <span className="text-[11px] leading-snug text-[#5C5850]">
            {pillar.body}
          </span>
        </li>
      ))}
    </ul>
  );
}

function LoginButton({ children, disabled, tone, onClick }: LoginButtonProps) {
  const toneClass =
    tone === "primary"
      ? "border-transparent bg-[#D4D0CA] text-[#111110] hover:bg-[#E8E5DF]"
      : tone === "secondary"
        ? "border-[#2A2825] bg-transparent text-[#D4D0CA] hover:border-[#5C5850]"
        : "border-[#1E1D1B] bg-transparent text-[#5C5850] hover:border-[#2A2825]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-center gap-2.5 rounded-lg border px-4 py-3.5 text-[15px] font-medium leading-none transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 ${toneClass}`}
    >
      {children}
    </button>
  );
}

export function LoginScreen() {
  const router = useRouter();
  const t = useT();
  const {
    environment,
    session,
    error,
    isBusy,
    isRecovering,
    privyAvailability,
    worldAppAvailability,
    connectWithMetaMask,
    connectWithWorldApp,
    startEmailLogin,
    startPhoneLogin,
    startWalletLogin,
  } = useSession();

  useEffect(() => {
    if (session) {
      router.replace("/groups");
    }
  }, [router, session]);

  function handleDirectLogin(action: () => Promise<boolean>) {
    void (async () => {
      const success = await action();

      if (success) {
        router.replace("/groups");
      }
    })();
  }

  const isWorldApp = environment === "world-app";
  const disabled = isBusy || isRecovering;
  const canUsePrivy = privyAvailability.enabled && !disabled;
  const canUseWorldApp = worldAppAvailability.enabled && !disabled;
  const authUnavailableReason = isWorldApp
    ? !worldAppAvailability.enabled
      ? worldAppAvailability.reason
      : null
    : !privyAvailability.enabled
      ? privyAvailability.reason
      : null;

  const connectWallet = () => {
    if (privyAvailability.enabled) {
      startWalletLogin();
      return;
    }

    handleDirectLogin(connectWithMetaMask);
  };

  const pillars: Pillar[] = [
    {
      title: t("login.pillar.humans.title"),
      body: t("login.pillar.humans.body"),
    },
    {
      title: t("login.pillar.circles.title"),
      body: t("login.pillar.circles.body"),
    },
    {
      title: t("login.pillar.capital.title"),
      body: t("login.pillar.capital.body"),
    },
  ];

  return (
    <main className="relative flex min-h-screen w-full justify-center overflow-hidden bg-[#111110] px-6 py-10 text-[#D4D0CA]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, rgba(201,168,124,0.07) 0%, transparent 70%)",
        }}
      />

      <section
        className="relative flex min-h-[calc(100vh-5rem)] w-full max-w-[375px] flex-col"
        aria-busy={isBusy || isRecovering}
      >
        <div className="flex flex-1 flex-col gap-10">
          <header className="flex flex-col items-center text-center">
            <ConvictionMark />

            <span
              className="mt-7 text-[10px] uppercase tracking-[0.22em] text-[#C9A87C]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {t("login.eyebrow")}
            </span>

            <h1
              className="mt-3 text-[56px] leading-[0.95] tracking-[-0.025em] text-[#E8E5DF]"
              style={{ fontFamily: "var(--font-serif)", fontWeight: 400 }}
            >
              Kharisma
            </h1>

            <p className="mt-4 max-w-[300px] text-[15px] leading-[1.5] text-[#A9A49B]">
              {t("login.tagline")}
            </p>
          </header>

          <Pillars items={pillars} />

          <section className="space-y-3" aria-label={t("login.signInLabel")}>
            <LoginButton
              tone="primary"
              disabled={isWorldApp ? !canUseWorldApp : disabled}
              onClick={
                isWorldApp
                  ? () => handleDirectLogin(connectWithWorldApp)
                  : connectWallet
              }
            >
              {isBusy ? <Spinner /> : isWorldApp ? <WorldIcon /> : <WalletIcon />}
              {isWorldApp
                ? t("login.continueWithWorldApp")
                : t("login.connectWallet")}
            </LoginButton>

            {!isWorldApp ? (
              <>
                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-[#2A2825]" />
                  <span className="text-xs text-[#3E3B37]">{t("login.or")}</span>
                  <div className="h-px flex-1 bg-[#2A2825]" />
                </div>

                <LoginButton
                  tone="secondary"
                  disabled={!canUsePrivy}
                  onClick={startEmailLogin}
                >
                  <EmailIcon />
                  {t("login.continueWithEmail")}
                </LoginButton>

                <LoginButton
                  tone="secondary"
                  disabled={!canUsePrivy}
                  onClick={startPhoneLogin}
                >
                  <PhoneIcon />
                  {t("login.continueWithPhone")}
                </LoginButton>

                <p className="text-center text-[11px] leading-5 text-[#3E3B37]">
                  {t("login.smsNote")}
                </p>
              </>
            ) : null}
          </section>
        </div>

        <footer className="mt-10 flex flex-col items-center gap-4">
          <p
            className="text-[10px] uppercase tracking-[0.22em] text-[#3E3B37]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {t("login.poweredBy")}
          </p>

          <p className="text-center text-[11px] leading-5 text-[#3E3B37]">
            {t("login.terms.before")}
            <br />
            <span className="text-[#5C5850] underline">
              {t("login.terms.tos")}
            </span>{" "}
            {t("login.terms.and")}{" "}
            <span className="text-[#5C5850] underline">
              {t("login.terms.privacy")}
            </span>
          </p>
        </footer>

        {authUnavailableReason ? (
          <section className="mt-4 rounded-lg border border-[#2A2825] px-3.5 py-3 text-center text-xs leading-5 text-[#5C5850]">
            {authUnavailableReason}
          </section>
        ) : null}

        {error ? (
          <section className="mt-4 rounded-lg border border-[var(--danger-line)] bg-[var(--danger-bg)] px-3.5 py-3 text-center text-sm leading-6 text-[var(--danger-ink)]">
            {error}
          </section>
        ) : null}
      </section>
    </main>
  );
}
