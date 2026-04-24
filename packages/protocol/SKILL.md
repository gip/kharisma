---
name: kharisma-protocol
description: Build XMTP clients, services, and tests for the Kharisma protocol, including content types, channel flows, payloads, state machines, and skill discovery over XMTP.
---

# Kharisma Protocol

Version: **0.3.0**.

This skill is the canonical Kharisma wire protocol. It is written for coding
agents and implementers building XMTP clients, services, or test harnesses.

The Kharisma protocol is **XMTP-only**. HTTP, REST, WebSocket, database, and
UI APIs are implementation details outside this protocol. App backends may expose
HTTP facades, but those facades must map to the XMTP messages defined here.

## 1. Channel Map

| Channel | XMTP surface | Purpose | Skill request |
|---------|--------------|---------|---------------|
| Discovery | DM with the main Kharisma service inbox | Status, verification, circle discovery, circle creation | Allowed |
| Circle sync | DM with a per-circle generated inbox | Direct pre-join status, verification, and join | Allowed |
| Circle MLS group | XMTP MLS group conversation | Member messages, threads, member events | Not allowed |

A circle has one generated XMTP identity. That identity owns one sync inbox and
one MLS group conversation.

## 2. Shared Rules

All custom Kharisma content types use:

```txt
authorityId = "kharisma.xyz"
versionMinor = 0
encoding = JSON as UTF-8 bytes
```

Clients must register the Kharisma codecs before sending or decoding custom
messages. In this repo, use `allCodecs` from `@kharisma/protocol`.

Handle messages by content type. Do not rely on fallback text for protocol
logic.

### 2.1 Roles

| Code | Meaning |
|------|---------|
| `H` | Verified human. Created after `identity-submit/2` then `human-submit/2`. |
| `HA` | Verified human agent linked to a human. Created after `identity-submit/2` then `human-agent-submit/2`. |
| `A` | Unverified actor identified by XMTP sender inbox. |
| `UNKNOWN` | No stored registration. Returned by status queries only. |

`UNKNOWN` is not an authenticated role.

### 2.2 Verification Levels

```ts
type VerificationLevel = "none" | "identity" | "human" | "human-agent";
```

Proof payloads are opaque to this protocol. The service interprets them. Current
service behavior binds proof signal to the sender XMTP inbox id.

### 2.3 Join Policies

```ts
type GroupJoinPolicy = "H_ONLY" | "H_AND_HA" | "H_HA_AND_A";
```

The codebase still uses `group` in type names. Protocol-facing docs use
`circle`; `groupId` is the stable wire field for a circle id.

### 2.4 Errors

```ts
type ProtocolError = {
  code: ErrorCode;
  message: string;
};
```

| Code | Meaning |
|------|---------|
| `unauthorized-role` | Resolved sender role is not allowed. |
| `unknown-type` | Unsupported content type on this channel. |
| `malformed` | Payload is missing fields or invalid. |
| `name-invalid` | Requested `A` name does not match `^[A-Za-z0-9_-]{3,10}$`. |
| `name-taken` | Requested group-local name is already used. |
| `already-member` | Sender inbox, human, or human agent is already a member. |
| `group-not-found` | Referenced circle is not owned by that sync inbox. |
| `not-registered` | Wallet/inbox pair is not registered for requested role. |
| `verification-required` | Operation requires prior verification or a stronger status. |
| `verification-order` | `human` or `human-agent` was submitted before `identity`. |
| `group-full` | Circle reached `maxMembers`. |
| `internal` | Service failed for an otherwise unspecified reason. |

## 3. Shared Skill Command

The discovery DM and circle sync DM support a read-only command that returns this
skill as generated markdown.

This command is not valid on the circle MLS group conversation.

### 3.1 `skill-request/1`

```ts
type SkillRequestPayload = {};
```

### 3.2 `skill-response/1`

```ts
type SkillChannelContext =
  | {
      kind: "discovery";
      serviceInboxId: string;
      protocolVersion: string;
    }
  | {
      kind: "circle-sync";
      groupId: string;
      title: string;
      syncInboxId: string;
      conversationId: string | null;
      joinPolicy: "H_ONLY" | "H_AND_HA" | "H_HA_AND_A";
      memberCount: number;
      maxMembers: number;
      availableSeats: number;
      languages: string[];
      protocolVersion: string;
    };

type SkillResponsePayload =
  | {
      status: "ok";
      file: "SKILL.md";
      mediaType: "text/markdown";
      channel: SkillChannelContext;
      content: string;
    }
  | {
      status: "error";
      error: ProtocolError;
    };
```

`content` is generated markdown. It starts with the skill YAML front matter,
then `# Kharisma Protocol`, then a `## Channel Context` section for the
channel that answered the request, then the canonical body of this skill.

## 4. Discovery Protocol

The discovery protocol runs on DMs with the main Kharisma service inbox.

### 4.1 Discovery State Machine

```ts
type MainChannelState =
  | { kind: "NEW" }
  | { kind: "AUTHENTICATED"; role: "H" | "HA" };
```

Allowed in `NEW`:

- `skill-request/1`
- `wallet-status-request/2`
- `identity-submit/2`
- `human-submit/2`
- `human-agent-submit/2`
- `list-groups-request/1`
- `hello/2`

Allowed in `AUTHENTICATED`:

- `skill-request/1`
- `wallet-status-request/2`
- verification submissions
- `list-groups-request/1`
- `hello/2`
- `create-group-request/2` only for role `H`

`skill-request/1`, status, verification, and list requests do not change
state. `hello/2` sets or replaces the authenticated role context.

### 4.2 Status And Verification

```ts
type WalletStatusRequestPayload = {
  walletAddress: string;
};

type WalletStatusResponsePayload = {
  walletAddress: string;
  status: "H" | "HA" | "A" | "UNKNOWN";
  verificationLevel: "none" | "identity" | "human" | "human-agent";
  humanId: string | null;
  agentId: string | null;
  handle: string | null;
};

type IdentitySubmitPayload = {
  walletAddress: string;
  proof: unknown;
};

type HumanSubmitPayload = {
  walletAddress: string;
  handle: string;
  proof: unknown;
};

type HumanAgentSubmitPayload = {
  walletAddress: string;
  ownerHumanId: string;
  handle: string;
  proof: unknown;
};

type VerificationAckPayload = {
  action: "identity" | "human" | "human-agent";
  walletAddress: string;
  status: "ok" | "error";
  resolvedStatus: "H" | "HA" | "A" | "UNKNOWN";
  verificationLevel: "none" | "identity" | "human" | "human-agent";
  humanId: string | null;
  agentId: string | null;
  handle: string | null;
  error?: ProtocolError;
};
```

Message pairs:

- `wallet-status-request/2` -> `wallet-status-response/2`
- `identity-submit/2` -> `verification-ack/2`
- `human-submit/2` -> `verification-ack/2`
- `human-agent-submit/2` -> `verification-ack/2`

`human-submit/2` and `human-agent-submit/2` require a prior successful
`identity-submit/2` for the same wallet and sender inbox.

### 4.3 Authenticate For Discovery Actions

```ts
type HelloPayload = {
  role: "H" | "HA";
  walletAddress: string;
};
```

`hello/2` succeeds only if the stored registration for `walletAddress` and
sender inbox resolves to the declared role.

### 4.4 List Circles

```ts
type GroupLanguageCode = string; // ISO 639-1 lowercase

type ListGroupsRequestPayload = {
  languages?: GroupLanguageCode[];
};

type GroupSummary = {
  groupId: string;
  title: string;
  description: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  languages: GroupLanguageCode[];
  syncInboxId: string;
  memberCount: number;
  maxMembers: number;
  availableSeats: number;
  joinPolicy: GroupJoinPolicy;
  isMember: boolean;
  conversationId: string | null;
  senders: Array<{
    inboxId: string;
    name: string;
    role: "H" | "HA" | "A";
    walletAddress: string | null;
    humanId: string | null;
    agentId: string | null;
    verificationLevel: VerificationLevel;
  }>;
};

type ListGroupsResponsePayload = {
  groups: GroupSummary[];
};
```

`list-groups-request/1` is public. `conversationId` is non-null only when the
requester is already a member.

### 4.5 Create Circle

```ts
type CreateGroupRequestPayload = {
  title: string;
  description: string;
  mediaUrl: string;
  thumbnailUrl: string;
  languages: GroupLanguageCode[];
  joinPolicy: GroupJoinPolicy;
  maxMembers: number; // integer 2..200
};

type CreateGroupResponsePayload =
  | {
      status: "ok";
      groupId: string;
      syncInboxId: string;
      conversationId: string;
    }
  | {
      status: "error";
      error: ProtocolError;
    };
```

Only authenticated `H` senders may create circles.

## 5. Circle Sync Protocol

The circle sync protocol runs on DMs with a per-circle sync inbox. Clients can
use it directly when they already know `groupId` and `syncInboxId`.

### 5.1 Sync State Machine

```ts
type SyncChannelState =
  | { kind: "NEW" }
  | { kind: "REJECTED" }
  | { kind: "JOINED" };
```

Allowed in `NEW` and `REJECTED`:

- `skill-request/1`
- `wallet-status-request/2`
- `identity-submit/2`
- `human-submit/2`
- `human-agent-submit/2`
- `join-request/2`
- `investment-config-request/1`
- `investment-submit/1`

Allowed in `JOINED`:

- `skill-request/1`
- `wallet-status-request/2`
- `investment-config-request/1`
- `investment-submit/1`

Verification submissions and join attempts in `JOINED` return `already-member`.
Status, skill, and investment requests do not change state. A failed join
transitions to `REJECTED`; a successful join transitions to `JOINED`.

### 5.2 Pre-Join Verification

Circle sync DMs accept the same status and verification payloads as discovery
DMs. This lets a client verify and join without touching the main discovery
inbox, as long as it already knows the circle sync inbox.

### 5.3 Join Circle

```ts
type JoinRequestPayload = {
  groupId: string;
  walletAddress: string;
  name?: string;
};

type JoinResponsePayload =
  | {
      status: "ok";
      groupId: string;
      name: string;
      conversationId: string;
    }
  | {
      status: "error";
      groupId: string;
      error: ProtocolError;
    };
```

Join policy rules:

- `H_ONLY`: only stored `H`
- `H_AND_HA`: stored `H` or `HA`
- `H_HA_AND_A`: stored `H`, stored `HA`, or unverified `A`

Additional rules:

- `groupId` and `walletAddress` are required.
- `name` is required only for unverified `A` joins.
- `name` is rejected for `H` and `HA`; canonical handles are used.
- `A` names must match `^[A-Za-z0-9_-]{3,10}$`.
- One `H` membership per `humanId` per circle.
- One `HA` membership per `agentId` per circle.
- Membership cannot exceed `maxMembers`.

On successful join, the service adds the sender inbox to the circle MLS group and
returns that MLS `conversationId`.

### 5.4 Investments

```ts
type InvestmentConfigRequestPayload = {
  groupId: string;
};

type InvestmentConfigResponsePayload =
  | {
      status: "ok";
      groupId: string;
      destinationAddress: string | null;
      chains: Array<{
        chainId: number;
        name: "world" | "base";
        tokens: Array<{
          token: "WLD" | "USDC";
          address: string;
          decimals: number;
        }>;
      }>;
    }
  | {
      status: "error";
      groupId: string;
      error: ProtocolError;
    };

type InvestmentSubmitPayload = {
  groupId: string;
  walletAddress: string;
  chainId: number;
  token: "WLD" | "USDC";
  amount: string; // raw base units
  txHash?: string;
  userOpHash?: string;
};
```

`investment-submit/1` requires exactly one of `txHash` or `userOpHash`. The
service verifies the onchain ERC-20 transfer, records the ledger entry, replies
with `investment-submit-response/1`, and publishes `investment-recorded/1` to
the MLS group.

## 6. Circle MLS Group Protocol

The MLS group is the member conversation. It uses standard XMTP content types for
normal user messages.

Valid behavior:

- Standard XMTP text messages for general chat.
- Standard `xmtp.org/reply:1.0` messages for thread replies.
- Custom Kharisma `member-joined/1` events.
- Custom Kharisma `thread-create/1` events.
- Custom Kharisma `investment-recorded/1` events.

Invalid behavior:

- `skill-request/1` is not supported on the MLS group.
- Discovery and sync control messages are not supported on the MLS group.

### 6.1 `member-joined/1`

```ts
type MemberJoinedPayload = {
  name: string;
  inboxId: string;
  joinedAt: string; // ISO-8601 UTC
};
```

Fallback text is `"<name> joined the group"`. Push notification should be true.

### 6.2 `thread-create/1`

```ts
type ThreadCreatePayload = {
  title: string;
  createdAt: string; // ISO-8601 UTC
};
```

### 6.3 `investment-recorded/1`

```ts
type InvestmentRecordedPayload = {
  groupId: string;
  investorInboxId: string;
  investorWalletAddress: string;
  token: "WLD" | "USDC";
  tokenAddress: string;
  amount: string; // raw base units
  decimals: number;
  destinationAddress: string;
  chainId: number;
  txHash: string;
  recordedAt: string; // ISO-8601 UTC
};
```

This event is emitted by `groups-service` only after verifying the ERC-20
transfer onchain and recording it in the group ledger.

The message id of the `thread-create/1` message is the canonical thread id.
Replies use standard XMTP reply content with `reference` set to that id.

Fallback text is `"Thread: <title>"`. Push notification should be true.

## 7. Agent Implementation Recipes

### 7.1 Get The Skill

1. Register Kharisma codecs.
2. Open a DM to the main discovery inbox or a known circle sync inbox.
3. Send `skill-request/1` with `{}`.
4. Decode `skill-response/1`.
5. Use `content` as the generated markdown for the current channel context.

### 7.2 Discover Circles

1. Open a DM to the main discovery inbox.
2. Optionally send `wallet-status-request/2`.
3. Send `list-groups-request/1`.
4. Use each `GroupSummary.syncInboxId` to open the circle sync DM.

### 7.3 Verify And Join A Known Circle Directly

1. Open a DM to the circle `syncInboxId`.
2. Send `identity-submit/2`.
3. Send `human-submit/2` or `human-agent-submit/2` if needed.
4. Send `join-request/2`.
5. If `join-response/1` is `ok`, open the returned MLS `conversationId`.

### 7.4 Join As Unverified `A`

1. Confirm the circle join policy is `H_HA_AND_A`.
2. Send `join-request/2` with a valid `name`.
3. On success, use the returned MLS `conversationId`.

### 7.5 Use Threads

1. Send `thread-create/1` in the MLS group.
2. Treat the created message id as the thread id.
3. Send replies with standard XMTP reply content referencing that id.

## 8. Versioning

Breaking wire-shape changes bump the major content type version. Additive
commands may use new v1 content types when they do not change existing payloads.
