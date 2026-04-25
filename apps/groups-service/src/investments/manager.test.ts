import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getAddress } from "viem";
import type { GroupsConfig } from "../config.js";
import { createLogger } from "../logging.js";
import type { GroupManager } from "../groups/manager.js";
import type { GroupRecord } from "../storage/schema.js";
import { GroupStore } from "../storage/store.js";
import {
  InvestmentManager,
  type SubmitInvestmentInput,
} from "./manager.js";
import type { InvestmentVerifier } from "./verifier.js";

const KEY_HEX =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const investor = getAddress("0x1111111111111111111111111111111111111111");
const destination = getAddress("0x2222222222222222222222222222222222222222");
const tokenAddress = getAddress("0x3333333333333333333333333333333333333333");
const txHash =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function config(): GroupsConfig {
  return {
    logLevel: "silent",
    dataRoot: ".data",
    mainXmtpDir: ".data/xmtp/main",
    groupsXmtpDir: ".data/xmtp/groups",
    groupsDbPath: ".data/groups.db",
    kharismaPrivateKey:
      "0x1111111111111111111111111111111111111111111111111111111111111111",
    storageEncryptionKeyHex: KEY_HEX,
    xmtpDbEncryptionKey:
      "0x3333333333333333333333333333333333333333333333333333333333333333",
    xmtpEnv: "dev",
    xmtpAppVersion: "test",
    worldIdRpId: "",
    investmentConfirmations: 1n,
    investmentChains: [],
  };
}

function makeRecord(): GroupRecord {
  return {
    groupId: "g-1",
    status: "active",
    title: "Example",
    description: "This is a test group description",
    mediaUrl: "https://example.com/media/test.jpg",
    thumbnailUrl: "https://example.com/media/thumb.jpg",
    languages: ["en"],
    joinPolicy: "H_ONLY",
    joinApproval: "NONE",
    maxMembers: 25,
    encryptedPrivateKey: "v1.x.x.x",
    syncInboxId: "inbox-sync-1",
    xmtpGroupId: "xmtp-group-1",
    members: {
      "inbox-a": {
        inboxId: "inbox-a",
        walletAddress: investor,
        name: "alice",
        role: "H",
        verificationLevel: "human",
        humanId: "human-1",
        joinedAt: new Date(0).toISOString(),
      },
    },
    createdAt: new Date(0).toISOString(),
  };
}

describe("InvestmentManager", () => {
  let dir: string;
  let store: GroupStore;
  let send: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "investment-manager-"));
    store = new GroupStore(path.join(dir, "groups.db"), KEY_HEX);
    store.putGroup(makeRecord());
    send = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function manager(verifier: Partial<InvestmentVerifier> = {}) {
    const record = store.getGroup("g-1")!;
    const groupManager = {
      get: vi.fn(() => ({
        record,
        walletAddress: destination,
        client: {
          conversations: {
            getConversationById: vi.fn().mockResolvedValue({ send }),
          },
        },
      })),
    } as unknown as GroupManager;

    const investmentVerifier = {
      resolveUserOperationTransactionHash: vi.fn().mockResolvedValue(txHash),
      verify: vi.fn().mockResolvedValue({
        groupId: "g-1",
        txHash,
        chainId: 480,
        token: "USDC",
        amount: "25",
        investorWalletAddress: investor,
        destinationAddress: destination,
        tokenAddress,
        decimals: 6,
        logIndex: 0,
      }),
      ...verifier,
    } as unknown as InvestmentVerifier;

    return new InvestmentManager(
      config(),
      store,
      groupManager,
      investmentVerifier,
      createLogger({ level: "silent", name: "test" }),
    );
  }

  const input: SubmitInvestmentInput = {
    groupId: "g-1",
    txHash,
    chainId: 480,
    token: "USDC",
    amount: "25",
    investorWalletAddress: investor,
  };

  test("uses the generated group wallet as investment destination", async () => {
    const investmentManager = manager();

    expect(investmentManager.getInvestmentConfig("g-1")).toMatchObject({
      groupId: "g-1",
      destinationAddress: destination,
    });

    await investmentManager.submitInvestment(input);

    expect(store.listInvestments("g-1")[0]?.destinationAddress).toBe(
      destination.toLowerCase(),
    );
  });

  test("valid verified investment records ledger and sends an XMTP event", async () => {
    const result = await manager().submitInvestment(input);

    expect(result.status).toBe("recorded");
    expect(store.listInvestments("g-1")).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  test("duplicate submission is not credited or announced twice", async () => {
    const investmentManager = manager();
    await investmentManager.submitInvestment(input);
    send.mockClear();

    const duplicate = await investmentManager.submitInvestment(input);

    expect(duplicate.status).toBe("already-recorded");
    expect(store.listInvestments("g-1")).toHaveLength(1);
    expect(store.listInvestmentBalances("g-1")[0]?.amount).toBe("25");
    expect(send).not.toHaveBeenCalled();
  });

  test("non-member investor is rejected", async () => {
    await expect(
      manager().submitInvestment({
        ...input,
        investorWalletAddress: getAddress(
          "0x4444444444444444444444444444444444444444",
        ),
      }),
    ).rejects.toThrow(/not a member/);
  });

  test("resolves a user operation hash before verification", async () => {
    const investmentVerifier = {
      resolveUserOperationTransactionHash: vi.fn().mockResolvedValue(txHash),
      verify: vi.fn().mockResolvedValue({
        groupId: "g-1",
        txHash,
        chainId: 480,
        token: "USDC",
        amount: "25",
        investorWalletAddress: investor,
        destinationAddress: destination,
        tokenAddress,
        decimals: 6,
        logIndex: 0,
      }),
    };
    const investmentManager = manager(investmentVerifier);
    const userOpHash =
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    await investmentManager.submitInvestment({
      ...input,
      txHash: undefined,
      userOpHash,
    });

    expect(investmentVerifier.resolveUserOperationTransactionHash).toHaveBeenCalledWith({
      chainId: 480,
      userOpHash,
    });
    expect(investmentVerifier.verify).toHaveBeenCalledWith(
      expect.objectContaining({ txHash }),
    );
  });
});
