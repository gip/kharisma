import { randomUUID } from "node:crypto";
import {
  JoinApprovalRequestCodec,
  JoinApprovalResolvedCodec,
  JoinResponseCodec,
  MemberJoinedCodec,
  isValidMemberName,
  memberNamesCollide,
  protocolError,
  type ProtocolError,
} from "@kharisma/protocol";
import type { Dm } from "@xmtp/node-sdk";
import type { AppLogger } from "../logging.js";
import type { MemberRecord, PendingJoinRecord } from "../storage/schema.js";
import type { GroupStore } from "../storage/store.js";
import { VerificationService } from "../verification/service.js";
import type { KharismaClient } from "../xmtp/client.js";
import type { GroupManager, ManagedGroup } from "./manager.js";

export type JoinOutcome =
  | { ok: true; member: MemberRecord }
  | { ok: true; pending: PendingJoinRecord }
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
  store: GroupStore;
  syncDmId: string;
  verification: VerificationService;
  logger: AppLogger;
}): Promise<JoinOutcome> {
  const {
    request,
    senderInboxId,
    managed,
    manager,
    store,
    syncDmId,
    verification,
    logger,
  } = input;
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

  const existingPending = store.getOpenPendingJoinByApplicant(
    record.groupId,
    senderInboxId,
  );
  if (existingPending) {
    return { ok: true, pending: existingPending };
  }

  const pendingJoins = store.listPendingJoins(record.groupId);

  if (Object.keys(record.members).length + pendingJoins.length >= record.maxMembers) {
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

  const reservedMembers = [
    ...Object.values(record.members),
    ...pendingJoins.map((pending) => pending.applicant),
  ];

  for (const existing of reservedMembers) {
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

  if (record.joinApproval === "ONE_MEMBER") {
    const pending: PendingJoinRecord = {
      pendingJoinId: randomUUID(),
      groupId: record.groupId,
      syncDmId,
      applicant: member,
      status: "pending",
      requestedAt: member.joinedAt,
      resolvedAt: null,
      approvedByInboxId: null,
    };
    store.putPendingJoin(pending);
    await announceJoinApprovalRequest(
      managed.client,
      record.xmtpGroupId,
      pending,
    );
    logger.info(
      {
        groupId: record.groupId,
        pendingJoinId: pending.pendingJoinId,
        memberInboxId: senderInboxId,
        memberName: member.name,
      },
      "Member join is pending approval",
    );
    return { ok: true, pending };
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

export type JoinApprovalOutcome =
  | { ok: true; status: "approved"; pending: PendingJoinRecord }
  | { ok: true; status: "ignored"; reason: string }
  | { ok: false; error: ProtocolError };

export async function handleJoinApprovalVote(input: {
  request: {
    groupId: string;
    pendingJoinId: string;
    vote: "approve";
  };
  senderInboxId: string;
  managed: ManagedGroup;
  manager: GroupManager;
  store: GroupStore;
  logger: AppLogger;
}): Promise<JoinApprovalOutcome> {
  const { request, senderInboxId, managed, manager, store, logger } = input;
  const { record } = managed;

  if (request.groupId !== record.groupId) {
    return {
      ok: false,
      error: protocolError(
        "group-not-found",
        `group inbox does not own group ${request.groupId}`,
      ),
    };
  }

  const voter = record.members[senderInboxId];
  if (!voter) return { ok: true, status: "ignored", reason: "non-member" };

  const pending = store.getPendingJoin(request.pendingJoinId);
  if (!pending || pending.groupId !== record.groupId) {
    return { ok: true, status: "ignored", reason: "unknown-pending-join" };
  }
  if (pending.status !== "pending") {
    return { ok: true, status: "ignored", reason: "already-resolved" };
  }
  if (pending.applicant.inboxId === senderInboxId) {
    return { ok: true, status: "ignored", reason: "self-vote" };
  }
  if (record.members[pending.applicant.inboxId]) {
    return { ok: true, status: "ignored", reason: "already-member" };
  }
  if (Object.keys(record.members).length >= record.maxMembers) {
    return {
      ok: false,
      error: protocolError("group-full", "this group is already full"),
    };
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
  ).addMembers([pending.applicant.inboxId]);

  manager.updateRecord(record.groupId, (current) => ({
    ...current,
    members: {
      ...current.members,
      [pending.applicant.inboxId]: pending.applicant,
    },
  }));

  const approvedAt = new Date().toISOString();
  const approved = store.approvePendingJoin({
    pendingJoinId: pending.pendingJoinId,
    approvedByInboxId: senderInboxId,
    approvedAt,
  }) ?? {
    ...pending,
    status: "approved" as const,
    resolvedAt: approvedAt,
    approvedByInboxId: senderInboxId,
  };

  const syncDm = await managed.client.conversations.getConversationById(
    pending.syncDmId,
  );
  if (syncDm) {
    await sendJoinOk(
      syncDm as Dm<unknown>,
      record.groupId,
      pending.applicant.name,
      record.xmtpGroupId,
    );
  } else {
    logger.warn(
      {
        groupId: record.groupId,
        pendingJoinId: pending.pendingJoinId,
        syncDmId: pending.syncDmId,
      },
      "Approved pending join but applicant sync DM was not found",
    );
  }

  await announceJoinApprovalResolved(
    managed.client,
    record.xmtpGroupId,
    approved,
  );
  await announceMemberJoined(
    managed.client,
    record.xmtpGroupId,
    pending.applicant,
  );

  logger.info(
    {
      groupId: record.groupId,
      pendingJoinId: pending.pendingJoinId,
      approvedByInboxId: senderInboxId,
      memberInboxId: pending.applicant.inboxId,
      memberName: pending.applicant.name,
    },
    "Pending member join approved",
  );

  return { ok: true, status: "approved", pending: approved };
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

export async function sendJoinPending(
  dm: Dm<unknown>,
  groupId: string,
  pendingJoinId: string,
): Promise<void> {
  const encoded = JoinResponseCodec.encode({
    status: "pending",
    groupId,
    pendingJoinId,
  });
  await dm.send(encoded);
}

export async function announceJoinApprovalRequest(
  client: KharismaClient,
  xmtpGroupId: string,
  pending: PendingJoinRecord,
): Promise<void> {
  const mlsGroup = await client.conversations.getConversationById(xmtpGroupId);
  if (!mlsGroup) {
    throw new Error(
      `Cannot announce join approval request: group ${xmtpGroupId} is missing`,
    );
  }
  const encoded = JoinApprovalRequestCodec.encode({
    pendingJoinId: pending.pendingJoinId,
    groupId: pending.groupId,
    applicantInboxId: pending.applicant.inboxId,
    name: pending.applicant.name,
    role: pending.applicant.role,
    requestedAt: pending.requestedAt,
  });
  await mlsGroup.send(encoded);
}

export async function announceJoinApprovalResolved(
  client: KharismaClient,
  xmtpGroupId: string,
  pending: PendingJoinRecord,
): Promise<void> {
  const mlsGroup = await client.conversations.getConversationById(xmtpGroupId);
  if (!mlsGroup) {
    throw new Error(
      `Cannot announce join approval resolution: group ${xmtpGroupId} is missing`,
    );
  }
  const encoded = JoinApprovalResolvedCodec.encode({
    pendingJoinId: pending.pendingJoinId,
    groupId: pending.groupId,
    status: "approved",
    approvedByInboxId: pending.approvedByInboxId ?? "",
    approvedAt: pending.resolvedAt ?? new Date().toISOString(),
  });
  await mlsGroup.send(encoded);
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
