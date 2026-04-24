import type { XmtpChatSummary } from "./types";

type NsLike = bigint | number | string | null | undefined;

type MessageLike = {
  createdAtNs?: NsLike;
  sentAtNs?: NsLike;
  sentAt?: Date | string | null;
} | null;

type ConversationLike = {
  id: string;
  createdAtNs?: NsLike;
  createdAt?: Date | string | null;
  lastActivityNs?: NsLike;
  lastMessage?: (() => Promise<MessageLike | undefined>) | MessageLike;
};

type DmLike = ConversationLike & {
  peerInboxId?: () => Promise<string>;
};

type GroupLike = ConversationLike & {
  name?: string | null;
  members?: () => Promise<Array<unknown>>;
};

function normalizeNs(value: NsLike): bigint | null {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }

  if (typeof value === "string" && value.trim()) {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }

  return null;
}

function nsToDate(value: NsLike): Date | null {
  const normalized = normalizeNs(value);

  if (!normalized) {
    return null;
  }

  return new Date(Number(normalized / 1_000_000n));
}

function valueToDate(value: Date | string | null | undefined): Date | null {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function resolveCreatedAt(conversation: ConversationLike): Date | null {
  return nsToDate(conversation.createdAtNs) ?? valueToDate(conversation.createdAt);
}

async function resolveLastActivityAt(
  conversation: ConversationLike,
): Promise<Date | null> {
  const lastMessage =
    typeof conversation.lastMessage === "function"
      ? await conversation.lastMessage()
      : conversation.lastMessage;

  return (
    nsToDate(lastMessage?.sentAtNs) ??
    nsToDate(lastMessage?.createdAtNs) ??
    valueToDate(lastMessage?.sentAt) ??
    nsToDate(conversation.lastActivityNs) ??
    resolveCreatedAt(conversation)
  );
}

async function resolveMemberCount(group: GroupLike): Promise<number | null> {
  if (typeof group.members === "function") {
    return (await group.members()).length;
  }

  return null;
}

export async function summarizeDms(dms: DmLike[]): Promise<XmtpChatSummary[]> {
  return Promise.all(
    dms.map(async (dm) => {
      const peerInboxId =
        typeof dm.peerInboxId === "function" ? await dm.peerInboxId() : null;

      return {
        id: dm.id,
        kind: "dm",
        title: peerInboxId ? `DM with ${peerInboxId}` : "Direct message",
        peerInboxId,
        memberCount: null,
        lastActivityAt: await resolveLastActivityAt(dm),
        createdAt: resolveCreatedAt(dm),
      } satisfies XmtpChatSummary;
    }),
  );
}

export async function summarizeGroups(
  groups: GroupLike[],
): Promise<XmtpChatSummary[]> {
  return Promise.all(
    groups.map(async (group) => ({
      id: group.id,
      kind: "group",
      title:
        typeof group.name === "string" && group.name.trim()
          ? group.name
          : "Untitled group",
      peerInboxId: null,
      memberCount: await resolveMemberCount(group),
      lastActivityAt: await resolveLastActivityAt(group),
      createdAt: resolveCreatedAt(group),
    })),
  );
}

export async function summarizeConversations(input: {
  dms: DmLike[];
  groups: GroupLike[];
}): Promise<XmtpChatSummary[]> {
  const [dmSummaries, groupSummaries] = await Promise.all([
    summarizeDms(input.dms),
    summarizeGroups(input.groups),
  ]);

  return [...dmSummaries, ...groupSummaries].sort((left, right) => {
    const leftValue =
      left.lastActivityAt?.getTime() ?? left.createdAt?.getTime() ?? 0;
    const rightValue =
      right.lastActivityAt?.getTime() ?? right.createdAt?.getTime() ?? 0;

    return rightValue - leftValue;
  });
}
