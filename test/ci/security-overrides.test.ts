/** No locked copy of a package held by an `overrides` security pin sits in its advisory's vulnerable range, because its parents pin that range (#34, #92). */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")
const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"))

// Vulnerable range [from, patched) per package, and the issue that pinned it.
// GHSA-5c6j-r48x-rmvq, GHSA-qj8w-gfj5-8c6v, GHSA-m5mm-p8h7-m29v (serialize-javascript <=7.1.2);
// GHSA-xcx6-jx8p-x3h5 (msal-node <=7.0.2); GHSA-g3hv-75wg-m249 (minimatch >=7.0.0 <11.0.1),
// where a 3.x copy is outside the range and stays.
const VULNERABLE: Record<
  string,
  { from: string; patched: string; issue: string }
> = {
  "serialize-javascript": { from: "0.0.0", patched: "7.1.3", issue: "#34" },
  "@azure/msal-node": { from: "0.0.0", patched: "7.1.0", issue: "#34" },
  minimatch: { from: "7.0.0", patched: "11.0.1", issue: "#92" },
}

// A prerelease sorts before its release, as in semver (#98): 11.0.1-rc.0 < 11.0.1.
// Two prereleases of one release compare as plain strings, enough for these bounds.
const split = (v: string) => {
  const [core, ...pre] = v.split("-")
  return { core: core.split(".").slice(0, 3).map(Number), pre: pre.join("-") }
}
const atLeast = (v: string, min: string) => {
  const [a, b] = [split(v), split(min)]
  for (let i = 0; i < 3; i++)
    if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i]
  if (!a.pre || !b.pre) return !a.pre
  return a.pre >= b.pre
}

describe("security overrides", () => {
  for (const [name, { from, patched, issue }] of Object.entries(VULNERABLE)) {
    it(`${issue} locks no copy of ${name} in ${from} up to ${patched}`, () => {
      const copies = Object.entries(
        lock.packages as Record<string, { version: string }>,
      )
        .filter(([path]) => path.endsWith(`node_modules/${name}`))
        .map(([path, entry]) => ({ path, version: entry.version }))
      expect(copies.length).toBeGreaterThan(0)
      expect(
        copies.filter(
          c => atLeast(c.version, from) && !atLeast(c.version, patched),
        ),
      ).toEqual([])
    })
  }
})

describe("#98 version comparison orders a prerelease before its release", () => {
  const vulnerable = (v: string) => atLeast(v, "7.0.0") && !atLeast(v, "11.0.1")
  it.each([
    ["11.0.1-rc.0", true],
    ["11.0.0", true],
    ["11.0.1", false],
    ["11.0.2", false],
    ["11.0.2-rc.0", false],
  ])(
    "a prerelease-aware check of minimatch %s against patched 11.0.1 reports vulnerable=%s",
    (v, expected) => {
      expect(vulnerable(v)).toBe(expected)
    },
  )
})
