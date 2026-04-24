/**
 * Error codes emitted by the Kharisma protocol. See SKILL.md §2.4.
 */
export const ERROR_CODES = [
  "unauthorized-role",
  "not-registered",
  "verification-required",
  "verification-order",
  "unknown-type",
  "malformed",
  "name-invalid",
  "name-taken",
  "already-member",
  "group-not-found",
  "group-full",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ProtocolError = {
  code: ErrorCode;
  message: string;
};

export function protocolError(code: ErrorCode, message: string): ProtocolError {
  return { code, message };
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === "string" &&
    (ERROR_CODES as readonly string[]).includes(value)
  );
}
