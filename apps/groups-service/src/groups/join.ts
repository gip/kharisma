import {
  JoinResponseCodec,
  MemberJoinedCodec,
  isValidMemberName,
  memberNamesCollide,
  protocolError,
  type ProtocolError,
} from "@kharisma/protocol";
import type { Dm } from "@xmtp/node-sdk";
import type { AppLogger } from "../logging.js";
import type { MemberRecord } from "../storage/schema.js";
import { VerificationService } from "../verification/service.js";
import type { KharismaClient } from "../xmtp/client.js";
import type { GroupManager, ManagedGroup } from "./manager.js";

export type JoinOutcome =
  | { ok: true; member: MemberRecord }
  | { ok: false; error: ProtocolError };

export async function handleJoinRequest(input: {
  request: {
    groupId: string;
    walletAddress: string;
    name?: string;
  };
  senderInboxId: string;
  managed: ManagedGroup;
  manager: GroupManager;
  verification: VerificationService;
  logger: AppLogger;
}): Promise<JoinOutcome> {
  const { request, senderInboxId, managed, manager, verification, logger } = input;
  const { record } = managed;

  if (request.groupId !== record.groupId) {
    return {
      ok: false,
      error: protocolError(
        "group-not-found",
        `sync inbox does not own group ${request.groupId}`,
      ),
    };
  }

  if (record.members[senderInboxId]) {
    return {
      ok: false,
      error: protocolError(
        "already-member",
        "sender is already a member of this group",
      ),
    };
  }

  if (Object.keys(record.members).length >= record.maxMembers) {
    return {
      ok: false,
      error: protocolError("group-full", "this group is already full"),
    };
  }

  const status = verification.resolveSenderStatus(
    request.walletAddress,
    senderInboxId,
  );

  if (record.joinPolicy === "H_ONLY" && status.status !== "H") {
    return {
      ok: false,
      error: protocolError(
        status.status === "UNKNOWN" ? "verification-required" : "unauthorized-role",
        "only verified humans may join this group",
      ),
    };
  }

  if (
    record.joinPolicy === "H_AND_HA" &&
    status.status !== "H" &&
    status.status !== "HA"
  ) {
    return {
      ok: false,
      error: protocolError(
        status.status === "UNKNOWN" ? "verification-required" : "unauthorized-role",
        "only verified humans and human agents may join this group",
      ),
    };
  }

  let memberName: string;
  if (status.status === "H" || status.status === "HA") {
    memberName = status.handle ?? "";
    if (!memberName) {
      return {
        ok: false,
        error: protocolError(
          "not-registered",
          "registered actor is missing a canonical handle",
        ),
      };
    }
    if (request.name?.trim()) {
      return {
        ok: false,
        error: protocolError(
          "malformed",
          "name is only allowed for unverified A joins",
        ),
      };
    }
  } else {
    if (record.joinPolicy !== "H_HA_AND_A") {
      return {
        ok: false,
        error: protocolError(
          "verification-required",
          "this group does not allow unverified joins",
        ),
      };
    }
    memberName = request.name?.trim() ?? "";
    if (!isValidMemberName(memberName)) {
      return {
        ok: false,
        error: protocolError(
          "name-invalid",
          "name must match ^[A-Za-z0-9_-]{3,10}$",
        ),
      };
    }
  }

  for (const existing of Object.values(record.members)) {
    if (memberNamesCollide(existing.name, memberName)) {
      return {
        ok: false,
        error: protocolError(
          "name-taken",
          `name "${memberName}" is already in use in this group`,
        ),
      };
    }
    if (status.status === "H" && status.humanId && existing.humanId === status.humanId) {
      return {
        ok: false,
        error: protocolError(
          "already-member",
          "this human has already joined the group",
        ),
      };
    }
    if (
      status.status === "HA" &&
      status.agentId &&
      existing.agentId === status.agentId
    ) {
      return {
        ok: false,
        error: protocolError(
          "already-member",
          "this human agent has already joined the group",
        ),
      };
    }
  }

  const mlsGroup = await managed.client.conversations.getConversationById(
    record.xmtpGroupId,
  );
  if (!mlsGroup) {
    logger.error(
      { groupId: record.groupId, xmtpGroupId: record.xmtpGroupId },
      "MLS group not found on per-group client",
    );
    return {
      ok: false,
      error: protocolError("internal", "group conversation is missing"),
    };
  }

  await (
    mlsGroup as unknown as { addMembers(inboxIds: string[]): Promise<void> }
  ).addMembers([senderInboxId]);

  const member: MemberRecord = {
    inboxId: senderInboxId,
    walletAddress: status.walletAddress,
    name: memberName,
    role:
      status.status === "H" || status.status === "HA" || status.status === "A"
        ? status.status
        : "A",
    verificationLevel: status.verificationLevel,
    humanId: status.humanId ?? undefined,
    agentId: status.agentId ?? undefined,
    joinedAt: new Date().toISOString(),
  };

  manager.updateRecord(record.groupId, (current) => ({
    ...current,
    members: { ...current.members, [senderInboxId]: member },
  }));

  logger.info(
    {
      groupId: record.groupId,
      memberInboxId: senderInboxId,
      memberName: member.name,
      memberRole: member.role,
    },
    "Member joined group",
  );

  return { ok: true, member };
}

export async function sendJoinOk(
  dm: Dm<unknown>,
  groupId: string,
  name: string,
  conversationId: string,
): Promise<void> {
  const encoded = JoinResponseCodec.encode({
    status: "ok",
    groupId,
    name,
    conversationId,
  });
  await dm.send(encoded);
}

export async function sendJoinError(
  dm: Dm<unknown>,
  groupId: string,
  error: ProtocolError,
): Promise<void> {
  const encoded = JoinResponseCodec.encode({
    status: "error",
    groupId,
    error,
  });
  await dm.send(encoded);
}

export async function announceMemberJoined(
  client: KharismaClient,
  xmtpGroupId: string,
  member: MemberRecord,
): Promise<void> {
  const mlsGroup = await client.conversations.getConversationById(xmtpGroupId);
  if (!mlsGroup) {
    throw new Error(
      `Cannot announce member join: group ${xmtpGroupId} is missing`,
    );
  }
  const encoded = MemberJoinedCodec.encode({
    name: member.name,
    inboxId: member.inboxId,
    joinedAt: member.joinedAt,
  });
  await mlsGroup.send(encoded);
}
