import { describe, expect, test } from "vitest";
import { renderMarkdownForTerminal } from "../markdown.js";

describe("renderMarkdownForTerminal", () => {
  test("renders markdown through marked-terminal", () => {
    const rendered = renderMarkdownForTerminal("# Hello\n\n- item 1\n- item 2");

    expect(rendered).toContain("Hello");
    expect(rendered).toContain("item 1");
    expect(rendered).toContain("item 2");
  });
});
