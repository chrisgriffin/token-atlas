import { describe, it, expect, vi } from "vitest"
import { createParseCache } from "../../src/core/parseCache"
import { parseTokens } from "../../src/core/parse"

const a = `{"color":{"$type":"color","red":{"$value":"#f00"}}}`
const b = `{"space":{"$type":"dimension","sm":{"$value":{"value":4,"unit":"px"}}}}`

describe("createParseCache", () => {
  it("parses a file once while its text is unchanged", () => {
    const parse = vi.fn(parseTokens)
    const cache = createParseCache(parse)
    const first = cache.get("a", a)
    expect(cache.get("a", a)).toBe(first)
    expect(parse).toHaveBeenCalledTimes(1)
  })

  it("editing one file does not re-parse its siblings", () => {
    const parse = vi.fn(parseTokens)
    const cache = createParseCache(parse)
    cache.get("a", a)
    cache.get("b", b)
    parse.mockClear()

    const edited = a.replace("#f00", "#0f0")
    cache.get("a", edited)
    cache.get("b", b)
    expect(parse.mock.calls).toEqual([[edited]])
  })

  it("does not cache a parse that throws", () => {
    let fail = true
    const parse = vi.fn((text: string) => {
      if (fail) throw new Error("mid-edit")
      return parseTokens(text)
    })
    const cache = createParseCache(parse)
    expect(() => cache.get("a", a)).toThrow("mid-edit")
    fail = false
    expect(cache.get("a", a).root.children.length).toBe(1)
  })

  it("retain drops files that are gone", () => {
    const parse = vi.fn(parseTokens)
    const cache = createParseCache(parse)
    cache.get("a", a)
    cache.get("b", b)
    cache.retain(new Set(["a"]))
    parse.mockClear()
    cache.get("a", a)
    cache.get("b", b)
    expect(parse.mock.calls).toEqual([[b]])
  })
})
