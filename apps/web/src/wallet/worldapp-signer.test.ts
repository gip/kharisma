import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorldAppSigner } from "./worldapp-signer";

vi.mock("@worldcoin/minikit-js", () => ({
  MiniKit: {
    signMessage: vi.fn(),
    signTypedData: vi.fn(),
  },
}));

const { MiniKit } = await import("@worldcoin/minikit-js");
const signMessageMock = vi.mocked(MiniKit.signMessage);
const signTypedDataMock = vi.mocked(MiniKit.signTypedData);

describe("WorldAppSigner", () => {
  beforeEach(() => {
    signMessageMock.mockReset();
    signTypedDataMock.mockReset();
  });

  it("returns the authenticated World App address", async () => {
    const signer = new WorldAppSigner(
      "0x1111111111111111111111111111111111111111",
    );

    await expect(signer.getAddress()).resolves.toBe(
      "0x1111111111111111111111111111111111111111",
    );
  });

  it("delegates message signing to MiniKit", async () => {
    signMessageMock.mockResolvedValue({
      executedWith: "minikit",
      data: {
        status: "success",
        version: 1,
        address: "0x1111111111111111111111111111111111111111",
        signature:
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    });

    const signer = new WorldAppSigner(
      "0x1111111111111111111111111111111111111111",
    );

    await expect(signer.signMessage("hello world")).resolves.toBe(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(signMessageMock).toHaveBeenCalledWith({ message: "hello world" });
  });

  it("throws when MiniKit returns an error payload", async () => {
    signMessageMock.mockResolvedValue({
      executedWith: "minikit",
      data: {
        status: "error",
        version: 1,
        error_code: "user_rejected",
      },
    } as unknown as Awaited<ReturnType<typeof MiniKit.signMessage>>);

    const signer = new WorldAppSigner(
      "0x1111111111111111111111111111111111111111",
    );

    await expect(signer.signMessage("hello world")).rejects.toThrow(
      /user_rejected/,
    );
  });

  it("delegates typed-data signing to MiniKit", async () => {
    signTypedDataMock.mockResolvedValue({
      executedWith: "minikit",
      data: {
        status: "success",
        version: 1,
        address: "0x1111111111111111111111111111111111111111",
        signature:
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    });

    const signer = new WorldAppSigner(
      "0x1111111111111111111111111111111111111111",
    );
    const typedData = {
      types: {
        EIP712Domain: [{ name: "name", type: "string" }],
        Mail: [{ name: "contents", type: "string" }],
      },
      primaryType: "Mail",
      message: {
        contents: "gm",
      },
      domain: {
        name: "Kharisma",
      },
      chainId: 480,
    };

    await expect(signer.signTypedData?.(typedData)).resolves.toBe(
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    expect(signTypedDataMock).toHaveBeenCalledWith(typedData);
  });
});
