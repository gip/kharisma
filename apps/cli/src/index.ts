#!/usr/bin/env node

import { parseArgs } from "./args.js";
import { CliError, errorMessage } from "./errors.js";
import { resolvePrivateKey } from "./keys.js";
import { renderMarkdownForTerminal } from "./markdown.js";

async function main(): Promise<void> {
  const options = parseArgs({ argv: process.argv.slice(2) });
  const key = resolvePrivateKey({
    privateKey: options.privateKey,
    storageDir: options.storageDir,
  });

  if (options.verbose && key.source === "generated") {
    process.stderr.write(
      [
        "Generated and stored a new sender wallet.",
        `Sender address: ${key.address}`,
        `Sender private key: ${key.privateKey}`,
        `Wallet key file: ${key.keyPath}`,
        "",
      ].join("\n"),
    );
  }

  const { fetchSkillMarkdown } = await loadSkillModule();
  const markdown = await fetchSkillMarkdown({
    target: options.target,
    privateKey: key.privateKey,
    storageDir: options.storageDir,
    xmtpEnv: options.xmtpEnv,
    timeoutMs: options.timeoutMs,
    pollMs: options.pollMs,
    appVersion: options.appVersion,
  });

  const rendered = renderMarkdownForTerminal(markdown);
  process.stdout.write(rendered.endsWith("\n") ? rendered : `${rendered}\n`);
}

async function loadSkillModule(): Promise<typeof import("./skill.js")> {
  try {
    return await import("./skill.js");
  } catch (error) {
    if (isProtocolBuildMissing(error)) {
      throw new CliError(
        "Unable to load @kharisma/protocol build output. Run `pnpm build:protocol` or `pnpm build:cli` before fetching a skill.",
        1,
      );
    }
    throw error;
  }
}

function isProtocolBuildMissing(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    "code" in error &&
    error.code === "ERR_MODULE_NOT_FOUND" &&
    (error.message.includes("@kharisma/protocol") ||
      error.message.includes("packages/protocol/dist"))
  );
}

main().catch((error: unknown) => {
  const exitCode = error instanceof CliError ? error.exitCode : 1;
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${errorMessage(error)}\n`);
  process.exitCode = exitCode;
});
