/**
 * CI's gate runs `build:production` so the self-contained guard in
 * `esbuild.mjs` reads the minified bundle; `vsce package` runs
 * `vscode:prepublish` to build the bundle that is actually published. The
 * two must build the same mode, or CI checks a bundle nothing publishes.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")
const { scripts } = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> }

describe("production build entry points", () => {
  it.each(["build:production", "vscode:prepublish"])(
    "%s builds esbuild.mjs in --production mode",
    name => {
      expect(scripts[name]).toBe("node esbuild.mjs --production")
    },
  )
})
