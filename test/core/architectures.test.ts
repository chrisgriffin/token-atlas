/**
 * Architecture coverage: each fixture under test/fixtures/architectures models
 * a token setup found in the wild, and these tests pin down how the core
 * parses, resolves, and validates each one.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseTokens } from "../../src/core/parse";
import { indexTokens, resolveAliases } from "../../src/core/resolve";
import { validate } from "../../src/core/validate";
import type { TokenNode } from "../../src/core/types";

const here = dirname(fileURLToPath(import.meta.url));
const load = (rel: string) =>
  parseTokens(readFileSync(join(here, "../fixtures/architectures", rel), "utf8"));

/** Parse + resolve a file against optional external files (multi-file setups). */
function resolveFile(rel: string, externalRels: string[] = []) {
  const external = new Map<string, TokenNode>();
  for (const ext of externalRels) {
    for (const [key, token] of indexTokens(load(ext))) {
      if (!external.has(key)) external.set(key, token);
    }
  }
  const model = load(rel);
  const index = resolveAliases(model, external);
  const validation = validate(model, external);
  return { model, index, validation, external };
}

// ---------------------------------------------------------------------------
describe("01 single flat file", () => {
  it("parses categories with inherited types and validates clean", () => {
    const { index, validation } = resolveFile("01-single-flat/tokens.json");
    expect(index.size).toBe(5);
    expect(index.get("space.md")!.type).toBe("dimension");
    expect(index.get("space.md")!.typeIsInherited).toBe(true);
    expect(validation.issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("02 tiered (primitive → semantic → component)", () => {
  it("resolves component tokens through the full chain", () => {
    const { index } = resolveFile("02-tiered/tokens.json");
    const buttonBg = index.get("component.button.background")!;
    expect(buttonBg.isAlias).toBe(true);
    expect(buttonBg.resolvedValue).toEqual({
      colorSpace: "srgb",
      components: [0.231, 0.51, 0.965],
      hex: "#3b82f6",
    });
    // type flows from the primitive's group all the way up
    expect(buttonBg.resolvedType).toBe("color");
    expect(index.get("component.button.padding")!.resolvedValue).toEqual({
      value: 16,
      unit: "px",
    });
  });

  it("validates clean — aliases without declared $type inherit from referents", () => {
    const { validation } = resolveFile("02-tiered/tokens.json");
    expect(validation.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("03 split by category (cross-file references)", () => {
  it("resolves a reference into a sibling category file", () => {
    const { index } = resolveFile("03-by-category/typography.tokens.json", [
      "03-by-category/color.tokens.json",
    ]);
    expect(index.get("type.link-color")!.resolvedValue).toMatchObject({ hex: "#3b82f6" });
  });

  it("flags the same reference as unresolved without the sibling file", () => {
    const { validation } = resolveFile("03-by-category/typography.tokens.json");
    expect(validation.issues.some((i) => /Unresolved/.test(i.message))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("04 theming (shared primitives + light/dark)", () => {
  it("the same semantic path resolves differently per theme file", () => {
    const light = resolveFile("04-theming/light.tokens.json", [
      "04-theming/primitives.tokens.json",
    ]);
    const dark = resolveFile("04-theming/dark.tokens.json", ["04-theming/primitives.tokens.json"]);
    expect(light.index.get("theme.background")!.resolvedValue).toMatchObject({
      hex: "#ffffff",
    });
    expect(dark.index.get("theme.background")!.resolvedValue).toMatchObject({
      hex: "#0f172a",
    });
    expect(light.validation.issues).toHaveLength(0);
    expect(dark.validation.issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("05 multi-brand (identical paths across files)", () => {
  it("each brand resolves against its own local definitions first", () => {
    // Editing brand-a with brand-b in the workspace: local index must win.
    const a = resolveFile("05-multi-brand/brand-a.tokens.json", [
      "05-multi-brand/brand-b.tokens.json",
    ]);
    expect(a.index.get("brand.primary")!.resolvedValue).toMatchObject({ hex: "#3b82f6" });

    const b = resolveFile("05-multi-brand/brand-b.tokens.json", [
      "05-multi-brand/brand-a.tokens.json",
    ]);
    expect(b.index.get("brand.primary")!.resolvedValue).toMatchObject({ hex: "#ef4444" });
  });

  it("documents collision semantics in a combined index: first file wins", () => {
    // This pins the current behavior so a future, smarter strategy (e.g.
    // per-brand scoping) shows up as an intentional test change.
    const external = new Map<string, TokenNode>();
    for (const rel of [
      "05-multi-brand/brand-a.tokens.json",
      "05-multi-brand/brand-b.tokens.json",
    ]) {
      for (const [key, token] of indexTokens(load(rel))) {
        if (!external.has(key)) external.set(key, token);
      }
    }
    expect((external.get("primitive.accent")!.value as { hex: string }).hex).toBe("#3b82f6");
  });
});

// ---------------------------------------------------------------------------
describe("06 Tokens Studio-style export", () => {
  it("ignores $themes/$metadata and parses token sets as groups", () => {
    const { index, validation } = resolveFile("06-tokens-studio/tokens.json");
    expect(index.has("global.color.blue")).toBe(true);
    expect(index.get("semantic.action")!.resolvedValue).toMatchObject({ hex: "#3b82f6" });
    expect(validation.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("07 edge cases", () => {
  const file = "07-edge-cases/tokens.json";

  it("resolves a 3-hop alias chain", () => {
    const { index } = resolveFile(file);
    expect(index.get("deep.d")!.resolvedValue).toMatchObject({ hex: "#000000" });
  });

  it("detects the cycle and reports it once per participant", () => {
    const { index, validation } = resolveFile(file);
    expect(index.get("cycle.x")!.resolvedValue).toBeUndefined();
    expect(validation.issues.filter((i) => /cycle/i.test(i.message)).length).toBeGreaterThan(0);
  });

  it("flags the dangling reference", () => {
    const { validation } = resolveFile(file);
    expect(validation.issues.some((i) => i.message.includes("{does.not.exist}"))).toBe(true);
  });

  it("inherits group $type through deep nesting", () => {
    const { index } = resolveFile(file);
    expect(index.get("inherit.nested.deeper.leaf")!.type).toBe("dimension");
  });

  it("resolves references inside composite sub-values", () => {
    // DTCG allows e.g. a shadow's `color` sub-value to be a reference. The
    // resolver walks the composite and substitutes each nested reference with
    // its resolved value, while leaving the rest of the structure intact.
    const { index } = resolveFile(file);
    const shadow = index.get("composite.shadow.card")!;
    expect(shadow.isAlias).toBe(false);
    const resolved = shadow.resolvedValue as {
      color: { hex: string };
      offsetY: { value: number; unit: string };
    };
    expect(resolved.color).toMatchObject({ hex: "#000000" });
    // Non-reference sub-values are preserved untouched.
    expect(resolved.offsetY).toEqual({ value: 2, unit: "px" });
  });
});

// ---------------------------------------------------------------------------
describe("08 $extends and $ref (component variants over a shared base file)", () => {
  const variants = "08-extends-ref/components.tokens.json";
  const base = ["08-extends-ref/base.tokens.json"];

  it("inherits a group from the base file, overriding one token", () => {
    const { index } = resolveFile(variants, base);
    const text = index.get("button-danger.text")!;
    expect(text.inheritedFrom).toBe("button.text");
    expect(text.resolvedValue).toMatchObject({ hex: "#ffffff" });
    const bg = index.get("button-danger.background")!;
    expect(bg.type).toBe("color"); // from the token it overrides
    expect(bg.resolvedValue).toMatchObject({ components: [0.8, 0.2, 0.2] });
  });

  it("chains $extends and reads a sub-value across files with $ref", () => {
    const { index } = resolveFile(variants, base);
    expect(index.get("button-pill.text")!.inheritedFrom).toBe("button.text");
    expect(index.get("button-pill.radius")!.resolvedValue).toEqual({ value: 4, unit: "rem" });
    expect(index.get("link")!.resolvedValue).toMatchObject({ components: [0.8, 0.2, 0.2] });
  });

  it("validates clean with the base file, and flags the $extends without it", () => {
    expect(resolveFile(variants, base).validation.issues).toEqual([]);
    const alone = resolveFile(variants).validation.issues;
    expect(alone.some((i) => i.message === "Unresolved $extends: no group {button}.")).toBe(true);
  });
});
