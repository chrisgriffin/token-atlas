import { describe, it, expect } from "vitest";
import { applyEdits } from "jsonc-parser";
import { computeLegacyFixes, upgradeLegacyValue } from "../../src/core";

describe("upgradeLegacyValue", () => {
  it("converts a hex color to an sRGB object with its hex", () => {
    expect(upgradeLegacyValue("color", "#ff0000")).toEqual({
      colorSpace: "srgb",
      components: [1, 0, 0],
      hex: "#ff0000",
    });
  });

  it("keeps alpha from an 8-digit hex", () => {
    expect(upgradeLegacyValue("color", "#ff000080")).toMatchObject({ alpha: 0.502 });
  });

  it("reads rgb() as sRGB", () => {
    expect(upgradeLegacyValue("color", "rgb(0 128 255)")).toMatchObject({
      colorSpace: "srgb",
      hex: "#0080ff",
    });
  });

  it("keeps a color in its own space when DTCG has it", () => {
    expect(upgradeLegacyValue("color", "oklch(0.6 0.15 250)")).toMatchObject({
      colorSpace: "oklch",
      components: [0.6, 0.15, 250],
    });
  });

  it("splits dimensions and durations into value and unit", () => {
    expect(upgradeLegacyValue("dimension", "16px")).toEqual({ value: 16, unit: "px" });
    expect(upgradeLegacyValue("dimension", "1.5rem")).toEqual({ value: 1.5, unit: "rem" });
    expect(upgradeLegacyValue("dimension", "-.5rem")).toEqual({ value: -0.5, unit: "rem" });
    expect(upgradeLegacyValue("duration", "200ms")).toEqual({ value: 200, unit: "ms" });
    expect(upgradeLegacyValue("duration", "0.3s")).toEqual({ value: 0.3, unit: "s" });
  });

  it("leaves what it cannot read, references and already-valid values alone", () => {
    expect(upgradeLegacyValue("dimension", "16em")).toBeUndefined();
    expect(upgradeLegacyValue("duration", "200px")).toBeUndefined();
    expect(upgradeLegacyValue("color", "not a colour")).toBeUndefined();
    expect(upgradeLegacyValue("color", "{color.brand}")).toBeUndefined();
    expect(upgradeLegacyValue("dimension", { value: 16, unit: "px" })).toBeUndefined();
    expect(upgradeLegacyValue("number", "16px")).toBeUndefined();
    expect(upgradeLegacyValue(undefined, "16px")).toBeUndefined();
  });
});

describe("computeLegacyFixes", () => {
  const text = `{
    "color": {
        "$type": "color",
        "brand":  { "$value": "#3b82f6", "$description": "kept" },
        "alias":  { "$value": "{color.brand}" },
        "done":   { "$value": { "colorSpace": "srgb", "components": [0, 0, 0] } }
    },
    "space": { "$type": "dimension", "sm": { "$value": "8px" }, "odd": { "$value": "2em" } },
    "motion": {
        "fast": {
            "$type": "duration",
            "$value": "200ms"
        }
    }
}
`;

  it("finds one fix per convertible token, and none for the rest", () => {
    expect(computeLegacyFixes(text).map((f) => f.path.join("."))).toEqual([
      "color.brand",
      "space.sm",
      "motion.fast",
    ]);
  });

  it("changes only the $value bytes, on their own lines", () => {
    const fixes = computeLegacyFixes(text);
    const out = applyEdits(
      text,
      fixes.map((f) => f.edit),
    );
    const before = text.split("\n");
    const after = out.split("\n");
    expect(after).toHaveLength(before.length);
    const changed = before.flatMap((line, i) => (line === after[i] ? [] : [i]));
    expect(changed.map((i) => after[i].trim())).toEqual([
      '"brand":  { "$value": { "colorSpace": "srgb", "components": [0.2314, 0.5098, 0.9647], "hex": "#3b82f6" }, "$description": "kept" },',
      '"space": { "$type": "dimension", "sm": { "$value": { "value": 8, "unit": "px" } }, "odd": { "$value": "2em" } },',
      '"$value": { "value": 200, "unit": "ms" }',
    ]);
  });

  it("gives each fix the span of its token, for matching a cursor", () => {
    const fix = computeLegacyFixes(text).find((f) => f.path.join(".") === "motion.fast")!;
    const span = text.slice(fix.span.offset, fix.span.offset + fix.span.length);
    expect(span.startsWith('"fast": {')).toBe(true);
    expect(span.endsWith("}")).toBe(true);
  });

  it("returns nothing for text that is not JSON", () => {
    expect(computeLegacyFixes("not json")).toEqual([]);
  });
});
