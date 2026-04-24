import {
  HTTPFacilitatorClient,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@x402/core/server";
import type { RoutesConfig } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { UptoEvmScheme } from "@x402/evm/upto/server";
import { paymentMiddlewareFromHTTPServer } from "@x402/hono";
import type { MiddlewareHandler } from "hono";
import type { BackendAppEnv } from "../backend-types.js";
import type { BackendConfig } from "../config.js";

const SUPPORTED_EVM_SCHEMES = ["exact", "upto"] as const;

type SupportedEvmScheme = (typeof SUPPORTED_EVM_SCHEMES)[number];

function createJsonPaymentError(message: string) {
  return {
    contentType: "application/json",
    body: {
      error: message,
    },
  };
}

function createProtectedRoutes(
  config: BackendConfig,
  schemes: readonly SupportedEvmScheme[],
): RoutesConfig {
  const accepts = schemes.map((scheme) => ({
    scheme,
    price: config.x402PriceUsd,
    network: config.x402Network,
    payTo: config.x402PayTo,
  }));
  const routeAccepts = accepts.length === 1 ? accepts[0] : accepts;

  return {
    "POST /xmtp/bootstrap": {
      accepts: routeAccepts,
      description: "Bootstrap and unlock a user's XMTP client session.",
      mimeType: "application/json",
      unpaidResponseBody: async () => createJsonPaymentError("Payment required"),
      settlementFailedResponseBody: async () =>
        createJsonPaymentError("Payment settlement failed"),
    },
    "GET /conversations": {
      accepts: routeAccepts,
      description: "List the authenticated user's XMTP conversations.",
      mimeType: "application/json",
      unpaidResponseBody: async () => createJsonPaymentError("Payment required"),
      settlementFailedResponseBody: async () =>
        createJsonPaymentError("Payment settlement failed"),
    },
    "GET /conversations/:conversationId/messages": {
      accepts: routeAccepts,
      description: "Read messages for a specific XMTP conversation.",
      mimeType: "application/json",
      unpaidResponseBody: async () => createJsonPaymentError("Payment required"),
      settlementFailedResponseBody: async () =>
        createJsonPaymentError("Payment settlement failed"),
    },
    "POST /messages/send": {
      accepts: routeAccepts,
      description: "Send an XMTP message for the authenticated user.",
      mimeType: "application/json",
      unpaidResponseBody: async () => createJsonPaymentError("Payment required"),
      settlementFailedResponseBody: async () =>
        createJsonPaymentError("Payment settlement failed"),
    },
    "POST /kharisma/groups/list": {
      accepts: routeAccepts,
      description: "List Kharisma groups for the authenticated XMTP inbox.",
      mimeType: "application/json",
      unpaidResponseBody: async () => createJsonPaymentError("Payment required"),
      settlementFailedResponseBody: async () =>
        createJsonPaymentError("Payment settlement failed"),
    },
    "POST /kharisma/groups": {
      accepts: routeAccepts,
      description: "Create a Kharisma group for the authenticated XMTP inbox.",
      mimeType: "application/json",
      unpaidResponseBody: async () => createJsonPaymentError("Payment required"),
      settlementFailedResponseBody: async () =>
        createJsonPaymentError("Payment settlement failed"),
    },
    "POST /kharisma/groups/join": {
      accepts: routeAccepts,
      description: "Join a Kharisma group for the authenticated XMTP inbox.",
      mimeType: "application/json",
      unpaidResponseBody: async () => createJsonPaymentError("Payment required"),
      settlementFailedResponseBody: async () =>
        createJsonPaymentError("Payment settlement failed"),
    },
    "POST /conversations/:conversationId/read": {
      accepts: routeAccepts,
      description: "Update read state for an XMTP conversation.",
      mimeType: "application/json",
      unpaidResponseBody: async () => createJsonPaymentError("Payment required"),
      settlementFailedResponseBody: async () =>
        createJsonPaymentError("Payment settlement failed"),
    },
  };
}

function getSupportedPaymentSchemes(
  resourceServer: x402ResourceServer,
  config: BackendConfig,
): SupportedEvmScheme[] {
  return SUPPORTED_EVM_SCHEMES.filter((scheme) =>
    resourceServer.getSupportedKind(2, config.x402Network, scheme),
  );
}

async function createUnsupportedNetworkError(
  facilitatorClient: HTTPFacilitatorClient,
  config: BackendConfig,
): Promise<Error> {
  const supported = await facilitatorClient.getSupported();
  const configuredFamily = config.x402Network.split(":")[0];
  const supportedKinds = supported.kinds
    .filter(
      (kind) =>
        kind.x402Version === 2 &&
        kind.network.split(":")[0] === configuredFamily &&
        SUPPORTED_EVM_SCHEMES.includes(kind.scheme as SupportedEvmScheme),
    )
    .map((kind) => `${kind.scheme} on ${kind.network}`);
  const availableKinds =
    supportedKinds.length > 0 ? supportedKinds.join(", ") : "none";

  return new Error(
    [
      `No supported x402 EVM payment scheme was found for network "${config.x402Network}" at ${config.x402FacilitatorUrl}.`,
      `Available facilitator kinds for ${configuredFamily}: ${availableKinds}.`,
      'Use `X402_NETWORK=eip155:84532` with `https://x402.org/facilitator` for local development, or point `X402_FACILITATOR_URL` at a facilitator that supports your configured network.',
    ].join(" "),
  );
}

export async function createX402Middleware(
  config: BackendConfig,
): Promise<MiddlewareHandler<BackendAppEnv>> {
  const facilitatorClient = new HTTPFacilitatorClient({
    url: config.x402FacilitatorUrl,
  });
  const resourceServer = new x402ResourceServer(facilitatorClient)
    .register(config.x402Network, new ExactEvmScheme())
    .register(config.x402Network, new UptoEvmScheme());

  await resourceServer.initialize();

  const supportedSchemes = getSupportedPaymentSchemes(resourceServer, config);

  if (supportedSchemes.length === 0) {
    throw await createUnsupportedNetworkError(facilitatorClient, config);
  }

  const httpServer = new x402HTTPResourceServer(
    resourceServer,
    createProtectedRoutes(config, supportedSchemes),
  );

  httpServer.onProtectedRequest(async (context) => {
    const agentkitHeader = context.adapter.getHeader("agentkit");

    // AgentKit bypass/discount logic should stay centralized here when added.
    if (typeof agentkitHeader === "string" && agentkitHeader.length > 0) {
      return;
    }
  });

  return paymentMiddlewareFromHTTPServer(httpServer, undefined, undefined, false);
}
