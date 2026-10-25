import esbuild from "esbuild"
import { readFileSync } from "node:fs"

const production = process.argv.includes("--production")
const watch = process.argv.includes("--watch")
const integration = process.argv.includes("--integration")

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: "info",
}

/** Extension host bundle (runs in Node, has access to the `vscode` module). */
const extensionConfig = {
  ...common,
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  // Prefer ESM entry points so dual-package deps (e.g. jsonc-parser, whose
  // "main" is a UMD bundle esbuild can't inline) get statically bundled.
  // Without this the bundle keeps runtime `require("./impl/...")` calls that
  // fail once node_modules isn't shipped (--no-dependencies). See the guard below.
  mainFields: ["module", "main"],
}

/**
 * Integration tests (run by `vscode-test` inside a real VS Code). They reach
 * the extension only through `vscode` and its activate() return value, so
 * nothing from `src/` is bundled into them.
 */
const integrationConfig = {
  ...common,
  entryPoints: ["test/integration/*.test.ts"],
  outdir: "out/integration",
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
}

/** Webview bundle (runs in a browser sandbox inside the editor). */
const webviewConfig = {
  ...common,
  entryPoints: ["src/webview/index.tsx"],
  outfile: "dist/webview.js",
  platform: "browser",
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": production ? '"production"' : '"development"',
  },
}

async function run() {
  if (watch) {
    const ctxExt = await esbuild.context(extensionConfig)
    const ctxWeb = await esbuild.context(webviewConfig)
    await Promise.all([ctxExt.watch(), ctxWeb.watch()])
    console.log("[token-atlas] watching for changes…")
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig),
      ...(integration ? [esbuild.build(integrationConfig)] : []),
    ])
    assertSelfContained("dist/extension.js")
    console.log("[token-atlas] build complete.")
  }
}

/**
 * Guard against the bundle keeping unresolved relative module references.
 * We ship with `vsce package --no-dependencies`, so the extension bundle must
 * be fully self-contained — any leftover `"./impl/..."`-style path means a dep
 * wasn't inlined and the extension will fail to activate at runtime.
 */
function assertSelfContained(file) {
  const code = readFileSync(file, "utf8")
  const leftover = code.match(/["'`]\.\/[A-Za-z0-9_./-]+["'`]/g)
  if (leftover && leftover.length) {
    const unique = [...new Set(leftover)].slice(0, 10).join(", ")
    throw new Error(
      `${file} contains unbundled relative module references (${unique}). ` +
        `A dependency was not inlined — check mainFields / the dependency's package exports.`,
    )
  }
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
