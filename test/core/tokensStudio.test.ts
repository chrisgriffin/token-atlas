import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { readThemes } from "../../src/core/tokensStudio"

const example = readFileSync("examples/06-tokens-studio/tokens.json", "utf8")

describe("readThemes", () => {
  it("reads the themes out of a Tokens Studio export", () => {
    expect(readThemes(example)).toEqual([
      { id: "light", name: "Light", sets: ["global", "semantic"] },
    ])
  })

  it("counts source sets as contributing, and drops disabled ones", () => {
    const text = JSON.stringify({
      $themes: [
        {
          id: "dark",
          name: "Dark",
          selectedTokenSets: {
            core: "source",
            dark: "enabled",
            light: "disabled",
          },
        },
      ],
    })
    expect(readThemes(text)[0].sets).toEqual(["core", "dark"])
  })

  it("returns nothing for a file with no themes, or an unusable block", () => {
    expect(readThemes(`{"color":{}}`)).toEqual([])
    expect(readThemes(`{"$themes":"not an array"}`)).toEqual([])
    expect(readThemes("not json at all")).toEqual([])
  })

  it("skips entries missing a name, an id or any live set", () => {
    const text = JSON.stringify({
      $themes: [
        { name: "No id is fine", selectedTokenSets: { a: "enabled" } },
        { id: "no-name", selectedTokenSets: { a: "enabled" } },
        {
          id: "all-off",
          name: "All off",
          selectedTokenSets: { a: "disabled" },
        },
        "not an object",
      ],
    })
    expect(readThemes(text)).toEqual([
      { id: "No id is fine", name: "No id is fine", sets: ["a"] },
    ])
  })
})
