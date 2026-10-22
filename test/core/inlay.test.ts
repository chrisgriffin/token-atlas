/**
 * The one-line label an inlay hint shows after a `{reference}`: the value the
 * reference finally resolves to, short enough to sit inside a line of JSON.
 */
import { describe, expect, it } from "vitest";
import { inlayValue } from "../../src/core";

const srgb = (r: number, g: number, b: number, alpha?: number) => ({
  colorSpace: "srgb",
  components: [r, g, b],
  ...(alpha === undefined ? {} : { alpha }),
});
const px = (value: number) => ({ value, unit: "px" });

describe("inlayValue", () => {
  it("writes a color inside sRGB as hex, with alpha when it has one", () => {
    expect(inlayValue(srgb(0, 0.333, 1), "color")).toBe("#0055ff");
    expect(inlayValue(srgb(0, 0.333, 1, 0.5), "color")).toBe("#0055ff80");
    // A wide-gamut space whose value sits inside sRGB is still a plain hex.
    expect(inlayValue({ colorSpace: "display-p3", components: [0.5, 0.5, 0.5] })).toBe("#808080");
  });

  it("writes a color outside sRGB in its own space, not a clipped hex", () => {
    expect(inlayValue({ colorSpace: "display-p3", components: [0, 1, 0] }, "color")).toBe(
      "color(display-p3 0 1 0)",
    );
    expect(inlayValue({ colorSpace: "oklch", components: [0.7, 0.3, 150] }, "color")).toBe(
      "oklch(70% 0.3 150)",
    );
  });

  it("writes primitives in their short form", () => {
    expect(inlayValue(px(16), "dimension")).toBe("16px");
    expect(inlayValue({ value: 200, unit: "ms" }, "duration")).toBe("200ms");
    expect(inlayValue(400, "fontWeight")).toBe("400");
    expect(inlayValue("bold", "fontWeight")).toBe("bold");
    expect(inlayValue([0.4, 0, 0.2, 1], "cubicBezier")).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
    expect(inlayValue(["Inter", "sans-serif"], "fontFamily")).toBe("Inter, sans-serif");
  });

  it("abbreviates composites to a CSS-like line", () => {
    const shadow = {
      color: srgb(0, 0, 0),
      offsetX: px(0),
      offsetY: px(1),
      blur: px(2),
      spread: px(0),
    };
    expect(inlayValue(shadow, "shadow")).toBe("0px 1px 2px 0px #000000");
    expect(inlayValue([shadow, { ...shadow, inset: true }], "shadow")).toBe(
      "0px 1px 2px 0px #000000 +1",
    );
    expect(
      inlayValue(
        { fontFamily: ["Inter", "sans-serif"], fontSize: px(16), fontWeight: 700, lineHeight: 1.5 },
        "typography",
      ),
    ).toBe("700 16px/1.5 Inter");
    expect(inlayValue({ color: srgb(0, 0, 0), width: px(1), style: "solid" }, "border")).toBe(
      "1px solid #000000",
    );
    expect(
      inlayValue(
        {
          duration: { value: 200, unit: "ms" },
          delay: { value: 0, unit: "ms" },
          timingFunction: [0.4, 0, 0.2, 1],
        },
        "transition",
      ),
    ).toBe("200ms cubic-bezier(0.4, 0, 0.2, 1) 0ms");
    expect(
      inlayValue(
        [
          { color: srgb(0, 0, 0), position: 0 },
          { color: srgb(1, 1, 1), position: 1 },
        ],
        "gradient",
      ),
    ).toBe("#000000 → #ffffff");
  });

  it("truncates a long value with an ellipsis", () => {
    const out = inlayValue("x".repeat(80));
    expect(out).toHaveLength(40);
    expect(out.endsWith("…")).toBe(true);
  });
});
