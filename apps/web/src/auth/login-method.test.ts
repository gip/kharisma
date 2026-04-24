import {
  clearSessionButKeepLoginHint,
  getLastLoginMethod,
  setLastLoginMethod,
} from "./login-method";

describe("login method persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("keeps the last login method after clearing session state", () => {
    setLastLoginMethod("coinbase");
    window.sessionStorage.setItem("example", "1");

    clearSessionButKeepLoginHint();

    expect(getLastLoginMethod()).toBe("coinbase");
    expect(window.sessionStorage.getItem("example")).toBeNull();
  });
});
