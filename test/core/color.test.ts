import { describe, it, expect } from "vitest";
import {
  toRgba01,
  fromRgba01,
  toHex,
  buildFromHex,
  isDtcgColor,
  cssColorStrings,
  wcagContrast,
} from "../../src/core/color";

describe("color conversions", () => {
  it("converts a DTCG sRGB color to RGBA 0..1", () => {
    const rgba = toRgba01({ colorSpace: "srgb", components: [1, 0, 0] });
    expect(rgba).not.toBeNull();
    expect(rgba!.r).toBeCloseTo(1, 3);
    expect(rgba!.g).toBeCloseTo(0, 3);
    expect(rgba!.b).toBeCloseTo(0, 3);
  });

  it("parses a legacy hex string", () => {
    const rgba = toRgba01("#3b82f6");
    expect(rgba).not.toBeNull();
    expect(rgba!.b).toBeGreaterThan(rgba!.r); // blue-ish
  });

  it("round-trips RGBA -> DTCG color in a target space", () => {
    const dtcg = fromRgba01({ r: 0.2, g: 0.4, b: 0.6, a: 1 }, "oklch");
    expect(dtcg).not.toBeNull();
    expect(dtcg!.colorSpace).toBe("oklch");
    expect(isDtcgColor(dtcg)).toBe(true);
    // converting back to sRGB should land near the original
    const back = toRgba01(dtcg!);
    expect(back!.r).toBeCloseTo(0.2, 2);
    expect(back!.g).toBeCloseTo(0.4, 2);
    expect(back!.b).toBeCloseTo(0.6, 2);
  });

  it("builds a DTCG color from hex in display-p3", () => {
    const dtcg = buildFromHex("#ff0000", "display-p3");
    expect(dtcg!.colorSpace).toBe("display-p3");
    expect(dtcg!.hex).toBeTypeOf("string");
  });

  it("returns a hex string for the swatch", () => {
    expect(toHex({ colorSpace: "srgb", components: [0, 0, 0] })).toBe("#000000");
  });

  it("serializes CSS formats with clean rounding", () => {
    const css = cssColorStrings({ colorSpace: "srgb", components: [1, 0, 0] });
    expect(css).not.toBeNull();
    expect(css!.hex).toBe("#ff0000");
    expect(css!.rgb).toBe("rgb(255 0 0)");
    expect(css!.hsl).toBe("hsl(0 100% 50%)");
    expect(css!.hwb).toBe("hwb(0 0% 0%)");
    // oklch keeps 3-decimal chroma but whole-number lightness % and hue
    expect(css!.oklch).toMatch(/^oklch\(\d+% \d+(\.\d{1,3})? \d+\)$/);
  });

  it("appends whole-number alpha percentage when alpha < 1", () => {
    const css = cssColorStrings({ colorSpace: "srgb", components: [0, 0, 1], alpha: 0.5 });
    expect(css!.rgb).toBe("rgb(0 0 255 / 50%)");
    expect(css!.hsl.endsWith("/ 50%)")).toBe(true);
  });

  it("emits 8-digit hex when alpha < 1 (drives the swatch transparency)", () => {
    const css = cssColorStrings({ colorSpace: "srgb", components: [0, 0, 1], alpha: 0.5 });
    expect(css!.hex).toMatch(/^#[0-9a-f]{8}$/);
  });
});

describe("wcagContrast", () => {
  it("returns 21 for black on white and 1 for identical colors", () => {
    expect(wcagContrast("#000000", "#ffffff")).toBe(21);
    expect(wcagContrast("#ffffff", "#000000")).toBe(21);
    expect(wcagContrast("#3b82f6", "#3b82f6")).toBe(1);
  });

  it("accepts DTCG color objects and truncates to 2 decimals", () => {
    const blue = { colorSpace: "srgb", components: [0.231, 0.51, 0.965] };
    const ratio = wcagContrast(blue, "#ffffff");
    expect(ratio).toBeCloseTo(3.68, 1);
    expect(ratio).toBe(Math.floor(ratio! * 100) / 100);
  });

  it("returns null when either side is not a color", () => {
    expect(wcagContrast("nope", "#ffffff")).toBeNull();
    expect(wcagContrast("#ffffff", { value: 4, unit: "px" })).toBeNull();
  });
});
