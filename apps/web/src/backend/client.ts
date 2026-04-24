import type {
  AuthChallengeResponse,
  AuthVerifyResponse,
  BackendSession,
  KharismaProfile,
  KharismaGroupSummary,
  KharismaJoinResult,
  KharismaWorldIdRequest,
  GroupJoinPolicy,
  GroupLanguageCode,
  InvestmentConfig,
  InvestmentSubmitResult,
  InvestmentToken,
  SiweNonceResponse,
  ThreadSummary,
  XmtpBootstrapResponse,
  XmtpChatSummary,
  XmtpMessage,
} from "./types";

type FetchOptions = {
  method?: string;
  token?: string;
  body?: unknown;
};

type BackendRequestError = Error & {
  status?: number;
};

function backendNetworkError(baseUrl: string, cause: unknown) {
  const detail = cause instanceof Error ? cause.message : "network request failed";
  return new Error(
    `Cannot reach clients-service at ${baseUrl}. ${detail}`,
  );
}

async function fetchJson<T>(
  baseUrl: string,
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...(options.token
          ? {
              authorization: `Bearer ${options.token}`,
            }
          : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (cause) {
    throw backendNetworkError(baseUrl, cause);
  }

  const payload = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const error = new Error(
      typeof payload.error === "string"
        ? payload.error
        : `Backend request failed with ${response.status}`,
    ) as BackendRequestError;
    error.status = response.status;
    throw error;
  }

  return payload as T;
}

export class BackendApiClient {
  constructor(private readonly baseUrl: string) {}

  requestChallenge(input: {
    walletAddress: `0x${string}`;
    chainId: number | null;
    loginMethod: string;
  }) {
    return fetchJson<AuthChallengeResponse>(this.baseUrl, "/auth/challenge", {
      method: "POST",
      body: input,
    });
  }

  verifyChallenge(input: { challengeId: string; signature: `0x${string}` }) {
    return fetchJson<AuthVerifyResponse>(this.baseUrl, "/auth/verify", {
      method: "POST",
      body: input,
    });
  }

  requestSiweNonce(input: { loginMethod: string }) {
    return fetchJson<SiweNonceResponse>(this.baseUrl, "/auth/siwe/nonce", {
      method: "POST",
      body: input,
    });
  }

  verifySiwe(input: {
    challengeId: string;
    address: `0x${string}`;
    message: string;
    signature: `0x${string}`;
  }) {
    return fetchJson<AuthVerifyResponse>(this.baseUrl, "/auth/siwe/verify", {
      method: "POST",
      body: input,
    });
  }

  bootstrapXmtp(token: string) {
    return fetchJson<XmtpBootstrapResponse>(this.baseUrl, "/xmtp/bootstrap", {
      method: "POST",
      token,
    });
  }

  createKharismaWorldIdRequest(
    token: string,
    action: "identity" | "human" | "human-agent",
  ) {
    return fetchJson<KharismaWorldIdRequest>(
      this.baseUrl,
      "/kharisma/world-id/request",
      {
        method: "POST",
        token,
        body: { action },
      },
    );
  }

  getKharismaStatus(token: string) {
    return fetchJson<{ profile: KharismaProfile }>(
      this.baseUrl,
      "/kharisma/status",
      {
        method: "POST",
        token,
      },
    );
  }

  submitKharismaIdentity(input: {
    token: string;
    proof: unknown;
  }) {
    return fetchJson<{ profile: KharismaProfile }>(
      this.baseUrl,
      "/kharisma/verify/identity",
      {
        method: "POST",
        token: input.token,
        body: { proof: input.proof },
      },
    );
  }

  submitKharismaHuman(input: {
    token: string;
    handle: string;
    proof: unknown;
  }) {
    return fetchJson<{ profile: KharismaProfile }>(
      this.baseUrl,
      "/kharisma/verify/human",
      {
        method: "POST",
        token: input.token,
        body: {
          handle: input.handle,
          proof: input.proof,
        },
      },
    );
  }

  getKharismaSyncStatus(input: {
    token: string;
    syncInboxId: string;
  }) {
    return fetchJson<{ profile: KharismaProfile }>(
      this.baseUrl,
      "/kharisma/groups/verify/status",
      {
        method: "POST",
        token: input.token,
        body: { syncInboxId: input.syncInboxId },
      },
    );
  }

  submitKharismaSyncIdentity(input: {
    token: string;
    syncInboxId: string;
    proof: unknown;
  }) {
    return fetchJson<{ profile: KharismaProfile }>(
      this.baseUrl,
      "/kharisma/groups/verify/identity",
      {
        method: "POST",
        token: input.token,
        body: {
          syncInboxId: input.syncInboxId,
          proof: input.proof,
        },
      },
    );
  }

  submitKharismaSyncHuman(input: {
    token: string;
    syncInboxId: string;
    handle: string;
    proof: unknown;
  }) {
    return fetchJson<{ profile: KharismaProfile }>(
      this.baseUrl,
      "/kharisma/groups/verify/human",
      {
        method: "POST",
        token: input.token,
        body: {
          syncInboxId: input.syncInboxId,
          handle: input.handle,
          proof: input.proof,
        },
      },
    );
  }

  submitKharismaSyncHumanAgent(input: {
    token: string;
    syncInboxId: string;
    ownerHumanId: string;
    handle: string;
    proof: unknown;
  }) {
    return fetchJson<{ profile: KharismaProfile }>(
      this.baseUrl,
      "/kharisma/groups/verify/human-agent",
      {
        method: "POST",
        token: input.token,
        body: {
          syncInboxId: input.syncInboxId,
          ownerHumanId: input.ownerHumanId,
          handle: input.handle,
          proof: input.proof,
        },
      },
    );
  }

  listKharismaGroups(
    token: string,
    input: { languages?: GroupLanguageCode[] } = {},
  ) {
    return fetchJson<{ groups: KharismaGroupSummary[] }>(
      this.baseUrl,
      "/kharisma/groups/list",
      {
        method: "POST",
        token,
        body: input.languages?.length
          ? { languages: input.languages }
          : {},
      },
    );
  }

  createKharismaGroup(input: {
    token: string;
    title: string;
    description: string;
    mediaId: string;
    thumbnailId: string;
    languages: GroupLanguageCode[];
    joinPolicy: GroupJoinPolicy;
    maxMembers: number;
  }) {
    return fetchJson<{ group: KharismaGroupSummary }>(
      this.baseUrl,
      "/kharisma/groups",
      {
        method: "POST",
        token: input.token,
        body: {
          title: input.title,
          description: input.description,
          mediaId: input.mediaId,
          thumbnailId: input.thumbnailId,
          languages: input.languages,
          joinPolicy: input.joinPolicy,
          maxMembers: input.maxMembers,
        },
      },
    );
  }

  joinKharismaGroup(input: {
    token: string;
    groupId: string;
    syncInboxId: string;
    name?: string;
  }) {
    return fetchJson<{ join: KharismaJoinResult }>(
      this.baseUrl,
      "/kharisma/groups/join",
      {
        method: "POST",
        token: input.token,
        body: {
          groupId: input.groupId,
          syncInboxId: input.syncInboxId,
          ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        },
      },
    );
  }

  getInvestmentConfig(input: {
    token: string;
    groupId: string;
    syncInboxId: string;
  }) {
    return fetchJson<InvestmentConfig>(
      this.baseUrl,
      "/kharisma/investments/config",
      {
        method: "POST",
        token: input.token,
        body: {
          groupId: input.groupId,
          syncInboxId: input.syncInboxId,
        },
      },
    );
  }

  verifyInvestment(input: {
    token: string;
    groupId: string;
    syncInboxId: string;
    txHash?: string;
    userOpHash?: string;
    chainId: number;
    tokenSymbol: InvestmentToken;
    amount: string;
  }) {
    return fetchJson<InvestmentSubmitResult>(
      this.baseUrl,
      `/kharisma/groups/${encodeURIComponent(input.groupId)}/investments/verify`,
      {
        method: "POST",
        token: input.token,
        body: {
          ...(input.txHash ? { txHash: input.txHash } : {}),
          ...(input.userOpHash ? { userOpHash: input.userOpHash } : {}),
          syncInboxId: input.syncInboxId,
          chainId: input.chainId,
          token: input.tokenSymbol,
          amount: input.amount,
        },
      },
    );
  }

  listConversations(token: string) {
    return fetchJson<{ conversations: XmtpChatSummary[] }>(
      this.baseUrl,
      "/conversations",
      { token },
    );
  }

  listMessages(token: string, conversationId: string, cursor?: string | null) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return fetchJson<{ messages: XmtpMessage[]; nextCursor: string | null }>(
      this.baseUrl,
      `/conversations/${encodeURIComponent(conversationId)}/messages${query}`,
      { token },
    );
  }

  sendMessage(input: {
    token: string;
    conversationId?: string;
    recipientInboxId?: string;
    text: string;
  }) {
    return fetchJson<{ message: XmtpMessage }>(this.baseUrl, "/messages/send", {
      method: "POST",
      token: input.token,
      body: {
        conversationId: input.conversationId,
        recipientInboxId: input.recipientInboxId,
        text: input.text,
      },
    });
  }

  async uploadMedia(token: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/media/upload`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: formData,
      });
    } catch (cause) {
      throw backendNetworkError(this.baseUrl, cause);
    }

    const payload = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      throw new Error(
        typeof payload.error === "string"
          ? payload.error
          : `Upload failed with ${response.status}`,
      );
    }

    return payload as {
      id: string;
      url: string;
      mimeType: string;
      contentLength: number;
      contentDigest: string;
    };
  }

  sendVideoMessage(input: {
    token: string;
    conversationId: string;
    mediaId: string;
    thumbnailMediaId?: string | null;
  }) {
    return fetchJson<{ message: XmtpMessage }>(
      this.baseUrl,
      "/messages/send-attachment",
      {
        method: "POST",
        token: input.token,
        body: {
          conversationId: input.conversationId,
          mediaId: input.mediaId,
          ...(input.thumbnailMediaId
            ? { thumbnailMediaId: input.thumbnailMediaId }
            : {}),
        },
      },
    );
  }

  listThreads(token: string, conversationId: string) {
    return fetchJson<{ threads: ThreadSummary[] }>(
      this.baseUrl,
      `/conversations/${encodeURIComponent(conversationId)}/threads`,
      { token },
    );
  }

  listThreadMessages(token: string, conversationId: string, threadId: string) {
    return fetchJson<{ messages: XmtpMessage[] }>(
      this.baseUrl,
      `/conversations/${encodeURIComponent(conversationId)}/threads/${encodeURIComponent(threadId)}/messages`,
      { token },
    );
  }

  createThread(input: {
    token: string;
    conversationId: string;
    title: string;
    firstMessage?: string;
  }) {
    return fetchJson<{
      thread: ThreadSummary;
      rootMessage: XmtpMessage;
      firstMessage: XmtpMessage | null;
    }>(
      this.baseUrl,
      `/conversations/${encodeURIComponent(input.conversationId)}/threads`,
      {
        method: "POST",
        token: input.token,
        body: {
          title: input.title,
          ...(input.firstMessage ? { firstMessage: input.firstMessage } : {}),
        },
      },
    );
  }

  sendThreadMessage(input: {
    token: string;
    conversationId: string;
    threadId: string;
    text: string;
  }) {
    return fetchJson<{ message: XmtpMessage }>(
      this.baseUrl,
      `/conversations/${encodeURIComponent(input.conversationId)}/threads/${encodeURIComponent(input.threadId)}/messages`,
      {
        method: "POST",
        token: input.token,
        body: { text: input.text },
      },
    );
  }

  sendThreadVideo(input: {
    token: string;
    conversationId: string;
    threadId: string;
    mediaId: string;
    thumbnailMediaId?: string | null;
  }) {
    return fetchJson<{ message: XmtpMessage }>(
      this.baseUrl,
      `/conversations/${encodeURIComponent(input.conversationId)}/threads/${encodeURIComponent(input.threadId)}/attachments`,
      {
        method: "POST",
        token: input.token,
        body: {
          mediaId: input.mediaId,
          ...(input.thumbnailMediaId
            ? { thumbnailMediaId: input.thumbnailMediaId }
            : {}),
        },
      },
    );
  }

  listLatestThreads(token: string, limit?: number) {
    const query = limit ? `?limit=${limit}` : "";
    return fetchJson<{ threads: ThreadSummary[] }>(
      this.baseUrl,
      `/threads/latest${query}`,
      { token },
    );
  }

  markRead(input: {
    token: string;
    conversationId: string;
    lastReadMessageId: string | null;
  }) {
    return fetchJson<{ ok: boolean }>(
      this.baseUrl,
      `/conversations/${encodeURIComponent(input.conversationId)}/read`,
      {
        method: "POST",
        token: input.token,
        body: {
          lastReadMessageId: input.lastReadMessageId,
        },
      },
    );
  }
}

const STORAGE_KEY = "kharisma:backend-session";

export function saveBackendSession(token: string, session: BackendSession) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token,
      session,
    }),
  );
}

export function loadBackendSession() {
  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as {
      token: string;
      session: BackendSession;
    };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearBackendSession() {
  window.localStorage.removeItem(STORAGE_KEY);
}
