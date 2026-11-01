/** Every locked copy of serialize-javascript and @azure/msal-node is a patched version, held there by `overrides` because their parents pin a vulnerable range (#34). */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")
const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"))

// First version past every open advisory: GHSA-5c6j-r48x-rmvq, GHSA-qj8w-gfj5-8c6v,
// GHSA-m5mm-p8h7-m29v (serialize-javascript <=7.1.2); GHSA-xcx6-jx8p-x3h5 (msal-node <=7.0.2).
const PATCHED: Record<string, string> = {
  "serialize-javascript": "7.1.3",
  "@azure/msal-node": "7.1.0",
}

const parts = (v: string) => v.split(/[.-]/).slice(0, 3).map(Number)
const atLeast = (v: string, min: string) => {
  const [a, b] = [parts(v), parts(min)]
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return true
}

describe("security overrides", () => {
  for (const [name, min] of Object.entries(PATCHED)) {
    it(`locks every copy of ${name} at ${min} or later`, () => {
      const copies = Object.entries(
        lock.packages as Record<string, { version: string }>,
      )
        .filter(([path]) => path.endsWith(`node_modules/${name}`))
        .map(([path, entry]) => ({ path, version: entry.version }))
      expect(copies.length).toBeGreaterThan(0)
      expect(copies.filter(c => !atLeast(c.version, min))).toEqual([])
    })
  }
})
