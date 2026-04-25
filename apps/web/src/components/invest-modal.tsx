"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  InvestmentChainConfig,
  InvestmentConfig,
  InvestmentToken,
} from "@/backend/types";

const WORLD_CHAIN_ID = 480;
const BASE_CHAIN_ID = 8453;

function Spinner() {
  return <span className="spinner" aria-hidden />;
}

function formatChainName(chain: InvestmentChainConfig | null) {
  if (!chain) return "";
  return chain.name === "world" ? "World Chain" : "Base";
}

function expectedChainName(environment: "web" | "world-app" | "mobile-web") {
  return environment === "world-app" ? "World Chain" : "Base";
}

function unavailableInvestmentMessage(
  config: InvestmentConfig | null,
  environment: "web" | "world-app" | "mobile-web",
) {
  if (!config?.destinationAddress) {
    return "Investment destination is not configured for this group.";
  }
  if (config.chains.length === 0) {
    return "Investment chains are not configured on the groups service.";
  }
  return `${expectedChainName(environment)} investments are not configured for this context.`;
}

export function InvestModal({
  open,
  groupId,
  syncInboxId,
  environment,
  getInvestmentConfig,
  submitInvestment,
  onClose,
  onRecorded,
}: {
  open: boolean;
  groupId: string;
  syncInboxId: string;
  environment: "web" | "world-app" | "mobile-web";
  getInvestmentConfig: (input: {
    groupId: string;
    syncInboxId: string;
  }) => Promise<InvestmentConfig>;
  submitInvestment: (input: {
    groupId: string;
    syncInboxId: string;
    token: InvestmentToken;
    amount: string;
  }) => Promise<{ status: "recorded" | "already-recorded" }>;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const [config, setConfig] = useState<InvestmentConfig | null>(null);
  const [selectedToken, setSelectedToken] = useState<InvestmentToken>("USDC");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chainId = environment === "world-app" ? WORLD_CHAIN_ID : BASE_CHAIN_ID;
  const chain = useMemo(
    () =>
      config?.chains.find((candidate) => candidate.chainId === chainId) ?? null,
    [chainId, config],
  );
  const tokens = chain?.tokens ?? [];

  // Pin the callback so this effect doesn't re-fire (and re-fetch) every time
  // SessionProvider re-renders and hands us a new function reference.
  const getInvestmentConfigRef = useRef(getInvestmentConfig);
  useEffect(() => {
    getInvestmentConfigRef.current = getInvestmentConfig;
  }, [getInvestmentConfig]);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setMessage(null);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getInvestmentConfigRef.current({ groupId, syncInboxId })
      .then((next) => {
        if (cancelled) return;
        setConfig(next);
        const available = next.chains.find(
          (candidate) => candidate.chainId === chainId,
        )?.tokens;
        if (available?.length) {
          setSelectedToken(
            available.some((candidate) => candidate.token === "USDC")
              ? "USDC"
              : available[0]!.token,
          );
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Failed to load investment options",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chainId, groupId, open, syncInboxId]);

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const result = await submitInvestment({
        groupId,
        syncInboxId,
        token: selectedToken,
        amount,
      });
      setAmount("");
      setMessage(
        result.status === "recorded"
          ? "Investment recorded."
          : "Investment was already recorded.",
      );
      onRecorded();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Investment failed");
    } finally {
      setSubmitting(false);
    }
  }

  const disabled =
    loading ||
    submitting ||
    !config?.destinationAddress ||
    tokens.length === 0 ||
    !amount.trim();

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-[28rem] rounded-t-[1.5rem] border border-b-0 border-[var(--line)] bg-[var(--bg)] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
        <div className="mb-1 flex items-center justify-between">
          <div>
            <h2
              className="text-[22px] leading-[1.1] tracking-[-0.01em] text-[var(--ink)]"
              style={{ fontFamily: "var(--font-serif)", fontWeight: 400 }}
            >
              Invest
            </h2>
            <p className="mt-1 text-[12px] text-[var(--ink-soft)]">
              {chain ? formatChainName(chain) : "Investment network"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-[var(--ink-soft)] transition hover:text-[var(--ink)] disabled:opacity-40"
            aria-label="Close"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              disabled={submitting}
              className="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[18px] text-[var(--ink)] outline-none transition focus:border-[var(--accent)] disabled:opacity-60"
              aria-label="Investment amount"
              autoFocus
            />
            <select
              value={selectedToken}
              onChange={(event) =>
                setSelectedToken(event.target.value as InvestmentToken)
              }
              disabled={tokens.length <= 1 || submitting}
              className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-[14px] text-[var(--ink)] outline-none disabled:opacity-60"
              aria-label="Investment token"
            >
              {tokens.map((token) => (
                <option key={token.token} value={token.token}>
                  {token.token}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[13px] text-[var(--ink-soft)]">
              <Spinner />
              Loading investment options...
            </div>
          ) : null}

          {!loading && tokens.length === 0 ? (
            <p className="text-[13px] text-[var(--ink-soft)]">
              {unavailableInvestmentMessage(config, environment)}
            </p>
          ) : null}

          {message ? (
            <p className="text-[13px] text-[var(--ink)]">{message}</p>
          ) : null}
          {error ? (
            <div className="rounded-[14px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-3.5 py-3 text-sm text-[var(--danger-ink)]">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={disabled}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-[14px] font-medium text-[var(--bg)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Spinner /> : null}
            Invest
          </button>
        </form>
      </div>
    </div>
  );
}
