import {
  ContentTypeHello,
  CreateGroupResponseCodec,
  ErrorCodec,
  ListGroupsResponseCodec,
  SkillResponseCodec,
  VerificationAckCodec,
  WalletStatusResponseCodec,
  contentTypeEquals,
  contentTypeToKey,
  hasGroupLanguageOverlap,
  initialMainState,
  isGroupJoinApproval,
  isGroupJoinPolicy,
  normalizeGroupLanguages,
  protocolError,
  reduceMain,
  type CreateGroupRequestPayload,
  type GroupLanguageCode,
  type GroupSummary,
  type GroupSenderSummary,
  type HelloPayload,
  type HumanAgentSubmitPayload,
  type HumanSubmitPayload,
  type IdentitySubmitPayload,
  type MainChannelState,
  type ProtocolError,
  type WalletStatusRequestPayload,
} from "@kharisma/protocol";
import { GroupMessageKind, IdentifierKind } from "@xmtp/node-sdk";
import type { DecodedMessage, Dm } from "@xmtp/node-sdk";
import type { GroupManager, ManagedGroup } from "../groups/manager.js";
import type { AppLogger } from "../logging.js";
import type { MemberRecord } from "../storage/schema.js";
import { VerificationService } from "../verification/service.js";
import type { KharismaClient } from "../xmtp/client.js";
import { buildDiscoverySkill } from "../protocol/skill.js";

type MainChannelAuthContext = {
  role: HelloPayload["role"];
  senderInboxId: string;
  walletAddress: string;
  humanId: string | null;
  agentId: string | null;
  handle: string | null;
  verificationLevel: "human" | "human-agent";
};

export class MainChannel {
  private readonly states = new Map<string, MainChannelState>();
  private readonly authContexts = new Map<string, MainChannelAuthContext>();

  constructor(
    private readonly client: KharismaClient,
    private readonly manager: GroupManager,
    private readonly verification: VerificationService,
    private readonly logger: AppLogger,
  ) {}

  async handleMessage(message: DecodedMessage): Promise<void> {
    if (message.senderInboxId === this.client.inboxId) return;
    if (message.kind !== GroupMessageKind.Application) return;

    const conversation = await this.client.conversations.getConversationById(
      message.conversationId,
    );
    if (!conversation) {
      this.logger.warn(
        { conversationId: message.conversationId },
        "Main client received message for unknown conversation",
      );
      return;
    }

    const dm = conversation as Dm<unknown>;
    const state = this.states.get(dm.id) ?? initialMainState;
    const helloRole =
      contentTypeEquals(message.contentType, ContentTypeHello) &&
      isHelloPayload(message.content)
        ? message.content.role
        : undefined;
    const transition = reduceMain(state, message.contentType, helloRole);

    if (!transition.ok) {
      await this.sendError(dm, transition.error);
      return;
    }

    try {
      switch (transition.command.kind) {
        case "skill": {
          await dm.send(
            SkillResponseCodec.encode(
              buildDiscoverySkill({
                serviceInboxId: this.client.inboxId,
              }),
            ),
          );
          this.states.set(dm.id, transition.nextState);
          return;
        }

        case "wallet-status": {
          const payload = message.content as WalletStatusRequestPayload | undefined;
          if (!payload || typeof payload.walletAddress !== "string") {
            await this.sendError(
              dm,
              protocolError(
                "malformed",
                "wallet-status-request/1 missing walletAddress",
              ),
            );
            return;
          }
          await dm.send(
            WalletStatusResponseCodec.encode(
              this.verification.getWalletStatus(payload.walletAddress),
            ),
          );
          this.states.set(dm.id, transition.nextState);
          return;
        }

        case "submit-identity": {
          const payload = message.content as IdentitySubmitPayload | undefined;
          if (!payload || typeof payload.walletAddress !== "string") {
            await this.sendError(
              dm,
              protocolError("malformed", "identity-submit/1 missing walletAddress"),
            );
            return;
          }
          const ack = await this.verification.submitIdentity({
            ...payload,
            senderInboxId: message.senderInboxId,
          });
          await dm.send(VerificationAckCodec.encode(ack));
          this.states.set(dm.id, transition.nextState);
          return;
        }

        case "submit-human": {
          const payload = message.content as HumanSubmitPayload | undefined;
          if (
            !payload ||
            typeof payload.walletAddress !== "string" ||
            typeof payload.handle !== "string" ||
            !payload.handle.trim()
          ) {
            await this.sendError(
              dm,
              protocolError(
                "malformed",
                "human-submit/1 missing walletAddress or handle",
              ),
            );
            return;
          }
          const ack = await this.verification.submitHuman({
            ...payload,
            handle: payload.handle.trim(),
            senderInboxId: message.senderInboxId,
          });
          await dm.send(VerificationAckCodec.encode(ack));
          this.states.set(dm.id, transition.nextState);
          return;
        }

        case "submit-human-agent": {
          const payload = message.content as HumanAgentSubmitPayload | undefined;
          if (
            !payload ||
            typeof payload.walletAddress !== "string" ||
            typeof payload.ownerHumanId !== "string" ||
            typeof payload.handle !== "string" ||
            !payload.handle.trim()
          ) {
            await this.sendError(
              dm,
              protocolError(
                "malformed",
                "human-agent-submit/1 missing walletAddress, ownerHumanId, or handle",
              ),
            );
            return;
          }
          const ack = await this.verification.submitHumanAgent({
            ...payload,
            handle: payload.handle.trim(),
            senderInboxId: message.senderInboxId,
          });
          await dm.send(VerificationAckCodec.encode(ack));
          this.states.set(dm.id, transition.nextState);
          return;
        }

        case "authenticate": {
          const hello = message.content as HelloPayload | undefined;
          if (
            !hello ||
            typeof hello.walletAddress !== "string" ||
            !hello.walletAddress
          ) {
            await this.sendError(
              dm,
              protocolError("malformed", "hello/1 missing walletAddress"),
            );
            return;
          }
          const auth = this.verification.authenticateHello(
            hello.walletAddress,
            message.senderInboxId,
            hello.role,
          );
          if (!auth.ok) {
            await this.sendError(dm, protocolError("not-registered", auth.reason));
            return;
          }
          this.states.set(dm.id, transition.nextState);
          this.authContexts.set(dm.id, {
            role: hello.role,
            senderInboxId: message.senderInboxId,
            walletAddress: auth.status.walletAddress,
            humanId: auth.status.humanId,
            agentId: auth.status.agentId,
            handle: auth.status.handle,
            verificationLevel:
              auth.status.verificationLevel === "human-agent"
                ? "human-agent"
                : "human",
          });
          this.logger.info(
            {
              senderInboxId: message.senderInboxId,
              walletAddress: auth.status.walletAddress,
              role: hello.role,
            },
            "Main channel: authenticated",
          );
          return;
        }

        case "list-groups": {
          const languageFilter = this.parseListGroupLanguages(message.content);
          if (!languageFilter) {
            await this.sendError(
              dm,
              protocolError(
                "malformed",
                "list-groups-request/1 languages must be ISO 639-1 codes",
              ),
            );
            return;
          }
          const summaries: GroupSummary[] = this.manager
            .all()
            .filter((managed) => managed.record.status === "active")
            .filter((managed) =>
              hasGroupLanguageOverlap(managed.record.languages, languageFilter),
            )
            .map((managed) => this.summarizeGroup(managed, message.senderInboxId));
          await dm.send(ListGroupsResponseCodec.encode({ groups: summaries }));
          this.states.set(dm.id, transition.nextState);
          return;
        }

        case "create-group": {
          const context = this.authContexts.get(dm.id);
          if (!context) {
            await this.sendError(
              dm,
              protocolError("internal", "authenticated context is missing"),
            );
            return;
          }
          const payload = message.content as CreateGroupRequestPayload | undefined;
          if (!payload || typeof payload.title !== "string" || !payload.title.trim()) {
            await this.sendError(
              dm,
              protocolError("malformed", "create-group-request/1 missing title"),
            );
            return;
          }
          if (
            typeof payload.description !== "string" ||
            payload.description.trim().length < 20
          ) {
            await this.sendError(
              dm,
              protocolError(
                "malformed",
                "create-group-request/1 description must be at least 20 characters",
              ),
            );
            return;
          }
          if (typeof payload.mediaUrl !== "string" || !payload.mediaUrl) {
            await this.sendError(
              dm,
              protocolError("malformed", "create-group-request/1 missing mediaUrl"),
            );
            return;
          }
          if (typeof payload.thumbnailUrl !== "string" || !payload.thumbnailUrl) {
            await this.sendError(
              dm,
              protocolError(
                "malformed",
                "create-group-request/1 missing thumbnailUrl",
              ),
            );
            return;
          }
          const languages = normalizeGroupLanguages(payload.languages);
          if (!languages || languages.length === 0) {
            await this.sendError(
              dm,
              protocolError(
                "malformed",
                "create-group-request/1 languages must include at least one ISO 639-1 code",
              ),
            );
            return;
          }
          if (!isGroupJoinPolicy(payload.joinPolicy)) {
            await this.sendError(
              dm,
              protocolError(
                "malformed",
                "create-group-request/1 joinPolicy is invalid",
              ),
            );
            return;
          }
          const joinApproval = payload.joinApproval ?? "NONE";
          if (!isGroupJoinApproval(joinApproval)) {
            await this.sendError(
              dm,
              protocolError(
                "malformed",
                "create-group-request/1 joinApproval is invalid",
              ),
            );
            return;
          }
          if (
            !Number.isInteger(payload.maxMembers) ||
            payload.maxMembers < 2 ||
            payload.maxMembers > 200
          ) {
            await this.sendError(
              dm,
              protocolError(
                "malformed",
                "create-group-request/1 maxMembers must be an integer between 2 and 200",
              ),
            );
            return;
          }

          const creator: MemberRecord = {
            inboxId: context.senderInboxId,
            walletAddress: context.walletAddress,
            name: context.handle ?? "creator",
            role: context.role,
            verificationLevel: context.verificationLevel,
            humanId: context.humanId ?? undefined,
            agentId: context.agentId ?? undefined,
            joinedAt: new Date().toISOString(),
          };
          const managed = await this.manager.createGroup({
            title: payload.title.trim(),
            description: payload.description.trim(),
            mediaUrl: payload.mediaUrl,
            thumbnailUrl: payload.thumbnailUrl,
            languages,
            joinPolicy: payload.joinPolicy,
            joinApproval,
            maxMembers: payload.maxMembers,
            creator,
          });
          await dm.send(
            CreateGroupResponseCodec.encode({
              status: "ok",
              groupId: managed.record.groupId,
              syncInboxId: managed.record.syncInboxId,
              conversationId: managed.record.xmtpGroupId,
            }),
          );
          this.states.set(dm.id, transition.nextState);
          return;
        }
      }
    } catch (error) {
      this.logger.error(
        {
          err: error,
          contentType: contentTypeToKey(message.contentType),
          senderInboxId: message.senderInboxId,
        },
        "Main channel handler threw",
      );
      await this.sendError(dm, protocolError("internal", "unexpected server error"));
    }
  }

  private async sendError(dm: Dm<unknown>, error: ProtocolError): Promise<void> {
    try {
      await dm.send(ErrorCodec.encode(error));
    } catch (err) {
      this.logger.error({ err, code: error.code }, "Failed to send error on main DM");
    }
  }

  private summarizeGroup(
    managed: ManagedGroup,
    requesterInboxId: string,
  ): GroupSummary {
    const isMember = Boolean(managed.record.members[requesterInboxId]);
    const memberCount = Object.keys(managed.record.members).length;

    return {
      groupId: managed.record.groupId,
      title: managed.record.title,
      description: managed.record.description,
      mediaUrl: managed.record.mediaUrl,
      thumbnailUrl: managed.record.thumbnailUrl || null,
      languages: managed.record.languages,
      syncInboxId: managed.record.syncInboxId,
      memberCount,
      maxMembers: managed.record.maxMembers,
      availableSeats: Math.max(0, managed.record.maxMembers - memberCount),
      joinPolicy: managed.record.joinPolicy,
      joinApproval: managed.record.joinApproval,
      isMember,
      conversationId: isMember ? managed.record.xmtpGroupId : null,
      senders: isMember
        ? [
            ...Object.values(managed.record.members).map(
              (member): GroupSenderSummary => ({
                inboxId: member.inboxId,
                name: member.name,
                role: member.role,
                walletAddress: member.walletAddress,
                humanId: member.humanId ?? null,
                agentId: member.agentId ?? null,
                verificationLevel: member.verificationLevel,
              }),
            ),
            {
              inboxId: managed.client.inboxId,
              name: "Kharisma",
              role: "A",
              walletAddress: walletAddressFromIdentifier(
                managed.client.accountIdentifier,
              ),
              humanId: null,
              agentId: null,
              verificationLevel: "none",
            },
          ]
        : [],
    };
  }

  private parseListGroupLanguages(content: unknown): GroupLanguageCode[] | null {
    if (!content || typeof content !== "object" || !("languages" in content)) {
      return [];
    }

    const languages = (content as { languages?: unknown }).languages;
    if (languages === undefined) {
      return [];
    }

    return normalizeGroupLanguages(languages);
  }
}

function isHelloPayload(value: unknown): value is HelloPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "role" in value &&
    "walletAddress" in value
  );
}

function walletAddressFromIdentifier(
  identifier: { identifier?: string; identifierKind?: unknown } | undefined,
) {
  if (!identifier || typeof identifier.identifier !== "string") {
    return null;
  }

  const kind = identifier.identifierKind;
  if (
    kind !== IdentifierKind.Ethereum &&
    kind !== 0 &&
    String(kind) !== "Ethereum"
  ) {
    return null;
  }

  return identifier.identifier.toLowerCase();
}
