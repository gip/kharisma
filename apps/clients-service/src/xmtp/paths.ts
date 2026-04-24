import { mkdirSync } from "node:fs";
import path from "node:path";

export function getUserXmtpDirectory(rootDir: string, walletAddress: string) {
  const directory = path.join(rootDir, walletAddress.toLowerCase());
  mkdirSync(directory, { recursive: true });
  return directory;
}

export function getUserXmtpDbPath(rootDir: string, walletAddress: string) {
  return path.join(getUserXmtpDirectory(rootDir, walletAddress), "client.db3");
}
