import { describe, it, expect } from "vitest"
import { applyEdits, modify } from "jsonc-parser"
import { parseTokens } from "../../src/core/parse"
import {
  computeAddEdits,
  computeDeleteEdits,
  computeReferenceRenameEdits,
  computeRenameEdits,
  computeSwapEdits,
  InvalidNameError,
  NameTakenError,
} from "../../src/core/serialize"

const doc = `{
  "color": {
    "$type": "color",
    "a": { "$value": "#111111" },
    "b": { "$value": "#222222" },
    "c": { "$value": "#333333" }
  }
}`

const apply = (text: string, edits: ReturnType<typeof computeAddEdits>) =>
  applyEdits(text, edits)

describe("structural edits", () => {
  it("builds a token set up from an empty file", () => {
    // A new file from "New Token File" is just {}: the visual editor adds a
    // group, then a token inside it, through these same edits.
    const withGroup = apply("{}\n", computeAddEdits("{}\n", [], "color", {}))
    const next = apply(
      withGroup,
      computeAddEdits(withGroup, ["color"], "token", { $value: 0 }),
    )
    const model = parseTokens(next)
    const color = model.root.children.find(c => c.name === "color")
    expect(color?.kind).toBe("group")
    expect(
      color?.kind === "group" && color.children.map(c => [c.name, c.kind]),
    ).toEqual([["token", "token"]])
  })

  it("adds a token under a group", () => {
    const next = apply(
      doc,
      computeAddEdits(doc, ["color"], "d", { $value: "#444444" }),
    )
    expect(next).toContain('"d"')
    expect(next).toContain('"#444444"')
    expect(JSON.parse(next).color.d.$value).toBe("#444444")
  })

  it("deletes a token", () => {
    const next = apply(doc, computeDeleteEdits(doc, ["color", "b"]))
    const parsed = JSON.parse(next)
    expect(parsed.color.b).toBeUndefined()
    expect(parsed.color.a.$value).toBe("#111111")
    expect(parsed.color.c.$value).toBe("#333333")
  })

  it("renames a key while preserving its value and order", () => {
    const next = apply(doc, computeRenameEdits(doc, ["color", "b"], "brand"))
    const parsed = JSON.parse(next)
    expect(parsed.color.brand.$value).toBe("#222222")
    expect(parsed.color.b).toBeUndefined()
    // order preserved: a, brand, c
    expect(Object.keys(parsed.color).filter(k => !k.startsWith("$"))).toEqual([
      "a",
      "brand",
      "c",
    ])
  })

  it("swaps two siblings (move up/down)", () => {
    const next = apply(doc, computeSwapEdits(doc, ["color"], "a", "b"))
    const parsed = JSON.parse(next)
    expect(Object.keys(parsed.color).filter(k => !k.startsWith("$"))).toEqual([
      "b",
      "a",
      "c",
    ])
    // values travel with their keys
    expect(parsed.color.a.$value).toBe("#111111")
    expect(parsed.color.b.$value).toBe("#222222")
  })
})

describe("refuses an existing name", () => {
  it("refuses to add a token under an existing name, leaving the file unchanged", () => {
    expect(() => computeAddEdits(doc, ["color"], "b", { $value: 0 })).toThrow(
      NameTakenError,
    )
    expect(() => computeAddEdits(doc, ["color"], "b", { $value: 0 })).toThrow(
      '"color" already has a token or group named "b".',
    )
  })

  it("refuses to add a group over an existing root name", () => {
    expect(() => computeAddEdits(doc, [], "color", {})).toThrow(NameTakenError)
  })

  it("refuses to rename a token to an existing name a sibling has", () => {
    expect(() => computeRenameEdits(doc, ["color", "a"], "b")).toThrow(
      NameTakenError,
    )
  })

  it("still adds and renames to a free name", () => {
    expect(computeAddEdits(doc, ["color"], "d", { $value: 0 })).not.toEqual([])
    expect(computeRenameEdits(doc, ["color", "a"], "d")).not.toEqual([])
  })
})

describe("rename rewrites references", () => {
  const refsDoc = `{
  "color": {
    "$type": "color",
    "brand": {
      "primary": { "$value": "#3b82f6", "$description": "not a ref: {color.brand.primary}" },
      "accent": { "$value": "{color.brand.primary}" }
    },
    "shadow": {
      "$type": "shadow",
      "$value": { "color": "{color.brand.primary}", "blur": { "value": 4, "unit": "px" } }
    }
  }
}`

  it("renames a token key and every same-document reference, whole-value and nested", () => {
    const next = apply(
      refsDoc,
      computeRenameEdits(refsDoc, ["color", "brand", "primary"], "main"),
    )
    const parsed = JSON.parse(next)
    expect(parsed.color.brand.main.$value).toBe("#3b82f6")
    expect(parsed.color.brand.accent.$value).toBe("{color.brand.main}")
    expect(parsed.color.shadow.$value.color).toBe("{color.brand.main}")
    // $description text is prose, not a reference — untouched.
    expect(parsed.color.brand.main.$description).toBe(
      "not a ref: {color.brand.primary}",
    )
    // Format preserved: same line count.
    expect(next.split("\n").length).toBe(refsDoc.split("\n").length)
  })

  it("renames a group and rewrites references into its descendants", () => {
    const next = apply(
      refsDoc,
      computeRenameEdits(refsDoc, ["color", "brand"], "core"),
    )
    const parsed = JSON.parse(next)
    expect(parsed.color.core.primary.$value).toBe("#3b82f6")
    expect(parsed.color.core.accent.$value).toBe("{color.core.primary}")
    expect(parsed.color.shadow.$value.color).toBe("{color.core.primary}")
  })

  it("does not touch a token whose path merely starts with the renamed name", () => {
    const doc = `{"a": {"$type": "number", "$value": 1}, "ab": {"$type": "number", "$value": "{a}"}, "c": {"$type": "number", "$value": "{ab}"}}`
    const parsed = JSON.parse(apply(doc, computeRenameEdits(doc, ["a"], "z")))
    expect(parsed.z.$value).toBe(1)
    expect(parsed.ab.$value).toBe("{z}")
    expect(parsed.c.$value).toBe("{ab}")
  })

  it("returns no edits when the name is unchanged", () => {
    expect(
      computeRenameEdits(refsDoc, ["color", "brand", "primary"], "primary"),
    ).toEqual([])
  })

  it("rewrites only references in another file (no key to rename there)", () => {
    const theme = `{"theme": {"bg": {"$type": "color", "$value": "{color.brand.primary}"}}}`
    const edits = computeReferenceRenameEdits(
      theme,
      "color.brand.primary",
      "color.brand.main",
    )
    expect(edits).toHaveLength(1)
    expect(JSON.parse(apply(theme, edits)).theme.bg.$value).toBe(
      "{color.brand.main}",
    )
    expect(computeReferenceRenameEdits(theme, "color.other", "x")).toEqual([])
  })
})

describe("rename respects local-first resolution across files", () => {
  it("leaves references alone in a file that defines the renamed path itself", () => {
    // brand-b defines color.brand.primary locally; its {color.brand.primary}
    // resolves to its own token, so renaming brand-a's must not touch it.
    const brandB = `{"color": {"$type": "color", "brand": {"primary": {"$value": "#ef4444"}}, "accent": {"$value": "{color.brand.primary}"}}}`
    expect(
      computeReferenceRenameEdits(
        brandB,
        "color.brand.primary",
        "color.brand.main",
      ),
    ).toEqual([])
  })

  it("skips a file that defines a descendant of a renamed group", () => {
    const other = `{"color": {"$type": "color", "brand": {"x": {"$value": "#000"}}, "y": {"$value": "{color.brand.x}"}}}`
    expect(
      computeReferenceRenameEdits(other, "color.brand", "color.core"),
    ).toEqual([])
  })
})

describe("one-line sibling edits leave the neighbour byte-identical", () => {
  const compact = `{
  "size": {
    "sm": { "$value": 1 },
    "lg": { "$value": 2 }
  }
}
`

  it("adds a token after a one-line sibling without rewriting it", () => {
    const next = apply(
      compact,
      computeAddEdits(compact, ["size"], "xl", { $value: 0 }),
    )
    expect(next).toBe(`{
  "size": {
    "sm": { "$value": 1 },
    "lg": { "$value": 2 },
    "xl": {
      "$value": 0
    }
  }
}
`)
  })

  it("deletes the first of two one-line siblings without rewriting the survivor", () => {
    const next = apply(compact, computeDeleteEdits(compact, ["size", "sm"]))
    expect(next).toBe(`{
  "size": {
    "lg": { "$value": 2 }
  }
}
`)
  })

  it("deletes the last of two one-line siblings without rewriting the survivor", () => {
    const next = apply(compact, computeDeleteEdits(compact, ["size", "lg"]))
    expect(next).toBe(`{
  "size": {
    "sm": { "$value": 1 }
  }
}
`)
  })
})

describe("multi-line files edit exactly as jsonc-parser's formatter does", () => {
  // The behaviour before computeAddEdits and computeDeleteEdits wrote their
  // own edits: jsonc-parser's modify with formatting options.
  const FORMAT = {
    formattingOptions: { tabSize: 2, insertSpaces: true, eol: "\n" },
  }
  const multi = `{
  "color": {
    "$type": "color",
    "a": {
      "$value": "#111111"
    },
    "b": {
      "$value": "#222222"
    },
    "c": {
      "$value": "#333333"
    }
  }
}
`
  const tabbed = multi.replace(/^( +)/gm, m => "\t".repeat(m.length / 2))
  const cases: [string, string, string[], unknown][] = [
    ["add a token", multi, ["color", "d"], { $value: "#444444" }],
    ["add a group", multi, ["color", "d"], {}],
    ["add at the root", multi, ["size"], { sm: { $value: 1 } }],
    [
      "add to an empty group",
      `{\n  "color": {}\n}\n`,
      ["color", "a"],
      { $value: 0 },
    ],
    ["add to an empty file", "{}\n", ["color"], {}],
    ["delete the first token", multi, ["color", "a"], undefined],
    ["delete a middle token", multi, ["color", "b"], undefined],
    ["delete the last token", multi, ["color", "c"], undefined],
    [
      "delete an only child",
      `{\n  "color": {\n    "a": { "$value": 0 }\n  }\n}\n`,
      ["color", "a"],
      undefined,
    ],
  ]
  for (const [name, text, path, value] of cases) {
    it(name, () => {
      const edits =
        value === undefined
          ? computeDeleteEdits(text, path)
          : computeAddEdits(
              text,
              path.slice(0, -1),
              path[path.length - 1],
              value,
            )
      expect(apply(text, edits)).toBe(
        applyEdits(text, modify(text, path, value, FORMAT)),
      )
    })
  }

  it("adds into a tab-indented file with tab formatting", () => {
    const tabs = { tabSize: 4, insertSpaces: false, eol: "\n" }
    const edits = computeAddEdits(
      tabbed,
      ["color"],
      "d",
      { $value: "#444444" },
      tabs,
    )
    expect(apply(tabbed, edits)).toBe(
      applyEdits(
        tabbed,
        modify(
          tabbed,
          ["color", "d"],
          { $value: "#444444" },
          { formattingOptions: tabs },
        ),
      ),
    )
  })
})

describe("core model fixes — rename refuses an illegal name", () => {
  const text = `{\n  "a": { "$type": "number", "$value": 1 },\n  "b": { "$type": "number", "$value": "{a}" }\n}`

  it.each(["x.y", "{x}", "x}", "$a", "$root", ""])(
    "refuses %j and returns no edits",
    name => {
      expect(() => computeRenameEdits(text, ["a"], name)).toThrow(
        InvalidNameError,
      )
      expect(() => computeRenameEdits(text, ["a"], name)).toThrow(/may not/)
    },
  )
})
