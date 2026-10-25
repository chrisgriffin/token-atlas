import { describe, it, expect } from "vitest"
import { countTokens, parseTokens } from "../../src/core/parse"
import { listGroups, findGroup } from "../../src/webview/lib/groups"

const model = parseTokens(
  JSON.stringify({
    color: {
      $type: "color",
      base: { blue: { $value: "#00f" }, red: { $value: "#f00" } },
      brand: { primary: { $value: "{color.base.blue}" } },
    },
    space: { $type: "dimension", md: { $value: { value: 16, unit: "px" } } },
    empty: {},
  }),
)

describe("listGroups", () => {
  it("lists nested groups in document order with depth and token counts", () => {
    expect(listGroups(model.root).map(g => [g.key, g.depth, g.tokens])).toEqual(
      [
        ["color", 0, 3],
        ["color.base", 1, 2],
        ["color.brand", 1, 1],
        ["space", 0, 1],
        ["empty", 0, 0],
      ],
    )
  })
})

describe("findGroup", () => {
  it("resolves a nested path and returns undefined for a missing one", () => {
    expect(findGroup(model.root, ["color", "base"])?.name).toBe("base")
    expect(findGroup(model.root, [])).toBe(model.root)
    expect(findGroup(model.root, ["color", "gone"])).toBeUndefined()
    expect(findGroup(model.root, ["color", "base", "blue"])).toBeUndefined() // a token, not a group
  })
})

describe("countTokens", () => {
  it("counts every descendant token", () => {
    expect(countTokens(model.root)).toBe(4)
  })
})
