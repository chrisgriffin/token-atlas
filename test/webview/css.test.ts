import { describe, it, expect } from "vitest";
import { dim, familyCss, shadowCss, weightCss, weightKeyword } from "../../src/webview/lib/css";

describe("familyCss", () => {
  it("quotes names and appends a generic fallback when the stack has none", () => {
    expect(familyCss("Inter")).toBe('"Inter", system-ui, sans-serif');
    expect(familyCss(["Helvetica Neue", "Arial"])).toBe(
      '"Helvetica Neue", "Arial", system-ui, sans-serif',
    );
  });
  it("leaves a stack that already ends in a generic family alone", () => {
    expect(familyCss(["Inter", "system-ui", "sans-serif"])).toBe('"Inter", system-ui, sans-serif');
    expect(familyCss(["Georgia", "serif"])).toBe('"Georgia", serif');
  });
  it("returns undefined for no usable names", () => {
    expect(familyCss(undefined)).toBeUndefined();
    expect(familyCss(["", 3])).toBeUndefined();
  });
});

describe("font weights", () => {
  it("maps keywords to the DTCG numeric weight", () => {
    expect(weightCss("semi-bold")).toBe(600);
    expect(weightCss("extra-black")).toBe(950);
    expect(weightCss(350)).toBe(350);
    expect(weightCss("heavyish")).toBeUndefined();
  });
  it("names a numeric weight with its first keyword, and nothing in between", () => {
    expect(weightKeyword(700)).toBe("bold");
    expect(weightKeyword(400)).toBe("normal");
    expect(weightKeyword(450)).toBeUndefined();
  });
});

describe("scaled lengths", () => {
  it("scales dimensions and every shadow length but not the color", () => {
    expect(dim({ value: 8, unit: "px" }, 0.25)).toBe("2px");
    expect(
      shadowCss(
        {
          color: "#000000",
          offsetX: { value: 0, unit: "px" },
          offsetY: { value: 4, unit: "px" },
          blur: { value: 12, unit: "px" },
          spread: { value: -2, unit: "px" },
        },
        0.5,
      ),
    ).toBe("0px 2px 6px -1px #000000");
  });
});
