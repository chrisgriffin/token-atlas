import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import {
  inputIssues,
  looksLikeResolver,
  parseResolver,
  inlineSources,
  pointerTarget,
  resolutionCount,
  resolutionSources,
  resolutions,
} from "../../src/core/resolver"

const example = readFileSync(
  "examples/09-resolver/tokens.resolver.json",
  "utf8",
)

/** A minimal valid document with `extra` merged over it. */
const doc = (extra: Record<string, unknown>) =>
  JSON.stringify({ version: "2025.10", resolutionOrder: [], ...extra })

const messages = (text: string) =>
  parseResolver(text).issues.map(i => i.message)

describe("parseResolver: the example", () => {
  const { resolver, issues } = parseResolver(example)

  it("reads cleanly", () => {
    expect(issues).toEqual([])
    expect(resolver?.name).toBe("Example app")
  })

  it("offers one resolution per context, the default first", () => {
    expect(resolutions(resolver!).map(r => r.label)).toEqual([
      "theme: light",
      "theme: dark",
      "theme: darkHighContrast",
    ])
  })

  it("lists a resolution's sources in resolution order, sets before the modifier", () => {
    expect(resolutionSources(resolver!, { theme: "darkHighContrast" })).toEqual(
      [
        "base.tokens.json",
        "components.tokens.json",
        "#/sets/layout/sources/0",
        "theme/dark.tokens.json",
        "theme/high-contrast.tokens.json",
      ],
    )
    expect(resolutionSources(resolver!, {})).toEqual([
      "base.tokens.json",
      "components.tokens.json",
      "#/sets/layout/sources/0",
      "theme/light.tokens.json",
    ])
  })
})

describe("resolutions", () => {
  it("is the product of every modifier's contexts", () => {
    const { resolver } = parseResolver(
      doc({
        modifiers: {
          theme: { contexts: { light: [], dark: [] } },
          size: { contexts: { sm: [], md: [], lg: [] } },
        },
        resolutionOrder: [
          { $ref: "#/modifiers/theme" },
          { $ref: "#/modifiers/size" },
        ],
      }),
    )
    const all = resolutions(resolver!)
    expect(all).toHaveLength(6)
    expect(all[0]).toEqual({
      input: { theme: "light", size: "sm" },
      label: "theme: light · size: sm",
    })
  })

  it("is a single unlabelled resolution when there are no modifiers", () => {
    const { resolver } = parseResolver(
      doc({ resolutionOrder: [{ type: "set", name: "a", sources: [] }] }),
    )
    expect(resolutions(resolver!)).toEqual([{ input: {}, label: "" }])
  })
})

describe("resolutionSources", () => {
  it("expands a set referenced from a modifier context, in place", () => {
    const { resolver, issues } = parseResolver(
      doc({
        sets: { base: { sources: [{ $ref: "base.json" }] } },
        modifiers: {
          size: {
            contexts: {
              small: [{ $ref: "#/sets/base" }, { $ref: "mobile.json" }],
              large: [{ $ref: "#/sets/base" }, { $ref: "desktop.json" }],
            },
          },
        },
        resolutionOrder: [{ $ref: "#/modifiers/size" }],
      }),
    )
    expect(issues).toEqual([])
    expect(resolutionSources(resolver!, { size: "small" })).toEqual([
      "base.json",
      "mobile.json",
    ])
  })

  it("keeps a repeated file only at its last position, where it wins", () => {
    const { resolver } = parseResolver(
      doc({
        resolutionOrder: [
          {
            type: "set",
            name: "a",
            sources: [{ $ref: "x.json" }, { $ref: "y.json" }],
          },
          { type: "set", name: "b", sources: [{ $ref: "x.json" }] },
        ],
      }),
    )
    expect(resolutionSources(resolver!, {})).toEqual(["y.json", "x.json"])
  })

  it("takes an empty context as contributing nothing", () => {
    const { resolver } = parseResolver(
      doc({
        modifiers: {
          debug: { contexts: { false: [], true: [{ $ref: "debug.json" }] } },
        },
        resolutionOrder: [{ $ref: "#/modifiers/debug" }],
      }),
    )
    expect(resolutionSources(resolver!, { debug: "false" })).toEqual([])
    expect(resolutionSources(resolver!, { debug: "true" })).toEqual([
      "debug.json",
    ])
  })
})

describe("parseResolver: validation", () => {
  it("requires a version the spec names, and a resolutionOrder", () => {
    expect(messages("{}")).toEqual([
      `"version" is required: "2025.10".`,
      `"resolutionOrder" is required and must be an array.`,
    ])
    expect(messages(doc({ version: "2024-01-01" }))).toEqual([
      `"version" must be "2025.10".`,
    ])
  })

  it("reports a JSON syntax error at its offset", () => {
    const [issue] = parseResolver('{"version": }').issues
    expect(issue.message).toMatch(/^JSON syntax error/)
    expect(issue.offset).toBeTypeOf("number")
  })

  it("rejects a modifier with no contexts, warns on one, and checks its default", () => {
    expect(
      messages(
        doc({
          modifiers: {
            none: { contexts: {} },
            one: { contexts: { only: [] } },
            bad: { contexts: { a: [], b: [] }, default: "c" },
          },
        }),
      ),
    ).toEqual([
      `Modifier "none" has no contexts.`,
      `Modifier "one" has one context; a set says the same thing.`,
      `"default" must name one of the contexts of "bad".`,
    ])
  })

  it("rejects references to modifiers, into resolutionOrder, and to missing sets", () => {
    expect(
      messages(
        doc({
          sets: {
            a: {
              sources: [
                { $ref: "#/modifiers/theme" },
                { $ref: "#/resolutionOrder/0" },
                { $ref: "#/sets/missing" },
              ],
            },
          },
        }),
      ),
    ).toEqual([
      "A set or modifier must not reference a modifier.",
      "Nothing may reference an item in resolutionOrder.",
      `No set named "missing".`,
    ])
  })

  it("rejects a set that includes itself, once", () => {
    const { issues } = parseResolver(
      doc({
        sets: {
          a: { sources: [{ $ref: "#/sets/b" }] },
          b: { sources: [{ $ref: "#/sets/a" }] },
        },
        resolutionOrder: [{ $ref: "#/sets/a" }],
      }),
    )
    expect(
      issues.every(
        i => i.severity === "error" && i.message.startsWith("Circular"),
      ),
    ).toBe(true)
    expect(issues.length).toBeGreaterThan(0)
  })

  it("requires a name and a type on inline items, and unique names", () => {
    expect(
      messages(
        doc({
          resolutionOrder: [
            { sources: [] },
            { type: "set", name: "a", sources: [] },
            { type: "set", name: "a", sources: [] },
          ],
        }),
      ),
    ).toEqual([
      `An inline item needs a "name" and a "type" of "set" or "modifier".`,
      `Duplicate name "a" in resolutionOrder.`,
    ])
  })

  it("reads inline tokens, file fragments and same-document pointers as sources", () => {
    const { resolver, issues } = parseResolver(
      doc({
        sets: {
          s: { sources: [{ size: { sm: { $type: "number", $value: 4 } } }] },
        },
        resolutionOrder: [
          {
            type: "set",
            name: "a",
            sources: [
              { color: { red: { $type: "color", $value: "#f00" } } },
              { $ref: "part.json#/color" },
              { $ref: "spec-style.json#sets/MySet" },
              { $ref: "#/sets/s/sources/0" },
              { $ref: "kept.json" },
            ],
          },
        ],
      }),
    )
    expect(issues).toEqual([])
    expect(resolutionSources(resolver!, {})).toEqual([
      "#/resolutionOrder/0/sources/0",
      "part.json#/color",
      "spec-style.json#/sets/MySet",
      "#/sets/s/sources/0",
      "kept.json",
    ])
  })

  it("skips a remote reference, with a warning that says why", () => {
    const { resolver, issues } = parseResolver(
      doc({
        resolutionOrder: [
          {
            type: "set",
            name: "a",
            sources: [{ $ref: "https://example.com/tokens.json" }],
          },
        ],
      }),
    )
    expect(issues.map(i => i.severity)).toEqual(["warning"])
    expect(issues[0].message).toMatch(/^Remote references are not supported/)
    expect(resolutionSources(resolver!, {})).toEqual([])
  })

  it("points each issue at the offending value", () => {
    const { issues } = parseResolver(
      doc({ sets: { a: { sources: [{ $ref: "#/sets/nope" }] } } }),
    )
    expect(issues[0].path).toEqual(["sets", "a", "sources", 0, "$ref"])
  })
})

describe("looksLikeResolver", () => {
  it("is true for a resolver document and false for a token file", () => {
    expect(looksLikeResolver(example)).toBe(true)
    expect(looksLikeResolver(`{"color":{"$value":"#fff"}}`)).toBe(false)
  })
})

describe("inputIssues", () => {
  const { resolver } = parseResolver(
    doc({
      modifiers: {
        theme: { contexts: { light: [], dark: [] }, default: "light" },
        size: { contexts: { sm: [], lg: [] } },
      },
      resolutionOrder: [
        { $ref: "#/modifiers/theme" },
        { $ref: "#/modifiers/size" },
      ],
    }),
  )

  it("accepts every resolution the picker offers, and a defaulted modifier left out", () => {
    for (const r of resolutions(resolver!))
      expect(inputIssues(resolver!, r.input)).toEqual([])
    expect(inputIssues(resolver!, { size: "lg" })).toEqual([])
  })

  it("rejects a modifier or context the resolver does not have", () => {
    expect(inputIssues(resolver!, { size: "sm", mode: "x" })).toEqual([
      'No modifier named "mode".',
    ])
    expect(inputIssues(resolver!, { size: "sm", theme: "sepia" })).toEqual([
      'Modifier "theme" has no context "sepia".',
    ])
  })

  it("rejects a modifier left out that has no default", () => {
    expect(inputIssues(resolver!, {})).toEqual([
      'Modifier "size" needs a context: it has no default.',
    ])
  })
})

describe("inlineSources", () => {
  it("lists each inline source once, at an offset that maps back into the document", () => {
    const text = doc({
      sets: { s: { sources: [{ a: { $value: 1 } }, { $ref: "f.json" }] } },
      modifiers: {
        m: { contexts: { x: [{ b: { $value: 2 } }] }, default: "x" },
      },
      resolutionOrder: [
        { $ref: "#/sets/s" },
        { type: "set", name: "t", sources: [{ $ref: "#/sets/s/sources/0" }] },
        { $ref: "#/modifiers/m" },
      ],
    })
    const found = inlineSources(text)
    expect(found.map(s => s.path)).toEqual([
      ["sets", "s", "sources", 0],
      ["modifiers", "m", "contexts", "x", 0],
    ])
    for (const s of found)
      expect(text.slice(s.offset, s.offset + s.text.length)).toBe(s.text)
  })

  it("is empty for a document that is not a resolver", () => {
    expect(inlineSources("{}")).toEqual([])
  })
})

describe("pointerTarget", () => {
  const text = JSON.stringify({
    sets: { s: { sources: [{ a: { $value: 1 } }] } },
    "x/y": {},
  })

  it("finds an object by JSON pointer, through arrays and escapes", () => {
    const hit = pointerTarget(text, "/sets/s/sources/0")
    expect(JSON.parse(hit!.text)).toEqual({ a: { $value: 1 } })
    expect(hit!.path).toEqual(["sets", "s", "sources", 0])
    expect(pointerTarget(text, "/x~1y")?.path).toEqual(["x/y"])
  })

  it("is undefined for a missing path or a non-object", () => {
    expect(pointerTarget(text, "/sets/nope")).toBeUndefined()
    expect(pointerTarget(text, "/sets/s/sources/0/a/$value")).toBeUndefined()
  })
})

describe("resolutionCount", () => {
  it("multiplies the contexts of every modifier without listing them", () => {
    const { resolver } = parseResolver(example)
    expect(resolutionCount(resolver!)).toBe(resolutions(resolver!).length)
  })
})

describe("core model fixes — resolver documents", () => {
  it('accepts "version": "2025.10" (§4.1.2), and the older date forms without a message', () => {
    expect(messages(doc({ version: "2025.10" }))).toEqual([])
    expect(messages(doc({ version: "2025-11-01" }))).toEqual([])
    expect(messages(doc({ version: "2025-10-01" }))).toEqual([])
  })

  it("finds a modifier referenced by an RFC 6901 escaped name", () => {
    const { resolver, issues } = parseResolver(
      doc({
        modifiers: { "a/b~c": { contexts: { x: [], y: [] } } },
        resolutionOrder: [{ $ref: "#/modifiers/a~1b~0c" }],
      }),
    )
    expect(issues).toEqual([])
    expect(resolver!.modifiers.map(m => m.name)).toEqual(["a/b~c"])
  })
})

describe("core model fixes — a modifier listed twice", () => {
  it("is one choice in the picker, not a product with itself", () => {
    const { resolver } = parseResolver(
      doc({
        modifiers: { theme: { contexts: { light: [], dark: [] } } },
        resolutionOrder: [
          { $ref: "#/modifiers/theme" },
          { $ref: "#/modifiers/theme" },
        ],
      }),
    )
    expect(resolutions(resolver!).map(r => r.label)).toEqual([
      "theme: light",
      "theme: dark",
    ])
    expect(resolutionCount(resolver!)).toBe(2)
  })
})
