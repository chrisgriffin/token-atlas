import { describe, it, expect } from "vitest";
import { setTokenProperty, computeSetEdits, computeReorderEdits } from "../../src/core/serialize";
import { applyEdits } from "jsonc-parser";

const doc = `{
  "color": {
    "$type": "color",
    "brand": {
      "primary": { "$value": "#3b82f6", "$description": "brand" }
    }
  }
}`;

describe("format-preserving writes", () => {
  it("changes only the targeted value, preserving surrounding formatting", () => {
    const next = setTokenProperty(doc, ["color", "brand", "primary"], "$value", "#ef4444");
    expect(next).toContain('"$value": "#ef4444"');
    expect(next).toContain('"$description": "brand"'); // untouched
    // Indentation and key order preserved -> the line count is identical.
    expect(next.split("\n").length).toBe(doc.split("\n").length);
  });

  it("produces a minimal edit set (surgical, not full-rewrite)", () => {
    const edits = computeSetEdits(doc, ["color", "brand", "primary"], "$value", "#ef4444");
    expect(edits.length).toBeGreaterThan(0);
    // The edit should be far smaller than the whole document.
    const total = edits.reduce((n, e) => n + e.length, 0);
    expect(total).toBeLessThan(doc.length);
  });

  it("can add a new property without disturbing others", () => {
    const next = setTokenProperty(doc, ["color", "brand", "primary"], "$description", "updated");
    expect(next).toContain('"$description": "updated"');
    expect(next).toContain('"$value": "#3b82f6"');
  });
});

describe("computeReorderEdits", () => {
  const text = `{
  "space": {
    "$type": "dimension", // keep me here
    "sm": { "$value": { "value": 8, "unit": "px" } },
    "md": { "$value": { "value": 16, "unit": "px" } }, /* mid */
    "$description": "scale",
    "lg": { "$value": { "value": 24, "unit": "px" } }
  }
}`;

  it("permutes non-$ children in place and leaves $-properties and formatting alone", () => {
    const out = applyEdits(text, computeReorderEdits(text, ["space"], ["lg", "sm", "md"]));
    const keys = Object.keys(
      JSON.parse(out.replace(/\/\/.*$/gm, "").replace(/\/\*.*?\*\//g, "")).space,
    );
    expect(keys).toEqual(["$type", "lg", "sm", "$description", "md"]);
    expect(out).toContain("// keep me here");
    expect(out).toContain("/* mid */");
    expect(out.split("\n").length).toBe(text.split("\n").length);
  });

  it("refuses an order that is not a permutation of the children", () => {
    expect(computeReorderEdits(text, ["space"], ["sm", "md"])).toEqual([]);
    expect(computeReorderEdits(text, ["space"], ["sm", "md", "xl"])).toEqual([]);
  });

  it("is a no-op for the current order", () => {
    expect(computeReorderEdits(text, ["space"], ["sm", "md", "lg"])).toEqual([]);
  });
});
