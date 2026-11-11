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

const parts = (v: string) => v.split(/[.-]/).slice(0, 3).map(Number)
const atLeast = (v: string, min: string) => {
  const [a, b] = [parts(v), parts(min)]
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return true
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
