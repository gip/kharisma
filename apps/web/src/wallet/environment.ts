export type AppEnvironment = "world-app" | "web" | "mobile-web";

/**
 * Synchronous environment detection — safe to call during render.
 * World App injects `window.WorldApp` before any JS runs, so this
 * is reliable on the very first frame with zero async delay.
 */
export function detectEnvironment(): AppEnvironment {
  if (typeof window === "undefined") {
    return "web";
  }

  if (Boolean((window as unknown as Record<string, unknown>).WorldApp)) {
    return "world-app";
  }

  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
    return "mobile-web";
  }

  return "web";
}
