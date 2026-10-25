import { describe, it, expect } from "vitest"
import {
  exportCompletionContext,
  exportName,
  learnPrefix,
  memberCompletions,
} from "../../src/core/exportNames"

const KEYS = [
  "color.brand.primary",
  "color.base.white",
  "space.md",
  "font.sizeBase",
]

describe("exportCompletionContext", () => {
  it.each([
    ["  background: var(--col", "css", "--", 18],
    ["  --", "css", "--", 2],
    ['const v = "var(--', "typescript", "--", 15],
    ["  color: $col", "scss", "$", 9],
    ["  color: @", "less", "@", 9],
  ])("finds %j in %s", (line, lang, sigil, start) => {
    expect(exportCompletionContext(line, lang)).toEqual({
      kind: "sigil",
      sigil,
      start,
    })
  })

  it("finds an object path in JS/TS and replaces after its last dot", () => {
    expect(
      exportCompletionContext("bg: tokens.color.ba", "typescript"),
    ).toEqual({
      kind: "member",
      chain: ["tokens", "color"],
      start: 17,
    })
  })

  it.each([
    ["i--", "javascript"],
    ["a--b", "css"],
    ["  color: $x", "css"],
    ["  color: @x", "scss"],
    ["tokens.color.", "css"],
    ["colorBrand", "typescript"],
    ["  margin: 0 ", "css"],
  ])("stays out of %j in %s", (line, lang) => {
    expect(exportCompletionContext(line, lang)).toBeUndefined()
  })
})

describe("exportName", () => {
  it("kebabs the path, camelCase segments included, behind sigil and prefix", () => {
    expect(exportName("color.brand.primary", "--")).toBe(
      "--color-brand-primary",
    )
    expect(exportName("font.sizeBase", "$", "ds-")).toBe("$ds-font-size-base")
  })
})

describe("learnPrefix", () => {
  it("learns the prefix from a name already in the file", () => {
    expect(
      learnPrefix("a { color: var(--ds-color-brand-primary); }", "--", KEYS),
    ).toBe("ds-")
    expect(learnPrefix("$acme-space-md: 4px;", "$", KEYS)).toBe("acme-")
  })

  it("is empty with no prefix, or no token names at all", () => {
    expect(learnPrefix("--color-base-white: #fff;", "--", KEYS)).toBe("")
    expect(learnPrefix("--gutter: 4px;", "--", KEYS)).toBe("")
  })
})

describe("memberCompletions", () => {
  it("offers the paths under a group, whatever the root object is called", () => {
    expect(
      memberCompletions(["tokens", "color"], KEYS).map(e => e.insert),
    ).toEqual(["brand.primary", "base.white"])
    expect(
      memberCompletions(["theme", "tokens", "color", "base"], KEYS),
    ).toEqual([{ key: "color.base.white", insert: "white" }])
  })

  it("offers nothing for a root alone or an unrelated object", () => {
    expect(memberCompletions(["tokens"], KEYS)).toEqual([])
    expect(memberCompletions(["console"], KEYS)).toEqual([])
  })
})
