import type { LoginMethod } from "@/auth/login-method";

export function buildSigningMessage(input: {
  method: LoginMethod;
  address: `0x${string}`;
}) {
  return [
    "Kharisma",
    `login_method: ${input.method}`,
    `address: ${input.address}`,
    "intent: prove-universal-signer",
  ].join("\n");
}
