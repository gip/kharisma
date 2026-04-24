export type LoginMethod =
  | "metamask"
  | "coinbase"
  | "privy-google"
  | "privy-email"
  | "privy-phone"
  | "privy-wallet"
  | "world-miniapp";

const LAST_LOGIN_METHOD_KEY = "kharisma:last-login-method";

export function setLastLoginMethod(method: LoginMethod) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LAST_LOGIN_METHOD_KEY, method);
}

export function getLastLoginMethod(): LoginMethod | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(LAST_LOGIN_METHOD_KEY);
  return value as LoginMethod | null;
}

export function clearSessionButKeepLoginHint() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.clear();
}
