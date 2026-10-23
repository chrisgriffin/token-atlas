import { describe, it, expect } from "vitest";
import { parseInline } from "../../src/webview/lib/inline";
import type { EditorSettings } from "../../src/shared/protocol";

describe("parseInline", () => {
  it("reads an alias for any type", () => {
    expect(parseInline("{colors.srgb}", "dimension", undefined)).toBe("{colors.srgb}");
  });
  it("reads a hex into the token's current color space", () => {
    const v = parseInline("#ff0000", "color", { colorSpace: "display-p3", components: [0, 0, 0] });
    expect(v).toMatchObject({ colorSpace: "display-p3" });
    expect(parseInline("nope", "color", undefined)).toBeUndefined();
  });
  it("falls back to the configured colour space when the token has none", () => {
    const s: EditorSettings = {
      rootFontSize: 16,
      defaultColorSpace: "oklch",
      defaultDimensionUnit: "px",
      contrastTarget: "AA",
      modeView: "single",
    };
    expect(parseInline("#ff0000", "color", undefined, s)).toMatchObject({ colorSpace: "oklch" });
  });
  it("reads dimensions and durations with their units", () => {
    expect(parseInline("32px", "dimension", undefined)).toEqual({ value: 32, unit: "px" });
    expect(parseInline("1.5 rem", "dimension", undefined)).toEqual({ value: 1.5, unit: "rem" });
    expect(parseInline("32em", "dimension", undefined)).toBeUndefined();
    expect(parseInline("300ms", "duration", undefined)).toEqual({ value: 300, unit: "ms" });
  });
  it("reads numbers, weights, families, and beziers", () => {
    expect(parseInline("1.25", "number", undefined)).toBe(1.25);
    expect(parseInline("abc", "number", undefined)).toBeUndefined();
    expect(parseInline("700", "fontWeight", undefined)).toBe(700);
    expect(parseInline("semi-bold", "fontWeight", undefined)).toBe("semi-bold");
    expect(parseInline("Inter, sans-serif", "fontFamily", undefined)).toEqual([
      "Inter",
      "sans-serif",
    ]);
    expect(parseInline("Inter", "fontFamily", undefined)).toBe("Inter");
    expect(parseInline("cubic-bezier(0.4, 0, 0.2, 1)", "cubicBezier", undefined)).toEqual([
      0.4, 0, 0.2, 1,
    ]);
    expect(parseInline("0.4, 0, 0.2", "cubicBezier", undefined)).toBeUndefined();
  });
  it("takes JSON for composites and plain text for untyped tokens", () => {
    expect(parseInline('{"width":{"value":1,"unit":"px"}}', "border", undefined)).toEqual({
      width: { value: 1, unit: "px" },
    });
    expect(parseInline("not json", "border", undefined)).toBeUndefined();
    expect(parseInline("mystery", undefined, undefined)).toBe("mystery");
  });
});

describe("parseInline strokeStyle", () => {
  it("reads a keyword, or a custom stroke as JSON, and refuses anything else (#8)", () => {
    expect(parseInline("dotted", "strokeStyle", "dashed")).toBe("dotted");
    expect(parseInline('{"dashArray":[],"lineCap":"round"}', "strokeStyle", "solid")).toEqual({
      dashArray: [],
      lineCap: "round",
    });
    expect(parseInline("wavy", "strokeStyle", "solid")).toBeUndefined();
  });
});
