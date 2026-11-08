import { describe, it, expect } from "vitest"
import { tokenReferenceAtOffset } from "../../src/core/parse"
import { indexTokens } from "../../src/core/resolve"
import { parseTokens } from "../../src/core/parse"

// Helpers to build JSON and locate a substring's offset.
function offsetOf(text: string, needle: string): number {
  const i = text.indexOf(needle)
  if (i === -1) throw new Error(`"${needle}" not found in text`)
  return i + 1 // place cursor one char inside the string
}

const SIMPLE_DOC = JSON.stringify({
  color: {
    $type: "color",
    base: { blue: { $value: { colorSpace: "srgb", components: [0, 0, 1] } } },
    brand: { primary: { $value: "{color.base.blue}" } },
  },
})

const COMPOSITE_DOC = JSON.stringify({
  shadow: {
    default: {
      $type: "shadow",
      $value: { color: "{color.ink}", offsetX: 0, offsetY: 2, blur: 4 },
    },
  },
  color: {
    $type: "color",
    ink: { $value: { colorSpace: "srgb", components: [0, 0, 0] } },
  },
})

describe("tokenReferenceAtOffset — simple $value reference", () => {
  it("returns the reference path when cursor is inside a whole-value reference string", () => {
    const ref = tokenReferenceAtOffset(
      SIMPLE_DOC,
      offsetOf(SIMPLE_DOC, "{color.base.blue}"),
    )
    expect(ref).toBe("color.base.blue")
  })

  it("returns undefined when cursor is inside a non-reference $value string", () => {
    const doc = JSON.stringify({ size: { sm: { $value: "not-a-reference" } } })
    const ref = tokenReferenceAtOffset(doc, offsetOf(doc, "not-a-reference"))
    expect(ref).toBeUndefined()
  })

  it("returns undefined when cursor is on a $type string (outside $value context)", () => {
    const doc = JSON.stringify({
      color: { $type: "color", x: { $value: "foo" } },
    })
    const ref = tokenReferenceAtOffset(doc, offsetOf(doc, "color"))
    expect(ref).toBeUndefined()
  })
})

describe("tokenReferenceAtOffset — reference embedded in composite $value", () => {
  it("returns the reference path when cursor is inside a reference nested in a composite value", () => {
    const ref = tokenReferenceAtOffset(
      COMPOSITE_DOC,
      offsetOf(COMPOSITE_DOC, "{color.ink}"),
    )
    expect(ref).toBe("color.ink")
  })

  it("returns undefined when cursor is on a non-reference primitive inside a composite value", () => {
    // cursor on the number 2 inside offsetY — not a reference string
    const ref = tokenReferenceAtOffset(
      COMPOSITE_DOC,
      COMPOSITE_DOC.indexOf('"offsetY"'),
    )
    expect(ref).toBeUndefined()
  })
})

describe("tokenReferenceAtOffset — resolved vs. not found via index lookup", () => {
  it("extracted path resolves to a known token in the local index", () => {
    const ref = tokenReferenceAtOffset(
      SIMPLE_DOC,
      offsetOf(SIMPLE_DOC, "{color.base.blue}"),
    )
    expect(ref).toBe("color.base.blue")
    const index = indexTokens(parseTokens(SIMPLE_DOC))
    expect(index.has(ref!)).toBe(true)
  })

  it("extracted path is not found when the reference points to a non-existent token", () => {
    const doc = JSON.stringify({
      color: { brand: { primary: { $value: "{color.does.not.exist}" } } },
    })
    const ref = tokenReferenceAtOffset(
      doc,
      offsetOf(doc, "{color.does.not.exist}"),
    )
    expect(ref).toBe("color.does.not.exist")
    const index = indexTokens(parseTokens(doc))
    expect(index.has(ref!)).toBe(false)
  })
})

describe("tokenReferenceAtOffset — non-DTCG JSON no-ops", () => {
  it("returns undefined when the JSON has no $value keys at all", () => {
    const doc = JSON.stringify({ name: "hello", value: "{something}" })
    const ref = tokenReferenceAtOffset(doc, offsetOf(doc, "{something}"))
    expect(ref).toBeUndefined()
  })
})
