import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

marked.use(markedTerminal());

export function renderMarkdownForTerminal(markdown: string): string {
  const rendered = marked.parse(markdown);
  if (typeof rendered !== "string") {
    throw new Error("Unexpected async markdown rendering result");
  }
  return rendered;
}
