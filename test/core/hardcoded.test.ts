import { describe, it, expect } from "vitest";
import { parseTokens } from "../../src/core/parse";
import { indexTokens, resolveAliases } from "../../src/core/resolve";
import {
  findLiterals,
  indexTokenValues,
  matchingTokens,
  replacementFor,
  sigilFor,
} from "../../src/core/hardcoded";
import { learnPrefix } from "../../src/core/exportNames";

const srgb = (r: number, g: number, b: number) => ({
  colorSpace: "srgb",
  components: [r / 255, g / 255, b / 255],
});

const model = parseTokens(
  JSON.stringify({
    color: {
      $type: "color",
      blue: { $value: srgb(37, 99, 235) },
      alias: { $value: "{color.blue}" },
      p3red: { $value: { colorSpace: "display-p3", components: [1, 0, 0] } },
      faded: { $value: { ...srgb(0, 0, 0), alpha: 0.5 } },
    },
    space: {
      $type: "dimension",
      sm: { $value: { value: 8, unit: "px" } },
      md: { $value: { value: 1, unit: "rem" } },
      none: { $value: { value: 0, unit: "px" } },
    },
  }),
);
resolveAliases(model);
const index = indexTokenValues(indexTokens(model), 16);

const matches = (css: string) =>
  findLiterals(css).map((l) => [l.text, matchingTokens(l, index)] as const);

describe("hard-coded values", () => {
  it("matches every CSS colour form, aliases included, within rounding", () => {
    expect(matches(".a { color: #2563eb; }")).toEqual([["#2563eb", ["color.alias", "color.blue"]]]);
    expect(matches(".a { color: rgb(37 99 235); }")[0][1]).toContain("color.blue");
    expect(matches(".a { color: hsl(221.2 83.2% 53.3%); }")[0][1]).toContain("color.blue");
    expect(matches(".a { color: #2563ea; }")[0][1]).toEqual([]); // one step off
  });

  it("compares alpha, and keeps out-of-gamut colours apart from their clamp", () => {
    expect(matches(".a { color: rgb(0 0 0 / 0.5); }")[0][1]).toEqual(["color.faded"]);
    expect(matches(".a { color: #000; }")[0][1]).toEqual([]);
    expect(matches(".a { color: #ff0000; }")[0][1]).toEqual([]);
    expect(matches(".a { color: color(display-p3 1 0 0); }")[0][1]).toEqual(["color.p3red"]);
  });

  it("matches px and rem in px at the root size, never zero", () => {
    expect(matches(".a { margin: 8px 16px 1rem 0px; }")).toEqual([
      ["8px", ["space.sm"]],
      ["16px", ["space.md"]],
      ["1rem", ["space.md"]],
      ["0px", []],
    ]);
  });

  it("skips comments, selectors and the declarations that define a variable", () => {
    const css = [
      "/* color: #2563eb; */",
      "// color: #2563eb;",
      ":root { --color-blue: #2563eb; }",
      "$space-sm: 8px;",
      "@space-sm: 8px;",
      "#add { background: url(http://x/y.png); }",
      ".b:hover { color: #2563eb; }",
    ].join("\n");
    expect(findLiterals(css).map((l) => l.text)).toEqual(["#2563eb"]);
    const [only] = findLiterals(css);
    expect(css.slice(only.start, only.end)).toBe("#2563eb");
    expect(css.lastIndexOf("#2563eb")).toBe(only.start);
  });

  it("in plain CSS, finds a literal after a protocol-relative url(//…); a // comment still hides one in SCSS", () => {
    const css = "a { background: url(//cdn.example.com/a.png); color: #2563eb; }";
    expect(findLiterals(css, "css").map((l) => l.text)).toEqual(["#2563eb"]);
    expect(findLiterals("a { b: c; } // color: #2563eb;", "scss")).toEqual([]);
  });

  it("reads Sass's indented syntax: newlines end a statement, indentation opens a block", () => {
    const opensWithVariable = ["$space-sm: 8px", ".a", "  margin: 8px", "  color: #2563eb"].join(
      "\n",
    );
    expect(findLiterals(opensWithVariable, "sass").map((l) => l.text)).toEqual(["8px", "#2563eb"]);
    const opensWithRule = [
      ".a",
      "  color: #2563eb",
      "$brand: #2563eb",
      "// color: #2563eb",
      "#add",
      "  padding: 8px",
      ".b:hover",
      "  color: #2563eb",
    ].join("\n");
    const found = findLiterals(opensWithRule, "sass");
    expect(found.map((l) => opensWithRule.slice(0, l.start).split("\n").length)).toEqual([2, 6, 8]);
  });

  it("names the replacement in each stylesheet's own syntax", () => {
    expect(replacementFor("color.base.blue-600", "css")).toBe("var(--color-base-blue-600)");
    expect(replacementFor("color.brandPrimary", "scss")).toBe("$color-brand-primary");
    expect(replacementFor("space.sm", "sass")).toBe("$space-sm");
    expect(replacementFor("space.sm", "less")).toBe("@space-sm");
    expect(replacementFor("color.Brand Primary", "css")).toBe("var(--color-brand-primary)");
    expect(replacementFor("color.brand/primary", "scss")).toBe("$color-brand-primary");
  });

  it("keeps the export prefix the file already uses", () => {
    const keys = ["color.base.blue-600", "space.sm"];
    const css = ".a { color: var(--ds-space-sm); }";
    const prefix = learnPrefix(css, sigilFor("css"), keys);
    expect(prefix).toBe("ds-");
    expect(replacementFor("color.base.blue-600", "css", prefix)).toBe(
      "var(--ds-color-base-blue-600)",
    );
    const scss = ".a { margin: $acme-space-sm; }";
    expect(replacementFor("space.sm", "scss", learnPrefix(scss, sigilFor("scss"), keys))).toBe(
      "$acme-space-sm",
    );
    expect(learnPrefix(".a { color: red; }", sigilFor("css"), keys)).toBe("");
  });
});
