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

  it("drops trailing dots, so the extension follows the name with one dot", () => {
    expect(tokenFileName("a.")).toEqual({ name: "a.tokens.json" });
    expect(tokenFileName("brand.. ")).toEqual({ name: "brand.tokens.json" });
    expect(tokenFileName("..")).toHaveProperty("error");
  });

  it("rejects a name Windows reserves for a device", () => {
    for (const input of ["CON", "con", "nul", "COM1", "lpt9", "aux.json", "prn.tokens.json"]) {
      expect(tokenFileName(input), input).toHaveProperty("error");
    }
    expect(tokenFileName("console")).toEqual({ name: "console.tokens.json" });
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
