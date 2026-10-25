import { describe, expect, it } from "vitest"
import { TYPE_CODICONS } from "../../src/host/typeCodicons"
import { ALL_TYPES } from "../../src/core/types"

describe("TYPE_CODICONS", () => {
  it("gives every token type a codicon", () => {
    expect(Object.keys(TYPE_CODICONS).sort()).toEqual([...ALL_TYPES].sort())
  })

  it("never gives two types the same codicon", () => {
    expect(new Set(Object.values(TYPE_CODICONS)).size).toBe(ALL_TYPES.length)
  })
})
