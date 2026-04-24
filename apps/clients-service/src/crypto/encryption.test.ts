import { SecretBox } from "./encryption.js";

describe("SecretBox", () => {
  it("round-trips encrypted values", () => {
    const box = new SecretBox(
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
    const sealed = box.seal("hello");

    expect(box.open(sealed)).toBe("hello");
  });
});
