import { describe, it, expect } from "vitest";
import { hoverMarkdown } from "../../src/core/hover";

/** The card's height lever: blocks are joined by a blank line (spec 040). */
const blocks = (md: string) => md.split("\n\n");
const base = { rootPx: 16, isAlias: false as const };

const colour = hoverMarkdown({
  ...base,
  name: "primary",
  path: ["color", "brand", "primary"],
  type: "color",
  value: { colorSpace: "srgb", components: [0.231, 0.51, 0.965] },
  definedIn: { label: "a/b.tokens.json", href: "file:///a/b.tokens.json" },
});

describe("compact hover", () => {
  it("puts a colour's swatch in the header, beside the name", () => {
    const [header] = blocks(colour);
    expect(header).toContain("data:image/svg+xml;base64,");
    expect(header).toContain("**primary**");
    expect(colour.match(/data:image\/svg\+xml/g)).toHaveLength(1);
  });

  it("lists HEX and OKLCH only, and keeps the contrast line", () => {
    expect(colour).not.toContain("RGB");
    expect(colour).not.toContain("HSL");
    expect(colour).toContain("HEX");
    expect(colour).toContain("OKLCH");
    expect(colour).toMatch(/WCAG AA \(4\.5:1\)[\s\S]*[\d.]+:1 on white/);
  });

  it("keeps a defined-in colour card to four blocks and one rule", () => {
    expect(blocks(colour).length).toBeLessThanOrEqual(4);
    expect(blocks(colour).filter((b) => b === "---")).toHaveLength(1);
    expect(blocks(colour)[0]).toContain("[a/b.tokens.json](file:///a/b.tokens.json)");
  });

  it("shows a dimension's conversions on one line, no table", () => {
    const md = hoverMarkdown({
      ...base,
      name: "md",
      path: ["space", "md"],
      type: "dimension",
      value: { value: 1, unit: "rem" },
    });
    expect(md).not.toContain("<table>");
    const line = blocks(md).find((b) => b.includes("<code>16px</code>"));
    expect(line).toContain("<code>1rem</code>");
    expect(line).toContain("<code>12pt</code>");
    expect(md).toContain("rem at 16px root");
  });
});
