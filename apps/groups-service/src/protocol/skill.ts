import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  SkillChannelContext,
  SkillResponsePayload,
} from "@kharisma/protocol";
import type { ManagedGroup } from "../groups/manager.js";

export const SKILL_NAME = "SKILL.md" as const;
export const SKILL_MEDIA_TYPE = "text/markdown" as const;
export const DEFAULT_PROTOCOL_VERSION = "0.3.0";

let cachedSkillBody: string | null = null;

export function buildDiscoverySkill(input: {
  serviceInboxId: string;
}): SkillResponsePayload {
  const skillBody = loadSkillMarkdown();
  const context: SkillChannelContext = {
    kind: "discovery",
    serviceInboxId: input.serviceInboxId,
    protocolVersion: extractProtocolVersion(skillBody),
  };

  return okSkill(context, renderSkillMarkdown(context, skillBody));
}

export function buildCircleSyncSkill(
  managed: ManagedGroup,
): SkillResponsePayload {
  const skillBody = loadSkillMarkdown();
  const memberCount = Object.keys(managed.record.members).length;
  const context: SkillChannelContext = {
    kind: "circle-sync",
    groupId: managed.record.groupId,
    title: managed.record.title,
    syncInboxId: managed.record.syncInboxId,
    conversationId: managed.record.xmtpGroupId || null,
    joinPolicy: managed.record.joinPolicy,
    memberCount,
    maxMembers: managed.record.maxMembers,
    availableSeats: Math.max(0, managed.record.maxMembers - memberCount),
    languages: managed.record.languages,
    protocolVersion: extractProtocolVersion(skillBody),
  };

  return okSkill(context, renderSkillMarkdown(context, skillBody));
}

function okSkill(
  channel: SkillChannelContext,
  content: string,
): SkillResponsePayload {
  return {
    status: "ok",
    file: SKILL_NAME,
    mediaType: SKILL_MEDIA_TYPE,
    channel,
    content,
  };
}

export function loadSkillMarkdown(): string {
  if (cachedSkillBody) {
    return cachedSkillBody;
  }

  const thisFile = fileURLToPath(import.meta.url);
  const candidates = [
    path.resolve(path.dirname(thisFile), "../../../../packages/protocol/SKILL.md"),
    path.resolve(process.cwd(), "packages/protocol/SKILL.md"),
    path.resolve(process.cwd(), "../../packages/protocol/SKILL.md"),
  ];

  for (const candidate of candidates) {
    try {
      cachedSkillBody = readFileSync(candidate, "utf8");
      return cachedSkillBody;
    } catch {
      // Try the next runtime layout.
    }
  }

  throw new Error("Unable to load packages/protocol/SKILL.md");
}

function renderSkillMarkdown(
  context: SkillChannelContext,
  skillBody: string,
): string {
  const parts = splitSkillMarkdown(skillBody);
  const sections = parts.frontmatter ? [
    parts.frontmatter,
    parts.heading,
    "",
    renderChannelContext(context),
    "",
    "---",
    "",
    parts.body,
  ] : [
    parts.heading,
    "",
    renderChannelContext(context),
    "",
    "---",
    "",
    parts.body,
  ];

  return `${sections.join("\n")}\n`;
}

type SkillMarkdownParts = {
  frontmatter: string;
  heading: string;
  body: string;
};

function splitSkillMarkdown(markdown: string): SkillMarkdownParts {
  const trimmed = markdown.trim();
  const frontmatterMatch = /^---\n[\s\S]*?\n---\n*/.exec(trimmed);
  const frontmatter = frontmatterMatch?.[0].trimEnd() ?? "";
  const bodyStart = frontmatterMatch
    ? trimmed.slice(frontmatterMatch[0].length).trimStart()
    : trimmed;
  const [firstLine = "# Kharisma Protocol", ...restLines] = bodyStart.split("\n");
  const hasHeading = firstLine.startsWith("# ");

  return {
    frontmatter,
    heading: hasHeading ? firstLine : "# Kharisma Protocol",
    body: hasHeading ? restLines.join("\n").trim() : bodyStart,
  };
}

function renderChannelContext(context: SkillChannelContext): string {
  if (context.kind === "discovery") {
    return [
      "## Channel Context",
      "",
      "- Channel kind: discovery",
      `- Service inbox id: ${context.serviceInboxId}`,
      `- Protocol version: ${context.protocolVersion}`,
      "- Transport: XMTP only",
    ].join("\n");
  }

  return [
    "## Channel Context",
    "",
    "- Channel kind: circle-sync",
    `- Circle id: ${context.groupId}`,
    `- Circle title: ${context.title}`,
    `- Sync inbox id: ${context.syncInboxId}`,
    `- MLS conversation id: ${context.conversationId ?? "null"}`,
    `- Join policy: ${context.joinPolicy}`,
    `- Members: ${context.memberCount}/${context.maxMembers}`,
    `- Available seats: ${context.availableSeats}`,
    `- Languages: ${context.languages.join(", ")}`,
    `- Protocol version: ${context.protocolVersion}`,
    "- Transport: XMTP only",
  ].join("\n");
}

function extractProtocolVersion(markdown: string): string {
  const match = /Version:\s+\*\*([^*]+)\*\*/.exec(markdown);
  return match?.[1] ?? DEFAULT_PROTOCOL_VERSION;
}
