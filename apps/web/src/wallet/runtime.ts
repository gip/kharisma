export function getPublicEnv() {
  return {
    privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID || "",
    worldAppId: process.env.NEXT_PUBLIC_WORLD_APP_ID || "",
    backendHttpUrl: process.env.NEXT_PUBLIC_BACKEND_HTTP_URL || "http://localhost:4000",
    backendWsUrl:
      process.env.NEXT_PUBLIC_BACKEND_WS_URL || "ws://localhost:4000/ws",
  };
}
