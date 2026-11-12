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

// Semver precedence (#98): build metadata (`+…`) is ignored, a prerelease sorts
// before its release (11.0.1-rc.0 < 11.0.1), and two prereleases of one release
// compare identifier by identifier: numeric ones as numbers, below any
// alphanumeric one, and a shorter set below a longer one it prefixes.
const split = (v: string) => {
  const [core, ...pre] = v.split("+")[0].split("-")
  return {
    core: core.split(".").slice(0, 3).map(Number),
    pre: pre.length ? pre.join("-").split(".") : [],
  }
}
const NUMERIC = /^\d+$/
const compareIds = (a: string, b: string) => {
  const [an, bn] = [NUMERIC.test(a), NUMERIC.test(b)]
  if (an && bn) return Number(a) - Number(b)
  if (an !== bn) return an ? -1 : 1
  return a < b ? -1 : a > b ? 1 : 0
}
const atLeast = (v: string, min: string) => {
  const [a, b] = [split(v), split(min)]
  for (let i = 0; i < 3; i++)
    if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i]
  if (!a.pre.length || !b.pre.length) return !a.pre.length
  for (let i = 0; i < Math.min(a.pre.length, b.pre.length); i++) {
    const c = compareIds(a.pre[i], b.pre[i])
    if (c !== 0) return c > 0
  }
  return a.pre.length >= b.pre.length
}
// The one range predicate: the lockfile check and the #98 cases both call it.
const inRange = (v: string, from: string, patched: string) =>
  atLeast(v, from) && !atLeast(v, patched)

describe("security overrides", () => {
  for (const [name, { from, patched, issue }] of Object.entries(VULNERABLE)) {
    it(`${issue} locks no copy of ${name} in ${from} up to ${patched}`, () => {
      const copies = Object.entries(
        lock.packages as Record<string, { version: string }>,
      )
        .filter(([path]) => path.endsWith(`node_modules/${name}`))
        .map(([path, entry]) => ({ path, version: entry.version }))
      expect(copies.length).toBeGreaterThan(0)
      expect(copies.filter(c => inRange(c.version, from, patched))).toEqual([])
    })
  }
})

describe("#98 version comparison orders a prerelease before its release", () => {
  const { from, patched } = VULNERABLE.minimatch
  it.each([
    ["11.0.1-rc.0", true],
    ["11.0.0", true],
    ["11.0.1", false],
    ["11.0.2", false],
    ["11.0.2-rc.0", false],
    ["7.0.0+build", true],
    ["7.0.0+build-1", true],
    ["11.0.1-rc.0+build", true],
    ["11.0.1+build", false],
    ["7.0.0-rc.0", false],
  ])(
    "a prerelease-aware check of minimatch %s against its table range reports vulnerable=%s",
    (v, expected) => {
      expect(inRange(v, from, patched)).toBe(expected)
    },
  )

  it.each([
    ["11.0.1-rc.10", "11.0.1-rc.9", true],
    ["11.0.1-rc.9", "11.0.1-rc.10", false],
    ["11.0.1-rc.2", "11.0.1-rc.2", true],
    ["11.0.1-rc.1", "11.0.1-rc", true],
    ["11.0.1-rc", "11.0.1-rc.1", false],
    ["11.0.1-alpha", "11.0.1-1", true],
    ["11.0.1-1", "11.0.1-alpha", false],
    ["11.0.1-beta", "11.0.1-alpha.9", true],
    ["11.0.1-rc.10+build", "11.0.1-rc.9", true],
  ])(
    "two prerelease versions of one release: %s is at least %s = %s",
    (v, min, expected) => {
      expect(atLeast(v, min)).toBe(expected)
    },
  )
})
