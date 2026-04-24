import { describe, expect, it } from "vitest";
import { isValidMemberName, memberNamesCollide } from "./names.js";

describe("isValidMemberName", () => {
  it("rejects strings shorter than 3 characters", () => {
    expect(isValidMemberName("ab")).toBe(false);
  });

  it("accepts exactly 3 characters", () => {
    expect(isValidMemberName("abc")).toBe(true);
  });

  it("accepts exactly 10 characters", () => {
    expect(isValidMemberName("abcdefghij")).toBe(true);
  });

  it("rejects strings longer than 10 characters", () => {
    expect(isValidMemberName("abcdefghijk")).toBe(false);
  });

  it("accepts underscores and hyphens and digits", () => {
    expect(isValidMemberName("a_b-1")).toBe(true);
  });

  it("rejects whitespace", () => {
    expect(isValidMemberName("ab c")).toBe(false);
  });

  it("rejects unicode letters", () => {
    expect(isValidMemberName("alicé")).toBe(false);
  });

  it("rejects non-string inputs", () => {
    expect(isValidMemberName(undefined)).toBe(false);
    expect(isValidMemberName(123)).toBe(false);
    expect(isValidMemberName({})).toBe(false);
  });
});

describe("memberNamesCollide", () => {
  it("is case-insensitive", () => {
    expect(memberNamesCollide("Alice", "alice")).toBe(true);
  });

  it("returns false for different names", () => {
    expect(memberNamesCollide("alice", "bob")).toBe(false);
  });
});
