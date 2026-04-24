/**
 * A role identifies the class of sender that is interacting with the
 * Kharisma protocol. Only `H` and `HA` can access any operation; `A`
 * is rejected at the main-channel door.
 */
export type Role = "H" | "HA" | "A";

/**
 * Role that is allowed to authenticate on the main channel and appear as
 * a member of a group. Agents (`A`) cannot.
 */
export type AuthenticatedRole = Exclude<Role, "A">;

/**
 * Status returned when resolving a wallet or inbox against the canonical
 * registry. `UNKNOWN` means no registration exists yet.
 */
export type RegistrationStatus = Role | "UNKNOWN";

export type VerificationLevel =
  | "none"
  | "identity"
  | "human"
  | "human-agent";

export const ROLES: readonly Role[] = ["H", "HA", "A"] as const;
export const AUTHENTICATED_ROLES: readonly AuthenticatedRole[] = [
  "H",
  "HA",
] as const;

export const REGISTRATION_STATUSES: readonly RegistrationStatus[] = [
  "H",
  "HA",
  "A",
  "UNKNOWN",
] as const;

export const VERIFICATION_LEVELS: readonly VerificationLevel[] = [
  "none",
  "identity",
  "human",
  "human-agent",
] as const;

export function isRole(value: unknown): value is Role {
  return value === "H" || value === "HA" || value === "A";
}

export function isAuthenticatedRole(
  value: unknown,
): value is AuthenticatedRole {
  return value === "H" || value === "HA";
}

export function isRegistrationStatus(
  value: unknown,
): value is RegistrationStatus {
  return (
    typeof value === "string" &&
    (REGISTRATION_STATUSES as readonly string[]).includes(value)
  );
}

export function isVerificationLevel(
  value: unknown,
): value is VerificationLevel {
  return (
    typeof value === "string" &&
    (VERIFICATION_LEVELS as readonly string[]).includes(value)
  );
}
