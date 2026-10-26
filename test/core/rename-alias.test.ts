/**
 * Rename under the deprecation workflow (spec 019, #36): the old name stays
 * as a deprecated alias of the new one. Each edge case the issue names has a
 * test here, and every case applies the edits with jsonc-parser's
 * `applyEdits`, which throws on overlapping edits.
 */
import { describe, expect, it } from "vitest"
import { applyEdits } from "jsonc-parser"
import {
  NameTakenError,
  computeAliasRenameEdits,
  computeReferenceRenameEdits,
  computeRemoveAliasEdits,
  computeReplacementRenameEdits,
  indexTokens,
  parseTokens,
  type TokenNode,
} from "../../src/core"

const rename = (
  text: string,
  path: string[],
  name: string,
  external?: (key: string) => TokenNode | undefined,
) => applyEdits(text, computeAliasRenameEdits(text, path, name, external))

/** Each alias in `text`: its key, what its `$value` names, what its `$deprecated` names. */
function aliases(text: string): Array<[string, unknown, unknown]> {
  return [...indexTokens(parseTokens(text)).values()]
    .filter(t => t.deprecated !== undefined)
    .map(t => [t.path.join("."), t.value, t.deprecated])
}

const TOKEN = `{
    "color": {
        "$type": "color",
        "subtle": { "$value": "#eeeeee" },
        "card": { "$value": "{color.subtle}" }
    }
}
`

describe("computeAliasRenameEdits", () => {
  it("keeps the old name as a deprecated alias and moves every reference", () => {
    expect(rename(TOKEN, ["color", "subtle"], "muted")).toBe(`{
    "color": {
        "$type": "color",
        "muted": { "$value": "#eeeeee" },
        "subtle": { "$value": "{color.muted}", "$deprecated": "Renamed; use {color.muted} instead" },
        "card": { "$value": "{color.muted}" }
    }
}
`)
  })

  it("keeps a renamed group as a group of aliases, one per token", () => {
    const text = `{
  "brand": {
    "$type": "color",
    "primary": { "$value": "#ff0000" },
    "tint": {
      "soft": { "$value": "#ffcccc" }
    }
  },
  "button": { "fill": { "$value": "{brand.primary}" } }
}
`
    expect(rename(text, ["brand"], "palette")).toBe(`{
  "palette": {
    "$type": "color",
    "primary": { "$value": "#ff0000" },
    "tint": {
      "soft": { "$value": "#ffcccc" }
    }
  },
  "brand": {
    "primary": { "$value": "{palette.primary}", "$deprecated": "Renamed; use {palette.primary} instead" },
    "tint": {
      "soft": { "$value": "{palette.tint.soft}", "$deprecated": "Renamed; use {palette.tint.soft} instead" }
    }
  },
  "button": { "fill": { "$value": "{palette.primary}" } }
}
`)
  })

  it("collapses a → b → c so a points straight at c", () => {
    const once = rename(TOKEN, ["color", "subtle"], "muted")
    const twice = rename(once, ["color", "muted"], "quiet")
    expect(aliases(twice)).toEqual([
      ["color.muted", "{color.quiet}", "Renamed; use {color.quiet} instead"],
      ["color.subtle", "{color.quiet}", "Renamed; use {color.quiet} instead"],
    ])
    expect(JSON.parse(twice).color.card.$value).toBe("{color.quiet}")
  })

  it("renames back onto the alias: the token takes its name back and the other becomes the alias", () => {
    const there = rename(TOKEN, ["color", "subtle"], "muted")
    expect(rename(there, ["color", "muted"], "subtle")).toBe(`{
    "color": {
        "$type": "color",
        "subtle": { "$value": "#eeeeee" },
        "muted": { "$value": "{color.subtle}", "$deprecated": "Renamed; use {color.subtle} instead" },
        "card": { "$value": "{color.subtle}" }
    }
}
`)
  })

  it("still refuses a name a real token already has", () => {
    const text = `{ "a": { "$value": 1 }, "b": { "$value": 2 } }`
    expect(() => computeAliasRenameEdits(text, ["a"], "b")).toThrow(
      NameTakenError,
    )
  })

  it("names the end of the chain when the replacement is itself deprecated", () => {
    const text = `{
  "space": {
    "$type": "dimension",
    "gap": { "$deprecated": "use {space.gutter} instead", "$value": { "value": 4, "unit": "px" } },
    "gutter": { "$value": { "value": 8, "unit": "px" } },
    "pad": { "$deprecated": "use {space.gap} instead", "$value": { "value": 2, "unit": "px" } }
  }
}
`
    // Renaming a deprecated token: its alias names what it is deprecated for.
    const next = rename(text, ["space", "gap"], "gapOld")
    const out = JSON.parse(next).space
    expect(out.gap).toEqual({
      $value: "{space.gapOld}",
      $deprecated: "Renamed; use {space.gutter} instead",
    })
    // A reason that named the renamed token skips past it as well.
    expect(out.pad.$deprecated).toBe("use {space.gutter} instead")
    expect(out.gapOld.$deprecated).toBe("use {space.gutter} instead")
  })

  it("follows a replacement into another file, and stops on a cycle", () => {
    const text = `{ "a": { "$value": 1, "$deprecated": "use {b}" } }`
    const elsewhere = new Map<string, TokenNode>(
      indexTokens(
        parseTokens(`{ "b": { "$value": 2, "$deprecated": "use {a}" } }`),
      ),
    )
    const next = rename(text, ["a"], "c", k => elsewhere.get(k))
    expect(JSON.parse(next).a).toEqual({
      $value: "{c}",
      $deprecated: "Renamed; use {c} instead",
    })
  })

  it("does nothing new for a rename to the same name", () => {
    expect(
      computeAliasRenameEdits(TOKEN, ["color", "subtle"], "subtle"),
    ).toEqual([])
  })
})

describe("computeRemoveAliasEdits", () => {
  it("removes the alias a rename left, and nothing else", () => {
    const there = rename(TOKEN, ["color", "subtle"], "muted")
    expect(
      applyEdits(
        there,
        computeRemoveAliasEdits(there, ["color", "subtle"], "color.muted"),
      ),
    ).toBe(`{
    "color": {
        "$type": "color",
        "muted": { "$value": "#eeeeee" },
        "card": { "$value": "{color.muted}" }
    }
}
`)
  })

  it("leaves a node that is no longer that alias", () => {
    const there = rename(TOKEN, ["color", "subtle"], "muted")
    const edited = there.replace(
      '"subtle": { "$value": "{color.muted}"',
      '"subtle": { "$value": "#000000"',
    )
    expect(
      computeRemoveAliasEdits(edited, ["color", "subtle"], "color.muted"),
    ).toEqual([])
    expect(
      computeRemoveAliasEdits(TOKEN, ["color", "subtle"], "color.muted"),
    ).toEqual([])
  })

  it("removes a group of aliases whole", () => {
    const text = `{ "a": { "x": { "$value": 1 } }, "b": { "$value": 2 } }`
    const there = rename(text, ["a"], "c")
    expect(applyEdits(there, computeRemoveAliasEdits(there, ["a"], "c"))).toBe(
      `{ "c": { "x": { "$value": 1 } }, "b": { "$value": 2 } }`,
    )
  })
})

describe("per-file brand renames", () => {
  const brandA = `{ "color": { "$type": "color", "primary": { "$value": "#ff0000" } } }`
  const brandB = `{
  "color": { "$type": "color", "primary": { "$value": "#0000ff" } },
  "old": { "$type": "color", "$deprecated": "use {color.primary}", "$value": "#000000" },
  "chip": { "$value": "{color.primary}" }
}
`
  const user = `{
  "old": { "$type": "color", "$deprecated": "use {color.primary}", "$value": "#000000" },
  "chip": { "$value": "{color.primary}" }
}
`

  it("adds the alias to the renamed brand's file only", () => {
    expect(rename(brandA, ["color", "primary"], "brand")).toBe(
      `{ "color": { "$type": "color", "brand": { "$value": "#ff0000" }, "primary": { "$value": "{color.brand}", "$deprecated": "Renamed; use {color.brand} instead" } } }`,
    )
  })

  it("leaves a file that defines the path itself alone", () => {
    expect(
      computeReferenceRenameEdits(brandB, "color.primary", "color.brand"),
    ).toEqual([])
    expect(
      computeReplacementRenameEdits(brandB, "color.primary", "color.brand"),
    ).toEqual([])
  })

  it("moves a replacement in a file that only uses the path", () => {
    const next = applyEdits(
      user,
      computeReplacementRenameEdits(user, "color.primary", "color.brand"),
    )
    expect(JSON.parse(next).old.$deprecated).toBe("use {color.brand}")
    expect(JSON.parse(next).chip.$value).toBe("{color.primary}")
  })
})
