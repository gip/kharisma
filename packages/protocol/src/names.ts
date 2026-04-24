/**
 * Member-name constraint, as per SKILL.md §5.3.
 *
 * 3-10 characters, ASCII letters, digits, underscore and hyphen.
 * Uniqueness within a group is enforced by the service; this function only
 * validates the string itself.
 */
export const MEMBER_NAME_REGEX = /^[A-Za-z0-9_-]{3,10}$/;

export function isValidMemberName(value: unknown): value is string {
  return typeof value === "string" && MEMBER_NAME_REGEX.test(value);
}

/**
 * Compares two member names for uniqueness. Compared case-insensitively so
 * "Alice" and "alice" collide.
 */
export function memberNamesCollide(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
