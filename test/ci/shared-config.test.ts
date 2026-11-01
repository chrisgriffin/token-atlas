/** Prettier, ESLint and TypeScript read the fleet's shared configs from @chrisgriffin/config, not copies of this repo's own (#32). */
import { describe, it, expect } from "vitest"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")
const read = (file: string) => readFileSync(join(ROOT, file), "utf8")
const pkg = JSON.parse(read("package.json"))

describe("shared configs", () => {
  it("installs @chrisgriffin/config from its v1 tag", () => {
    expect(pkg.devDependencies["@chrisgriffin/config"]).toBe(
      "github:chrisgriffin/config#v1",
    )
  })

  it("formats with the shared Prettier config and carries no config of its own", () => {
    expect(pkg.prettier).toBe("@chrisgriffin/config/prettier")
    const own = readdirSync(ROOT).filter(
      f => /^\.prettierrc/.test(f) || /^prettier\.config\./.test(f),
    )
    expect(own).toEqual([])
  })

  it("lints from eslint.config.mjs, spreading the shared base first", () => {
    expect(existsSync(join(ROOT, "eslint.config.mjs"))).toBe(true)
    const text = read("eslint.config.mjs")
    expect(text).toMatch(/^import base from "@chrisgriffin\/config\/eslint"$/m)
    const entries = text.slice(text.indexOf("export default ["))
    const spread = entries.indexOf("...base")
    expect(spread).toBeGreaterThan(-1)
    // Only `ignores`, which configure no rules, may come before the base.
    const before = entries.slice(0, spread)
    expect(before.match(/\b(rules|files|languageOptions|plugins)\b/)).toBeNull()
    expect(pkg.scripts.lint).toBe("eslint .")
  })

  it("type-checks with a tsconfig that extends the shared one", () => {
    expect(JSON.parse(read("tsconfig.json")).extends).toBe(
      "@chrisgriffin/config/tsconfig.json",
    )
    expect(pkg.scripts.typecheck).toBe("tsc --noEmit")
  })
})
