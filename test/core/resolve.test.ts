import { describe, it, expect } from "vitest"
import { parseTokens } from "../../src/core/parse"
import { indexTokens, resolveAliases } from "../../src/core/resolve"
import { validate } from "../../src/core/validate"
import type { TokenNode } from "../../src/core/types"

describe("resolveAliases", () => {
  it("resolves an alias to its referent's value and type", () => {
    const model = parseTokens(
      JSON.stringify({
        color: {
          $type: "color",
          base: {
            blue: { $value: { colorSpace: "srgb", components: [0, 0, 1] } },
          },
          brand: { primary: { $value: "{color.base.blue}" } },
        },
      }),
    )
    const index = resolveAliases(model)
    const primary = index.get("color.brand.primary")!
    expect(primary.resolvedType).toBe("color")
    expect(primary.resolvedValue).toEqual({
      colorSpace: "srgb",
      components: [0, 0, 1],
    })
  })

  it("detects cycles and reports them via validate", () => {
    const model = parseTokens(
      JSON.stringify({
        a: { $type: "number", x: { $value: "{a.y}" }, y: { $value: "{a.x}" } },
      }),
    )
    resolveAliases(model)
    const result = validate(model)
    const messages = result.issues.map(i => i.message).join(" | ")
    expect(messages).toMatch(/cycle/i)
  })

  it("flags dangling references", () => {
    const model = parseTokens(
      JSON.stringify({ a: { $type: "number", x: { $value: "{a.nope}" } } }),
    )
    resolveAliases(model)
    const result = validate(model)
    expect(
      result.issues.some(i => /Unresolved reference/.test(i.message)),
    ).toBe(true)
  })
})

describe("resolveAliases — references inside composite sub-values", () => {
  const black = { colorSpace: "srgb", components: [0, 0, 0], hex: "#000000" }

  it("substitutes a reference in a composite object sub-value", () => {
    const model = parseTokens(
      JSON.stringify({
        color: { $type: "color", black: { $value: black } },
        shadow: {
          card: {
            $type: "shadow",
            $value: {
              color: "{color.black}",
              offsetX: { value: 0, unit: "px" },
              offsetY: { value: 2, unit: "px" },
              blur: { value: 4, unit: "px" },
              spread: { value: 0, unit: "px" },
            },
          },
        },
      }),
    )
    const index = resolveAliases(model)
    const shadow = index.get("shadow.card")!
    expect(shadow.isAlias).toBe(false)
    const resolved = shadow.resolvedValue as {
      color: unknown
      offsetY: unknown
    }
    expect(resolved.color).toEqual(black)
    expect(resolved.offsetY).toEqual({ value: 2, unit: "px" })
  })

  it("substitutes references inside an array sub-value (gradient stops)", () => {
    const model = parseTokens(
      JSON.stringify({
        color: {
          $type: "color",
          a: {
            $value: {
              colorSpace: "srgb",
              components: [1, 0, 0],
              hex: "#ff0000",
            },
          },
          b: {
            $value: {
              colorSpace: "srgb",
              components: [0, 0, 1],
              hex: "#0000ff",
            },
          },
        },
        gradient: {
          brand: {
            $type: "gradient",
            $value: [
              { color: "{color.a}", position: 0 },
              { color: "{color.b}", position: 1 },
            ],
          },
        },
      }),
    )
    const index = resolveAliases(model)
    const stops = index.get("gradient.brand")!.resolvedValue as Array<{
      color: { hex: string }
    }>
    expect(stops[0].color).toMatchObject({ hex: "#ff0000" })
    expect(stops[1].color).toMatchObject({ hex: "#0000ff" })
  })

  it("follows an alias chain from inside a composite", () => {
    const model = parseTokens(
      JSON.stringify({
        color: {
          $type: "color",
          base: { $value: black },
          ink: { $value: "{color.base}" },
        },
        shadow: {
          card: {
            $type: "shadow",
            $value: { color: "{color.ink}", blur: { value: 1, unit: "px" } },
          },
        },
      }),
    )
    const index = resolveAliases(model)
    const resolved = index.get("shadow.card")!.resolvedValue as {
      color: unknown
    }
    expect(resolved.color).toEqual(black)
  })

  it("preserves a dangling sub-reference verbatim and flags it", () => {
    const model = parseTokens(
      JSON.stringify({
        shadow: {
          card: {
            $type: "shadow",
            $value: {
              color: "{color.missing}",
              blur: { value: 1, unit: "px" },
            },
          },
        },
      }),
    )
    const index = resolveAliases(model)
    const resolved = index.get("shadow.card")!.resolvedValue as {
      color: string
    }
    expect(resolved.color).toBe("{color.missing}")
    const result = validate(model)
    expect(result.issues.some(i => i.message.includes("{color.missing}"))).toBe(
      true,
    )
  })

  it("preserves a sub-reference caught in a cycle without looping", () => {
    const model = parseTokens(
      JSON.stringify({
        a: { $type: "color", x: { $value: "{a.y}" }, y: { $value: "{a.x}" } },
        shadow: {
          card: {
            $type: "shadow",
            $value: { color: "{a.x}", blur: { value: 1, unit: "px" } },
          },
        },
      }),
    )
    const index = resolveAliases(model)
    const resolved = index.get("shadow.card")!.resolvedValue as {
      color: string
    }
    expect(resolved.color).toBe("{a.x}")
  })

  it("resolves a sub-reference against an external (cross-file) index", () => {
    const primitives = parseTokens(
      JSON.stringify({ color: { $type: "color", black: { $value: black } } }),
    )
    const external = new Map<string, TokenNode>(indexTokens(primitives))

    const model = parseTokens(
      JSON.stringify({
        shadow: {
          card: {
            $type: "shadow",
            $value: { color: "{color.black}", blur: { value: 1, unit: "px" } },
          },
        },
      }),
    )
    const index = resolveAliases(model, external)
    const resolved = index.get("shadow.card")!.resolvedValue as {
      color: unknown
    }
    expect(resolved.color).toEqual(black)
  })
})

describe("local scope", () => {
  // A Tokens Studio theme turns whole sets off. A set it disables defines
  // nothing — including for references written in the same file, which
  // local-first resolution would otherwise happily satisfy.
  const doc = () =>
    parseTokens(
      JSON.stringify({
        light: { surface: { $type: "number", $value: 1 } },
        semantic: { page: { $type: "number", $value: "{light.surface}" } },
      }),
    )

  it("resolves a local reference when no scope is given", () => {
    const index = resolveAliases(doc())
    expect(index.get("semantic.page")?.resolvedValue).toBe(1)
  })

  it("leaves a reference into an out-of-scope key unresolved", () => {
    const index = resolveAliases(doc(), undefined, key =>
      key.startsWith("semantic."),
    )
    expect(index.get("semantic.page")?.resolvedValue).toBeUndefined()
  })

  it("still resolves through an external definition of the same key", () => {
    const external = new Map([
      [
        "light.surface",
        {
          kind: "token",
          name: "surface",
          path: ["light", "surface"],
          typeIsInherited: false,
          value: 2,
          isAlias: false,
        } as never,
      ],
    ])
    const index = resolveAliases(doc(), external, key =>
      key.startsWith("semantic."),
    )
    expect(index.get("semantic.page")?.resolvedValue).toBe(2)
  })
})

describe("core model fixes — an alias's type", () => {
  it("is its target's resolved type, not its group's, when it declares none (§5.2.2)", () => {
    const index = resolveAliases(
      parseTokens(
        JSON.stringify({
          base: { ratio: { $type: "number", $value: 1.5 } },
          spacing: { $type: "dimension", ratio: { $value: "{base.ratio}" } },
          chain: { $type: "color", hop: { $value: "{spacing.ratio}" } },
          own: { $type: "dimension", $value: "{base.ratio}" },
          dangling: { $type: "dimension", x: { $value: "{nowhere}" } },
        }),
      ),
    )
    expect(index.get("spacing.ratio")!.resolvedType).toBe("number")
    expect(index.get("chain.hop")!.resolvedType).toBe("number")
    // A declared $type still wins, and a group type is the fallback when the target has none.
    expect(index.get("own")!.resolvedType).toBe("dimension")
    expect(index.get("dangling.x")!.resolvedType).toBe("dimension")
  })
})
