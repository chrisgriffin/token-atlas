import { describe, it, expect } from "vitest"
import { reorderSiblings } from "../../src/webview/lib/reorder"

describe("reorderSiblings", () => {
  const s = ["a", "b", "c", "d"]
  it("moves before and after a target", () => {
    expect(reorderSiblings(s, "a", "c", false)).toEqual(["b", "a", "c", "d"])
    expect(reorderSiblings(s, "a", "c", true)).toEqual(["b", "c", "a", "d"])
    expect(reorderSiblings(s, "d", "a", false)).toEqual(["d", "a", "b", "c"])
  })
  it("returns null when the drop changes nothing", () => {
    expect(reorderSiblings(s, "b", "a", true)).toBeNull()
    expect(reorderSiblings(s, "b", "c", false)).toBeNull()
    expect(reorderSiblings(s, "b", "b", false)).toBeNull()
    expect(reorderSiblings(s, "x", "a", false)).toBeNull()
  })
})
