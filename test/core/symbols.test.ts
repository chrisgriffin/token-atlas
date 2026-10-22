import { describe, expect, it } from "vitest";
import { fuzzyMatches } from "../../src/core";

describe("fuzzyMatches", () => {
  it("matches a dotted path, a substring and an in-order subsequence, ignoring case", () => {
    expect(fuzzyMatches("color.brand.primary", "color.brand.primary")).toBe(true);
    expect(fuzzyMatches("brand", "color.brand.primary")).toBe(true);
    expect(fuzzyMatches("cbp", "color.brand.primary")).toBe(true);
    expect(fuzzyMatches("BRAND.Primary", "color.brand.primary")).toBe(true);
  });

  it("matches everything on an empty query", () => {
    expect(fuzzyMatches("", "space.4")).toBe(true);
  });

  it("rejects characters out of order or absent", () => {
    expect(fuzzyMatches("pbc", "color.brand.primary")).toBe(false);
    expect(fuzzyMatches("brandz", "color.brand.primary")).toBe(false);
    expect(fuzzyMatches("color.brand.primary.x", "color.brand.primary")).toBe(false);
  });
});
