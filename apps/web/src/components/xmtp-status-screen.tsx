"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Client,
  IdentifierKind,
  createBackend,
  getInboxIdForIdentifier,
  type Signer as XmtpSigner,
} from "@xmtp/browser-sdk";
import { useRouter } from "next/navigation";
import { toBytes } from "viem";
import { BackendApiClient, loadBackendSession } from "@/backend/client";
import { BottomNav } from "@/components/bottom-nav";
import { ProtectedRouteLoading } from "@/components/protected-route-loading";
import { useSession, type Session } from "@/components/session-provider";
import { getPublicEnv } from "@/wallet/runtime";

const CARD_SHADOW =
  "0 1px 2px rgba(44,42,37,0.04), 0 10px 24px -10px rgba(44,42,37,0.10)";

type XmtpStatusState =
  | { status: "idle" | "loading"; inboxId: null; inboxStates: null; error: null }
  | { status: "ready"; inboxId: string; inboxStates: unknown; error: null }
  | { status: "error"; inboxId: null; inboxStates: null; error: string };

type InstallationSummary = {
  installationId: string;
  installationBytes: Uint8Array | null;
  clientTimestamp: string;
};

type IdentitySummary = {
  identifier: string;
  kind: "Ethereum" | "Passkey";
  isRecovery: boolean;
};

function bytesToHex(bytes: ArrayLike<number>) {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function formatInstallationId(value: unknown) {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return bytesToHex(value);
  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "number" && Number.isInteger(entry))
  ) {
    return bytesToHex(value);
  }
  return "unknown";
}

function installationBytes(value: unknown) {
  if (value instanceof Uint8Array) return value;
  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "number" && Number.isInteger(entry))
  ) {
    return new Uint8Array(value);
  }
  if (typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value)) {
    return toBytes(value as `0x${string}`);
  }
  return null;
}

function formatClientTimestamp(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    return "unknown";
  }

  try {
    const ns = BigInt(value);
    return new Date(Number(ns / 1_000_000n)).toLocaleString();
  } catch {
    return "unknown";
  }
}

function shortenId(id: string) {
  if (id.length <= 20) return id;
  return `${id.slice(0, 10)}…${id.slice(-8)}`;
}

function identifierKindLabel(value: unknown): "Ethereum" | "Passkey" | "Unknown" {
  if (value === IdentifierKind.Ethereum || value === "Ethereum") return "Ethereum";
  if (value === IdentifierKind.Passkey || value === "Passkey") return "Passkey";
  return "Unknown";
}

function identitySummaries(inboxStates: unknown): IdentitySummary[] {
  if (!Array.isArray(inboxStates)) return [];

  const summaries: IdentitySummary[] = [];
  const seen = new Set<string>();

  for (const state of inboxStates) {
    if (!state || typeof state !== "object") continue;

    const record = state as {
      accountIdentifiers?: unknown;
      recoveryIdentifier?: unknown;
    };

    const recovery = record.recoveryIdentifier as
      | { identifier?: unknown }
      | undefined;
    const recoveryKey =
      recovery && typeof recovery.identifier === "string"
        ? recovery.identifier.toLowerCase()
        : null;

    const accounts = record.accountIdentifiers;
    if (!Array.isArray(accounts)) continue;

    for (const entry of accounts) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as { identifier?: unknown; identifierKind?: unknown };
      if (typeof item.identifier !== "string") continue;
      const kind = identifierKindLabel(item.identifierKind);
      if (kind === "Unknown") continue;
      const key = item.identifier.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      summaries.push({
        identifier: item.identifier,
        kind,
        isRecovery: key === recoveryKey,
      });
    }
  }

  return summaries;
}

function installationSummaries(inboxStates: unknown): InstallationSummary[] {
  if (!Array.isArray(inboxStates)) return [];

  return inboxStates.flatMap((state) => {
    if (!state || typeof state !== "object" || !("installations" in state)) {
      return [];
    }

    const installations = (state as { installations: unknown }).installations;
    if (!Array.isArray(installations)) return [];

    return installations.map((installation) => {
      if (!installation || typeof installation !== "object") {
        return {
          installationId: "unknown",
          installationBytes: null,
          clientTimestamp: "unknown",
        };
      }

      const record = installation as {
        id?: unknown;
        installationId?: unknown;
        bytes?: unknown;
        clientTimestampNs?: unknown;
      };

      return {
        installationId: formatInstallationId(record.installationId ?? record.id),
        installationBytes: installationBytes(record.bytes ?? record.installationId ?? record.id),
        clientTimestamp: formatClientTimestamp(record.clientTimestampNs),
      };
    });
  });
}

function createXmtpSigner(session: Session): XmtpSigner {
  const backendSession = loadBackendSession();
  const walletAccountType = backendSession?.session.walletAccountType ?? "EOA";
  const walletChainId = backendSession?.session.walletChainId;
  const baseSigner = {
    getIdentifier: () => ({
      identifier: session.address.toLowerCase(),
      identifierKind: IdentifierKind.Ethereum,
    }),
    signMessage: async (message: string) => {
      const signature = await session.signer.signMessage(message);
      return toBytes(signature);
    },
  };

  if (walletAccountType === "SCW") {
    if (!walletChainId) {
      throw new Error("Wallet chain id is required to revoke SCW installations");
    }
    return {
      type: "SCW",
      ...baseSigner,
      getChainId: () => BigInt(walletChainId),
    };
  }

  return {
    type: "EOA",
    ...baseSigner,
  };
}

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-soft)]">
          {label}
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink)] transition active:scale-95"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-2 break-all font-[family-name:var(--font-mono)] text-[13px] leading-[1.5] text-[var(--ink)]">
        {value}
      </p>
    </div>
  );
}

function ConfirmRevokeSheet({
  installation,
  busy,
  onCancel,
  onConfirm,
}: {
  installation: InstallationSummary;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-[28rem] rounded-t-[1.5rem] border border-b-0 border-[var(--line)] bg-[var(--bg)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--line)]" />

        <h2
          className="text-[22px] leading-[1.15] tracking-[-0.01em] text-[var(--ink)]"
          style={{ fontFamily: "var(--font-serif)", fontWeight: 400 }}
        >
          Delete installation?
        </h2>
        <p className="mt-2 text-[13px] leading-[1.45] text-[var(--ink-soft)]">
          This installation will be revoked from your XMTP inbox and can no longer
          send or receive messages. This action cannot be undone.
        </p>

        <div className="mt-4 rounded-2xl bg-[var(--surface)] px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-soft)]">
            Installation ID
          </p>
          <p className="mt-1 break-all font-[family-name:var(--font-mono)] text-[12px] leading-[1.5] text-[var(--ink)]">
            {installation.installationId}
          </p>
          <p className="mt-2 text-[12px] text-[var(--ink-soft)]">
            Created {installation.clientTimestamp}
          </p>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-full border border-[var(--line)] px-4 py-3 text-[14px] font-medium text-[var(--ink)] transition active:scale-[0.99] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !installation.installationBytes}
            className="flex-1 rounded-full px-4 py-3 text-[14px] font-medium text-white transition active:scale-[0.99] disabled:opacity-60"
            style={{ background: "#c44" }}
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function XmtpStatusScreen() {
  const router = useRouter();
  const { session, isRecovering } = useSession();
  const [removingIdentity, setRemovingIdentity] = useState<string | null>(null);
  const [revokingInstallationId, setRevokingInstallationId] = useState<string | null>(
    null,
  );
  const [pendingRevoke, setPendingRevoke] = useState<InstallationSummary | null>(null);
  const [state, setState] = useState<XmtpStatusState>({
    status: "idle",
    inboxId: null,
    inboxStates: null,
    error: null,
  });

  useEffect(() => {
    if (!session && !isRecovering) {
      router.replace("/");
    }
  }, [isRecovering, router, session]);

  const loadInboxStates = useCallback(
    async (activeSession: Session, cancelled: () => boolean) => {
      const backend = await createBackend({ env: "production" });
      const inboxId = await getInboxIdForIdentifier(backend, {
        identifier: activeSession.address,
        identifierKind: IdentifierKind.Ethereum,
      });

      if (!inboxId) {
        throw new Error("XMTP inbox id is not available");
      }

      const inboxStates = await Client.fetchInboxStates([inboxId], backend);
      if (!cancelled()) {
        setState({ status: "ready", inboxId, inboxStates, error: null });
      }
      return { backend, inboxId, inboxStates };
    },
    [],
  );

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    setState({ status: "loading", inboxId: null, inboxStates: null, error: null });

    void (async () => {
      try {
        await loadInboxStates(session, () => cancelled);
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            inboxId: null,
            inboxStates: null,
            error: error instanceof Error ? error.message : "Failed to fetch inboxStates",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadInboxStates, session]);

  if (!session) {
    return isRecovering ? <ProtectedRouteLoading /> : null;
  }

  async function confirmRevoke() {
    const installation = pendingRevoke;
    if (
      !session ||
      !installation ||
      state.status !== "ready" ||
      !installation.installationBytes
    ) {
      return;
    }

    setRevokingInstallationId(installation.installationId);
    try {
      const backend = await createBackend({ env: "production" });
      await Client.revokeInstallations(
        createXmtpSigner(session),
        state.inboxId,
        [installation.installationBytes],
        backend,
      );
      await loadInboxStates(session, () => false);
      setPendingRevoke(null);
    } catch (error) {
      setState({
        status: "error",
        inboxId: null,
        inboxStates: null,
        error: error instanceof Error ? error.message : "Failed to revoke installation",
      });
      setPendingRevoke(null);
    } finally {
      setRevokingInstallationId(null);
    }
  }

  async function removeIdentity(identity: IdentitySummary) {
    if (!session || identity.isRecovery || removingIdentity) {
      return;
    }

    const backendSession = loadBackendSession();
    if (!backendSession?.token) {
      setState({
        status: "error",
        inboxId: null,
        inboxStates: null,
        error: "Backend session is not available",
      });
      return;
    }

    setRemovingIdentity(identity.identifier);
    try {
      const api = new BackendApiClient(getPublicEnv().backendHttpUrl);
      await api.removeXmtpAccount({
        token: backendSession.token,
        identifier: identity.identifier,
        identifierKind: identity.kind,
      });
      await loadInboxStates(session, () => false);
      router.refresh();
    } catch (error) {
      setState({
        status: "error",
        inboxId: null,
        inboxStates: null,
        error: error instanceof Error ? error.message : "Failed to remove identity",
      });
    } finally {
      setRemovingIdentity(null);
    }
  }

  const installations =
    state.status === "ready" ? installationSummaries(state.inboxStates) : [];
  const identities =
    state.status === "ready" ? identitySummaries(state.inboxStates) : [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[28rem] flex-col px-5 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1
        className="mb-6 mt-2 text-[34px] leading-[1.05] tracking-[-0.01em] text-[var(--ink)]"
        style={{ fontFamily: "var(--font-serif)", fontWeight: 400 }}
      >
        XMTP status
      </h1>

      <div className="space-y-6">
        {/* Inbox */}
        <section>
          <p className="mb-2 px-4 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-soft)]">
            Inbox
          </p>
          <div
            className="overflow-hidden rounded-[22px] bg-[var(--surface)]"
            style={{ boxShadow: CARD_SHADOW }}
          >
            {state.status === "ready" ? (
              <CopyableField label="Inbox ID" value={state.inboxId} />
            ) : state.status === "error" ? (
              <p className="break-words px-4 py-4 text-[14px] text-[#c44]">
                {state.error}
              </p>
            ) : (
              <p className="px-4 py-4 text-[14px] text-[var(--ink-soft)]">
                Loading inbox…
              </p>
            )}
          </div>
        </section>

        {/* Identities */}
        <section>
          <div className="mb-2 flex items-end justify-between gap-2 px-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-soft)]">
              Identities
            </p>
            {state.status === "ready" ? (
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                {identities.length} total
              </p>
            ) : null}
          </div>
          <div
            className="overflow-hidden rounded-[22px] bg-[var(--surface)]"
            style={{ boxShadow: CARD_SHADOW }}
          >
            {state.status === "ready" ? (
              identities.length === 0 ? (
                <p className="px-4 py-4 text-[14px] text-[var(--ink-soft)]">
                  No identities found.
                </p>
              ) : (
                identities.map((identity, index) => {
                  const isRemoving = removingIdentity === identity.identifier;
                  const className = `flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left ${index > 0 ? "border-t border-[var(--line)]" : ""}`;

                  const content = (
                    <>
                      <div className="min-w-0">
                        <p className="break-all font-[family-name:var(--font-mono)] text-[13px] font-medium text-[var(--ink)]">
                          {identity.identifier}
                        </p>
                        <p className="mt-0.5 text-[12px] text-[var(--ink-soft)]">
                          {isRemoving ? "Removing…" : identity.kind}
                        </p>
                      </div>
                      {identity.isRecovery ? (
                        <span className="shrink-0 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-[var(--bg)]">
                          Recovery
                        </span>
                      ) : (
                        <span aria-hidden className="shrink-0 text-[var(--ink-soft)]">
                          ›
                        </span>
                      )}
                    </>
                  );

                  return identity.isRecovery ? (
                    <div key={`${identity.identifier}:${index}`} className={className}>
                      {content}
                    </div>
                  ) : (
                    <button
                      key={`${identity.identifier}:${index}`}
                      type="button"
                      onClick={() => {
                        void removeIdentity(identity);
                      }}
                      disabled={Boolean(removingIdentity)}
                      className={`${className} transition active:bg-[var(--line)]/40 disabled:opacity-50`}
                    >
                      {content}
                    </button>
                  );
                })
              )
            ) : state.status === "error" ? (
              <p className="break-words px-4 py-4 text-[14px] text-[#c44]">
                {state.error}
              </p>
            ) : (
              <p className="px-4 py-4 text-[14px] text-[var(--ink-soft)]">
                Loading identities…
              </p>
            )}
          </div>
        </section>

        {/* Installations */}
        <section>
          <div className="mb-2 flex items-end justify-between gap-2 px-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-soft)]">
              Installations
            </p>
            {state.status === "ready" ? (
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                {installations.length} total
              </p>
            ) : null}
          </div>
          <div
            className="overflow-hidden rounded-[22px] bg-[var(--surface)]"
            style={{ boxShadow: CARD_SHADOW }}
          >
            {state.status === "loading" || state.status === "idle" ? (
              <p className="px-4 py-4 text-[14px] text-[var(--ink-soft)]">
                Loading installations…
              </p>
            ) : state.status === "error" ? (
              <p className="break-words px-4 py-4 text-[14px] text-[#c44]">
                {state.error}
              </p>
            ) : installations.length === 0 ? (
              <p className="px-4 py-4 text-[14px] text-[var(--ink-soft)]">
                No installations found.
              </p>
            ) : (
              installations.map((installation, index) => {
                const disabled =
                  !installation.installationBytes ||
                  revokingInstallationId === installation.installationId;
                return (
                  <button
                    key={`${installation.installationId}:${index}`}
                    type="button"
                    onClick={() => setPendingRevoke(installation)}
                    disabled={disabled}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition active:bg-[var(--line)]/40 disabled:opacity-50 ${index > 0 ? "border-t border-[var(--line)]" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-[family-name:var(--font-mono)] text-[13px] font-medium text-[var(--ink)]">
                        {shortenId(installation.installationId)}
                      </p>
                      <p className="mt-0.5 text-[12px] text-[var(--ink-soft)]">
                        {revokingInstallationId === installation.installationId
                          ? "Deleting…"
                          : installation.clientTimestamp}
                      </p>
                    </div>
                    <span aria-hidden className="shrink-0 text-[var(--ink-soft)]">
                      ›
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>
      </div>

      {pendingRevoke ? (
        <ConfirmRevokeSheet
          installation={pendingRevoke}
          busy={revokingInstallationId === pendingRevoke.installationId}
          onCancel={() => setPendingRevoke(null)}
          onConfirm={() => {
            void confirmRevoke();
          }}
        />
      ) : null}

      <BottomNav />
    </main>
  );
}
