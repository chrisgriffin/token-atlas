import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseTokens } from "../../src/core/parse";
import { findPathCollisions } from "../../src/core/collisions";
import { modifierFiles } from "../../src/core/modes";
import { parseResolver } from "../../src/core/resolver";

const model = (doc: Record<string, unknown>) => parseTokens(JSON.stringify(doc));

describe("findPathCollisions", () => {
  it("returns exactly one collision, with both file labels in input order", () => {
    const files = [
      {
        label: "brand-a.tokens.json",
        model: model({ brand: { $type: "color", primary: { $value: "#111" } } }),
      },
      {
        label: "theme.tokens.json",
        model: model({ theme: { bg: { $type: "color", $value: "{brand.primary}" } } }),
      },
      {
        label: "brand-b.tokens.json",
        model: model({ brand: { $type: "color", primary: { $value: "#222" } } }),
      },
    ];
    expect(findPathCollisions(files)).toEqual([
      { path: "brand.primary", files: ["brand-a.tokens.json", "brand-b.tokens.json"] },
    ]);
  });

  it("returns nothing when every path is defined once", () => {
    const files = [
      { label: "a", model: model({ x: { $type: "number", $value: 1 } }) },
      { label: "b", model: model({ y: { $type: "number", $value: 2 } }) },
    ];
    expect(findPathCollisions(files)).toEqual([]);
  });

  it("lists every file for a path defined three times", () => {
    const m = () => model({ x: { $type: "number", $value: 1 } });
    const files = ["a", "b", "c"].map((label) => ({ label, model: m() }));
    expect(findPathCollisions(files)).toEqual([{ path: "x", files: ["a", "b", "c"] }]);
  });
});

describe("findPathCollisions with a resolver's modifier files", () => {
  const resolver = (doc: Record<string, unknown>) => {
    const { resolver } = parseResolver(JSON.stringify({ version: "2025.10", ...doc }));
    if (!resolver) throw new Error("fixture resolver did not parse");
    return resolver;
  };
  const x = () => model({ x: { $type: "number", $value: 1 } });
  const files = (...labels: string[]) => labels.map((label) => ({ label, model: x() }));

  const themes = resolver({
    sets: {
      base: { sources: [{ $ref: "base.json" }] },
      extra: { sources: [{ $ref: "extra.json" }] },
    },
    modifiers: {
      theme: {
        contexts: {
          light: [{ $ref: "./light.json" }],
          dark: [{ $ref: "dark.json" }],
          darkHighContrast: [{ $ref: "dark.json" }, { $ref: "high-contrast.json" }],
        },
      },
      size: { contexts: { small: [{ $ref: "small.json" }], large: [{ $ref: "large.json" }] } },
    },
    resolutionOrder: [
      { $ref: "#/sets/base" },
      { $ref: "#/sets/extra" },
      { $ref: "#/modifiers/theme" },
      { $ref: "#/modifiers/size" },
    ],
  });

  it("groups each modifier's whole files, without set files", () => {
    expect(modifierFiles(themes)).toEqual([
      ["light.json", "dark.json", "high-contrast.json"],
      ["small.json", "large.json"],
    ]);
  });

  it("leaves out a file a set also lists whole", () => {
    const both = resolver({
      sets: { base: { sources: [{ $ref: "light.json" }] } },
      modifiers: {
        theme: { contexts: { light: [{ $ref: "light.json" }], dark: [{ $ref: "dark.json" }] } },
      },
      resolutionOrder: [{ $ref: "#/sets/base" }, { $ref: "#/modifiers/theme" }],
    });
    expect(modifierFiles(both)).toEqual([["dark.json"]]);
  });

  it("does not report a path only the contexts of one modifier define", () => {
    const groups = modifierFiles(themes);
    expect(findPathCollisions(files("light.json", "dark.json"), groups)).toEqual([]);
    // Layered inside one context: the resolver orders dark, then high contrast.
    expect(findPathCollisions(files("dark.json", "high-contrast.json"), groups)).toEqual([]);
  });

  it("still reports a set file and a context file defining the same path", () => {
    const groups = modifierFiles(themes);
    expect(findPathCollisions(files("base.json", "light.json", "dark.json"), groups)).toEqual([
      { path: "x", files: ["base.json", "light.json", "dark.json"] },
    ]);
    // The winner is a context: only the set file it overrides is reported.
    expect(findPathCollisions(files("dark.json", "light.json", "base.json"), groups)).toEqual([
      { path: "x", files: ["dark.json", "base.json"] },
    ]);
  });

  it("still reports two set files, two modifiers, or a file outside the resolver", () => {
    const groups = modifierFiles(themes);
    for (const pair of [
      ["base.json", "extra.json"],
      ["light.json", "small.json"],
      ["light.json", "other.json"],
    ])
      expect(findPathCollisions(files(...pair), groups)).toEqual([{ path: "x", files: pair }]);
  });

  it("reports nothing for examples/09-resolver", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "../../examples/09-resolver");
    const read = (rel: string) => readFileSync(join(dir, rel), "utf8");
    const labels = [
      "base.tokens.json",
      "components.tokens.json",
      "theme/dark.tokens.json",
      "theme/high-contrast.tokens.json",
      "theme/light.tokens.json",
    ];
    const example = labels.map((label) => ({ label, model: parseTokens(read(label)) }));
    expect(findPathCollisions(example)).not.toEqual([]);
    const groups = modifierFiles(parseResolver(read("tokens.resolver.json")).resolver!);
    expect(findPathCollisions(example, groups)).toEqual([]);
  });
});
