import { describe, it, expect } from "vitest";
import { dimensionConversions } from "../../src/core/units";

describe("dimensionConversions", () => {
  it("converts px to rem and pt at a 16px root", () => {
    const d = dimensionConversions({ value: 24, unit: "px" });
    expect(d).toEqual({ px: "24px", rem: "1.5rem", pt: "18pt" });
  });

  it("converts rem to px and pt", () => {
    const d = dimensionConversions({ value: 1.5, unit: "rem" });
    expect(d).toEqual({ px: "24px", rem: "1.5rem", pt: "18pt" });
  });

  it("honors a custom root font size", () => {
    const d = dimensionConversions({ value: 20, unit: "px" }, 10);
    expect(d!.rem).toBe("2rem");
  });

  it("keeps 4 decimals, enough for a 1px rem, and trims trailing zeros", () => {
    expect(dimensionConversions({ value: 1, unit: "px" })!.rem).toBe("0.0625rem");
    expect(dimensionConversions({ value: 13, unit: "px" })!.rem).toBe("0.8125rem");
    expect(dimensionConversions({ value: 1, unit: "px" }, 12)!.rem).toBe("0.0833rem");
  });

  it("rejects non-dimension values", () => {
    expect(dimensionConversions("16px")).toBeNull();
    expect(dimensionConversions({ value: "16", unit: "px" })).toBeNull();
    expect(dimensionConversions({ value: 16, unit: "em" })).toBeNull();
  });
});
