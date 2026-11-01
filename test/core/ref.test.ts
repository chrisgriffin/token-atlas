/**
 * `$ref` JSON Pointer references in token files, DTCG Format Module 2025.10
 * §6.6.2 and §7. Each case is one of the spec's own examples, cited by number.
 */
import { describe, it, expect } from "vitest"
import { applyEdits } from "jsonc-parser"
import {
  parsePointer,
  parseTokens,
  tokenReferenceAtOffset,
} from "../../src/core/parse"
import {
  collectReferences,
  indexTokens,
  resolveAliases,
} from "../../src/core/resolve"
import { validate } from "../../src/core/validate"
import {
  computeReferenceRenameEdits,
  computeRenameEdits,
} from "../../src/core/serialize"
import { hoverMarkdown } from "../../src/core/hover"
import type { TokenNode } from "../../src/core/types"

function resolve(doc: unknown, external?: Map<string, TokenNode>) {
  const model = parseTokens(JSON.stringify(doc))
  const index = resolveAliases(model, external)
  return { model, index, issues: validate(model, external).issues }
}

const blue = {
  $type: "color",
  $value: { colorSpace: "srgb", components: [0.2, 0.4, 0.9], hex: "#3366e6" },
}

describe("parsePointer", () => {
  it("splits at the first $-segment and unescapes ~0 and ~1 (§7.4.1)", () => {
    expect(parsePointer("#/colors/blue/$value/components/0")).toEqual({
      key: "colors.blue",
      sub: ["$value", "components", "0"],
    })
    expect(parsePointer("#/my~1group/a~0b")).toEqual({
      key: "my/group.a~b",
      sub: [],
    })
    expect(parsePointer("other.json#/a")).toBeUndefined()
    expect(parsePointer("#/")).toBeUndefined()
  })
})

describe("$ref (§7.1.2, §7.3)", () => {
  it("aliases a whole token with #/x (Example 21) and #/x/$value (Example 32)", () => {
    const { index, issues } = resolve({
      base: blue,
      alias: { $ref: "#/base" },
      semantic: { primary: { $ref: "#/base/$value", $type: "color" } },
    })
    for (const key of ["alias", "semantic.primary"]) {
      const t = index.get(key)!
      expect(t.isAlias).toBe(true)
      expect(t.reference).toBe("base")
      expect(t.resolvedValue).toMatchObject({ hex: "#3366e6" })
      expect(t.resolvedType).toBe("color")
    }
    expect(issues).toEqual([])
  })

  it("reads one component of a color (Example 32's primaryHue)", () => {
    const { index, issues } = resolve({
      colors: { blue },
      semantic: {
        primaryHue: {
          $ref: "#/colors/blue/$value/components/0",
          $type: "number",
        },
      },
    })
    expect(index.get("semantic.primaryHue")!.resolvedValue).toBe(0.2)
    expect(issues).toEqual([])
  })

  it("builds a color from another's components (Example 35)", () => {
    const { index, issues } = resolve({
      base: { blue },
      semantic: {
        primary: {
          $type: "color",
          $value: {
            colorSpace: "srgb",
            components: [
              { $ref: "#/base/blue/$value/components/0" },
              { $ref: "#/base/blue/$value/components/1" },
              0.7,
            ],
            hex: "#3366b3",
          },
        },
      },
    })
    expect(index.get("semantic.primary")!.resolvedValue).toMatchObject({
      components: [0.2, 0.4, 0.7],
    })
    expect(issues).toEqual([])
  })

  it("borrows a dimension's value or unit (Example 36)", () => {
    const { index, issues } = resolve({
      base: {
        spacing: { $value: { value: 16, unit: "px" }, $type: "dimension" },
      },
      layout: {
        small: {
          $type: "dimension",
          $value: {
            value: { $ref: "#/base/spacing/$value/value" },
            unit: "rem",
          },
        },
        large: {
          $type: "dimension",
          $value: { value: 32, unit: { $ref: "#/base/spacing/$value/unit" } },
        },
      },
    })
    expect(index.get("layout.small")!.resolvedValue).toEqual({
      value: 16,
      unit: "rem",
    })
    expect(index.get("layout.large")!.resolvedValue).toEqual({
      value: 32,
      unit: "px",
    })
    expect(issues).toEqual([])
  })

  it("shares typography sub-values (Example 37)", () => {
    const { index } = resolve({
      base: {
        text: {
          $type: "typography",
          $value: {
            fontFamily: ["Helvetica", "Arial", "sans-serif"],
            fontSize: { value: 16, unit: "px" },
            fontWeight: 400,
            lineHeight: 1.5,
          },
        },
      },
      headings: {
        h1: {
          $type: "typography",
          $value: {
            fontFamily: { $ref: "#/base/text/$value/fontFamily" },
            fontSize: { value: 32, unit: "px" },
            fontWeight: 700,
            lineHeight: { $ref: "#/base/text/$value/lineHeight" },
          },
        },
      },
    })
    expect(index.get("headings.h1")!.resolvedValue).toMatchObject({
      fontFamily: ["Helvetica", "Arial", "sans-serif"],
      lineHeight: 1.5,
    })
  })

  it("resolves into another file, local first, and lists the target as a reference", () => {
    const external = indexTokens(parseTokens(JSON.stringify({ base: blue })))
    const { index, issues } = resolve(
      { hue: { $ref: "#/base/$value/hex", $type: "fontFamily" } },
      external,
    )
    expect(index.get("hue")!.resolvedValue).toBe("#3366e6")
    expect(issues).toEqual([])
    expect(collectReferences(index.get("hue")!.value)).toEqual(["base"])
  })

  it("reports a dangling token, a missing property, a cycle and a bad pointer (§7.4.5)", () => {
    const { issues } = resolve({
      base: blue,
      dangling: { $ref: "#/nope/$value", $type: "color" },
      property: { $ref: "#/base/$value/components/9", $type: "number" },
      a: { $ref: "#/b" },
      b: { $ref: "#/a" },
      bad: { $type: "number", $value: { $ref: "base" } },
      file: { $type: "number", $value: { $ref: "other.tokens.json#/base" } },
    })
    const by = (key: string) =>
      issues.filter(i => i.path.join(".") === key).map(i => i.message)
    expect(by("dangling")).toEqual(["Unresolved reference: {nope}"])
    expect(by("property")).toEqual([
      "Unresolved reference: #/base/$value/components/9 (no value at that path, or a reference cycle).",
    ])
    expect(by("a")).toEqual(["Reference cycle detected starting at {b}"])
    expect(by("bad")[0]).toMatch(/^Invalid \$ref "base"/)
    expect(by("file")[0]).toMatch(
      /^Unsupported \$ref "other\.tokens\.json#\/base"/,
    )
  })

  it("finds the referenced path under the cursor in a $ref string", () => {
    const text =
      '{ "x": { "$value": { "a": { "$ref": "#/base/$value" } } }, "y": { "$ref": "#/base" } }'
    expect(
      tokenReferenceAtOffset(text, text.indexOf("#/base/$value") + 2),
    ).toBe("base")
    expect(tokenReferenceAtOffset(text, text.lastIndexOf("#/base") + 2)).toBe(
      "base",
    )
  })

  it("renames rewrite pointers, keeping the property path and escaping", () => {
    const text = JSON.stringify(
      {
        base: blue,
        x: { $type: "number", $value: { $ref: "#/base/$value/components/0" } },
      },
      null,
      2,
    )
    const out = JSON.parse(
      applyEdits(text, computeRenameEdits(text, ["base"], "a/b")),
    )
    expect(out.x.$value.$ref).toBe("#/a~1b/$value/components/0")
    const user = '{ "y": { "$ref": "#/base" } }'
    expect(
      applyEdits(user, computeReferenceRenameEdits(user, "base", "brand")),
    ).toBe('{ "y": { "$ref": "#/brand" } }')
  })

  it("hovers a color whose components come from $ref with its resolved swatch", () => {
    const { index } = resolve({
      base: { blue },
      c: {
        $type: "color",
        $value: {
          colorSpace: "srgb",
          components: [{ $ref: "#/base/blue/$value/components/0" }, 0, 0],
        },
      },
    })
    const t = index.get("c")!
    const md = hoverMarkdown({
      ...t,
      isAlias: false,
      resolvedComposite: t.resolvedValue,
      rootPx: 16,
    })
    expect(md).toContain("#330000")
  })
})
