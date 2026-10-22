import { describe, it, expect } from "vitest";
import {
  CONTRAST_TARGETS,
  meetsContrast,
  toContrastTarget,
  wcagContrast,
} from "../../src/core/color";
import { hoverMarkdown } from "../../src/core/hover";

describe("CONTRAST_TARGETS", () => {
  it("covers every WCAG 2.2 contrast threshold", () => {
    expect(
      Object.fromEntries(Object.entries(CONTRAST_TARGETS).map(([k, v]) => [k, v.min])),
    ).toEqual({
      AA: 4.5,
      "AA-large": 3,
      AAA: 7,
      "AAA-large": 4.5,
      "non-text": 3,
    });
  });
});

describe("toContrastTarget", () => {
  it("keeps every listed target", () => {
    for (const target of Object.keys(CONTRAST_TARGETS)) {
      expect(toContrastTarget(target)).toBe(target);
    }
  });

  it.each([["aa"], ["AA large"], [""], [undefined], [null], [7], ["toString"]])(
    "falls back to AA for %j",
    (value) => {
      expect(toContrastTarget(value)).toBe("AA");
    },
  );
});

describe("meetsContrast", () => {
  it.each([
    ["AA", 4.5, 4.49],
    ["AA-large", 3, 2.99],
    ["AAA", 7, 6.99],
    ["AAA-large", 4.5, 4.49],
    ["non-text", 3, 2.99],
  ] as const)("%s passes at %d and fails just under", (target, at, under) => {
    expect(meetsContrast(at, target)).toBe(true);
    expect(meetsContrast(under, target)).toBe(false);
  });

  it("never rounds a ratio just under a threshold up to a pass", () => {
    // #118a11 on white is 4.4995:1: rounding would show 4.5 and pass AA.
    const ratio = wcagContrast("#118a11", "#ffffff")!;
    expect(ratio).toBe(4.49);
    expect(meetsContrast(ratio, "AA")).toBe(false);
    expect(wcagContrast("#000000", "#ffffff")).toBe(21);
  });
});

describe("hover contrast verdict", () => {
  const hover = (contrastTarget?: string) =>
    hoverMarkdown({
      rootPx: 16,
      isAlias: false,
      name: "grey",
      path: ["color", "grey"],
      type: "color",
      value: "#767676",
      contrastTarget: contrastTarget as keyof typeof CONTRAST_TARGETS | undefined,
    });

  it("judges against AA by default", () => {
    const md = hover();
    expect(md).toContain("WCAG AA (4.5:1)");
    expect(md).toMatch(/4\.54:1 on white<\/span>&nbsp;\$\(pass\)/);
    expect(md).toMatch(/4\.62:1 on black<\/span>&nbsp;\$\(pass\)/);
  });

  it("judges against the configured target", () => {
    const md = hover("AAA");
    expect(md).toContain("WCAG AAA (7:1)");
    expect(md).toMatch(/4\.54:1 on white<\/span>&nbsp;\$\(error\)/);
    expect(md).toMatch(/4\.62:1 on black<\/span>&nbsp;\$\(error\)/);
  });

  it("judges a hand-typed value outside the list against AA instead of throwing", () => {
    const md = hover("AA large");
    expect(md).toContain("WCAG AA (4.5:1)");
    expect(md).toMatch(/4\.54:1 on white<\/span>&nbsp;\$\(pass\)/);
  });
});
