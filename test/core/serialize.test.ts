import { describe, it, expect } from "vitest"
import {
  setTokenProperty,
  computeAddEdits,
  computeSetEdits,
  computeReorderEdits,
} from "../../src/core/serialize"
import { applyEdits } from "jsonc-parser"

const doc = `{
  "color": {
    "$type": "color",
    "brand": {
      "primary": { "$value": "#3b82f6", "$description": "brand" }
    }
  }
}`

describe("format-preserving writes", () => {
  it("changes only the targeted value, preserving surrounding formatting", () => {
    const next = setTokenProperty(
      doc,
      ["color", "brand", "primary"],
      "$value",
      "#ef4444",
    )
    expect(next).toContain('"$value": "#ef4444"')
    expect(next).toContain('"$description": "brand"') // untouched
    // Indentation and key order preserved -> the line count is identical.
    expect(next.split("\n").length).toBe(doc.split("\n").length)
  })

  it("produces a minimal edit set (surgical, not full-rewrite)", () => {
    const edits = computeSetEdits(
      doc,
      ["color", "brand", "primary"],
      "$value",
      "#ef4444",
    )
    expect(edits.length).toBeGreaterThan(0)
    // The edit should be far smaller than the whole document.
    const total = edits.reduce((n, e) => n + e.length, 0)
    expect(total).toBeLessThan(doc.length)
  })

  it("can add a new property without disturbing others", () => {
    const next = setTokenProperty(
      doc,
      ["color", "brand", "primary"],
      "$description",
      "updated",
    )
    expect(next).toContain('"$description": "updated"')
    expect(next).toContain('"$value": "#3b82f6"')
  })
})

describe("computeReorderEdits", () => {
  const text = `{
  "space": {
    "$type": "dimension", // keep me here
    "sm": { "$value": { "value": 8, "unit": "px" } },
    "md": { "$value": { "value": 16, "unit": "px" } }, /* mid */
    "$description": "scale",
    "lg": { "$value": { "value": 24, "unit": "px" } }
  }
}`

  it("permutes non-$ children in place and leaves $-properties and formatting alone", () => {
    const out = applyEdits(
      text,
      computeReorderEdits(text, ["space"], ["lg", "sm", "md"]),
    )
    const keys = Object.keys(
      JSON.parse(out.replace(/\/\/.*$/gm, "").replace(/\/\*.*?\*\//g, ""))
        .space,
    )
    expect(keys).toEqual(["$type", "lg", "sm", "$description", "md"])
    expect(out).toContain("// keep me here")
    expect(out).toContain("/* mid */")
    expect(out.split("\n").length).toBe(text.split("\n").length)
  })

  it("refuses an order that is not a permutation of the children", () => {
    expect(computeReorderEdits(text, ["space"], ["sm", "md"])).toEqual([])
    expect(computeReorderEdits(text, ["space"], ["sm", "md", "xl"])).toEqual([])
  })

  it("is a no-op for the current order", () => {
    expect(computeReorderEdits(text, ["space"], ["sm", "md", "lg"])).toEqual([])
  })
})

describe("core model fixes — edits keep the file's own formatting", () => {
  const changed = (before: string, after: string) => {
    const a = before.split(/\r?\n/)
    return after.split(/\r?\n/).filter(line => !a.includes(line))
  }

  it("writes tabs in a tab-indented file and leaves untouched lines alone", () => {
    const tab = `{\n\t"color": {\n\t\t"red": {\n\t\t\t"$type": "number",\n\t\t\t"$value": 1\n\t\t}\n\t}\n}`
    const set = setTokenProperty(tab, ["color", "red"], "$description", "x")
    expect(set).toBe(
      `{\n\t"color": {\n\t\t"red": {\n\t\t\t"$type": "number",\n\t\t\t"$value": 1,\n\t\t\t"$description": "x"\n\t\t}\n\t}\n}`,
    )
    const added = applyEdits(
      tab,
      computeAddEdits(tab, ["color"], "blue", { $value: 0 }),
    )
    expect(changed(tab, added)).toEqual([
      `\t\t},`,
      `\t\t"blue": {`,
      `\t\t\t"$value": 0`,
    ])
  })

  it("writes 4-space indentation in a 4-space file", () => {
    const four = `{\n    "color": {\n        "red": {\n            "$value": 1\n        }\n    }\n}`
    const added = applyEdits(
      four,
      computeAddEdits(four, ["color"], "blue", { $value: 0 }),
    )
    expect(changed(four, added)).toEqual([
      `        },`,
      `        "blue": {`,
      `            "$value": 0`,
    ])
    const set = setTokenProperty(four, ["color", "red"], "$value", {
      value: 1,
      unit: "px",
    })
    expect(changed(four, set)).toEqual([
      `            "$value": {`,
      `                "value": 1,`,
      `                "unit": "px"`,
      `            }`,
    ])
  })

  it("keeps a CRLF file's line endings", () => {
    const crlf = `{\r\n  "a": {\r\n    "$value": 1\r\n  }\r\n}`
    const set = setTokenProperty(crlf, ["a"], "$description", "x")
    expect(set).toBe(
      `{\r\n  "a": {\r\n    "$value": 1,\r\n    "$description": "x"\r\n  }\r\n}`,
    )
  })

  it("keeps a one-line token on one line when a property is added or removed", () => {
    const text = `{\n  "a": { "$type": "number", "$value": 1, "$description": "x" },\n  "b": { "$value": 2 }\n}`
    expect(setTokenProperty(text, ["a"], "$description", undefined)).toBe(
      `{\n  "a": { "$type": "number", "$value": 1 },\n  "b": { "$value": 2 }\n}`,
    )
    expect(setTokenProperty(text, ["a"], "$type", undefined)).toBe(
      `{\n  "a": { "$value": 1, "$description": "x" },\n  "b": { "$value": 2 }\n}`,
    )
    expect(setTokenProperty(text, ["b"], "$deprecated", true)).toBe(
      `{\n  "a": { "$type": "number", "$value": 1, "$description": "x" },\n  "b": { "$value": 2, "$deprecated": true }\n}`,
    )
    expect(
      setTokenProperty(text, ["b"], "$extensions", { "com.x": { y: 1 } }),
    ).toBe(
      `{\n  "a": { "$type": "number", "$value": 1, "$description": "x" },\n  "b": { "$value": 2, "$extensions": { "com.x": { "y": 1 } } }\n}`,
    )
  })
})
