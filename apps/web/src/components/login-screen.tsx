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

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[#111110] px-6 py-8 text-[#D4D0CA]">
      <section
        className="flex min-h-[min(812px,calc(100vh-4rem))] w-full max-w-[375px] flex-col justify-center"
        aria-busy={isBusy || isRecovering}
      >
        <div className="space-y-12">
          <header>
            <h1
              className="text-[44px] leading-[1.0] tracking-[-0.02em] text-[#D4D0CA]"
              style={{ fontFamily: "var(--font-serif)", fontWeight: 400 }}
            >
              Kharisma
            </h1>
            <p className="mt-2.5 text-base leading-6 text-[#5C5850]">
              <span className="block">{t("login.tagline.line1")}</span>
              <span className="block">{t("login.tagline.line2")}</span>
            </p>
          </header>

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

        <footer className="mt-16 text-center text-[11px] leading-5 text-[#3E3B37]">
          {t("login.terms.before")}
          <br />
          <span className="text-[#5C5850] underline">{t("login.terms.tos")}</span>{" "}
          {t("login.terms.and")}{" "}
          <span className="text-[#5C5850] underline">{t("login.terms.privacy")}</span>
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
