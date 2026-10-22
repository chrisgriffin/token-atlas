import { describe, it, expect } from "vitest";
import { tokenFileName } from "../../src/core/fileName";

describe("tokenFileName", () => {
  it("adds the DTCG extension to a bare name", () => {
    expect(tokenFileName("colors")).toEqual({ name: "colors.tokens.json" });
  });

  it("normalises any token or JSON extension to one .tokens.json", () => {
    for (const input of ["colors.json", "colors.tokens.json", "colors.tokens", "  colors  "]) {
      expect(tokenFileName(input)).toEqual({ name: "colors.tokens.json" });
    }
  });

  it("keeps dots inside the name", () => {
    expect(tokenFileName("brand.a")).toEqual({ name: "brand.a.tokens.json" });
  });

  it("rejects an empty name", () => {
    for (const input of ["", "   ", ".json", ".tokens.json"]) {
      expect(tokenFileName(input)).toHaveProperty("error");
    }
  });

  it("rejects characters a filename can't hold, path separators included", () => {
    for (const input of [
      "a/b",
      "a\\b",
      "a:b",
      "a*b",
      "a?b",
      'a"b',
      "a<b",
      "a>b",
      "a|b",
      "a\u0001b",
    ]) {
      expect(tokenFileName(input)).toHaveProperty("error");
    }
  });
});
