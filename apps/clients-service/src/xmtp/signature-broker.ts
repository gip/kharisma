import { hexToBytes, type Hex } from "viem";
import type { AppLogger } from "../logging.js";
import type { WalletSignatureVerifier } from "../auth/signature-verifier.js";
import type { AppDatabase, UserRecord } from "../storage/database.js";
import type { WebSocketHub } from "../ws/hub.js";

type PendingRequest = {
  userId: number;
  requestId: string;
  resolve: (signature: Hex) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export class SignatureRequestBroker {
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private hub: WebSocketHub | null = null;

  constructor(
    private readonly database: AppDatabase,
    private readonly signatureVerifier: WalletSignatureVerifier,
    private readonly timeoutMs: number,
    private readonly logger: AppLogger,
  ) {}

  attachHub(hub: WebSocketHub) {
    this.hub = hub;
  }

  async requestSignature(input: {
    user: UserRecord;
    purpose: string;
    message: string;
  }) {
    const expiresAt = new Date(Date.now() + this.timeoutMs).toISOString();
    const request = this.database.createSignatureRequest({
      userId: input.user.id,
      walletAddress: input.user.walletAddress,
      purpose: input.purpose,
      message: input.message,
      chainId: input.user.walletChainId,
      expiresAt,
    });
    this.logger.debug(
      {
        purpose: input.purpose,
        requestId: request.id,
        userId: input.user.id,
      },
      "Created XMTP signature request",
    );

    if (!this.hub?.hasUserConnection(input.user.id)) {
      this.database.rejectSignatureRequest(
        request.id,
        "rejected",
        "No authenticated websocket is connected for this user",
      );
      this.logger.warn(
        {
          requestId: request.id,
          userId: input.user.id,
        },
        "Rejected XMTP signature request because no authenticated websocket is connected",
      );
      throw new Error("No authenticated websocket is connected for this user");
    }

    const signaturePromise = new Promise<Hex>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        this.database.rejectSignatureRequest(
          request.id,
          "expired",
          "Signature request timed out",
        );
        this.logger.warn(
          {
            requestId: request.id,
            userId: input.user.id,
          },
          "XMTP signature request timed out",
        );
        reject(new Error("Signature request timed out"));
      }, this.timeoutMs);

      this.pendingRequests.set(request.id, {
        userId: input.user.id,
        requestId: request.id,
        resolve,
        reject,
        timeout,
      });
    });

    this.hub.sendToUser(input.user.id, {
      type: "xmtp.signature_requested",
      requestId: request.id,
      purpose: request.purpose,
      message: request.message,
    });
    this.logger.debug(
      {
        requestId: request.id,
        userId: input.user.id,
      },
      "Dispatched XMTP signature request",
    );

    const signature = await signaturePromise;

    try {
      await this.signatureVerifier.verify({
        address: input.user.walletAddress,
        message: input.message,
        signature,
        chainId: input.user.walletChainId,
      });
      this.database.resolveSignatureRequest(request.id, signature);
      this.logger.debug(
        {
          requestId: request.id,
          userId: input.user.id,
        },
        "Resolved XMTP signature request",
      );
    } catch (error) {
      this.database.rejectSignatureRequest(
        request.id,
        "rejected",
        error instanceof Error ? error.message : "Signature verification failed",
      );
      this.logger.warn(
        {
          err: error,
          requestId: request.id,
          userId: input.user.id,
        },
        "XMTP signature verification failed",
      );
      throw error;
    }

    return {
      requestId: request.id,
      signature,
      signatureBytes: hexToBytes(signature),
    };
  }

  async submitSignature(input: {
    userId: number;
    requestId: string;
    signature: Hex;
  }) {
    const pending = this.pendingRequests.get(input.requestId);

    if (!pending || pending.userId !== input.userId) {
      this.logger.warn(
        {
          requestId: input.requestId,
          userId: input.userId,
        },
        "Signature request submission referenced an unknown request",
      );
      throw new Error("Signature request not found");
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(input.requestId);
    this.logger.debug(
      {
        requestId: input.requestId,
        userId: input.userId,
      },
      "Received XMTP signature submission",
    );
    pending.resolve(input.signature);
  }

  async rejectSignature(input: {
    userId: number;
    requestId: string;
    error: string;
  }) {
    const pending = this.pendingRequests.get(input.requestId);

    if (!pending || pending.userId !== input.userId) {
      this.logger.warn(
        {
          requestId: input.requestId,
          userId: input.userId,
        },
        "Signature request rejection referenced an unknown request",
      );
      throw new Error("Signature request not found");
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(input.requestId);
    this.database.rejectSignatureRequest(input.requestId, "rejected", input.error);
    this.logger.warn(
      {
        requestId: input.requestId,
        userId: input.userId,
      },
      "XMTP signature request rejected",
    );
    pending.reject(new Error(input.error));
  }
}
