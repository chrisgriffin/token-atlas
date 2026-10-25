/**
 * Every `tokenAtlas.*` setting's default is written twice — once in
 * `package.json`'s `contributes.configuration`, once as a literal the host
 * falls back to when the setting is unset — and until this file nothing
 * compared them. Drift means VS Code's settings UI advertises one default
 * while the extension behaves as the other, with no test, type or lint to
 * catch it (#186). #170 closed the identifier half of the same table row;
 * this is the default-value half it scoped out.
 *
 * Both sides are read from their files, so changing a default in the manifest
 * *and* the host keeps this green — it asserts they agree, never what they
 * are.
 *
 * Matched against the source TEXT, not a loaded module: everything under
 * `src/host/` imports `vscode`, which only exists inside the Extension
 * Development Host, so these stay in the plain `node` environment the rest of
 * the suite runs in.
 */
import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8")
}

const properties: Record<string, { default: unknown }> = JSON.parse(
  read("package.json"),
).contributes.configuration.properties

/** Every `.ts`/`.tsx` under `src/`, concatenated — the reads are key strings, not structure. */
const srcText = readdirSync(join(ROOT, "src"), {
  recursive: true,
  encoding: "utf8",
})
  .filter(entry => entry.endsWith(".ts") || entry.endsWith(".tsx"))
  .map(entry => read(join("src", entry)))
  .join("\n")

/** `const NAME = [ … ]` — the array a host read falls back to. */
function constArray(text: string, name: string): unknown {
  const match = text.match(new RegExp(`const ${name} = (\\[[^\\]]*\\])`))
  if (!match)
    throw new Error(`no \`const ${name} = [ … ]\` to read a default from`)
  // A multi-line array carries Prettier's trailing comma, which JSON rejects.
  return JSON.parse(match[1].replace(/,\s*\]$/, "]"))
}

/** Any JSON literal a fallback can be written as — string, array, number, boolean. */
const LITERAL = `"[^"]*"|\\[[^\\]]*\\]|-?[\\d.]+|true|false`

/** `get<T>("key") ?? <literal>` — the literal a single host read falls back to. */
function nullishFallback(text: string, key: string): unknown {
  const match = text.match(
    new RegExp(`get<[^>]*>\\("${key}"\\)\\s*\\?\\?\\s*(${LITERAL})`),
  )
  if (!match) {
    throw new Error(
      `no \`get<…>("${key}") ?? <JSON literal>\` to read a default from`,
    )
  }
  return JSON.parse(match[1])
}

/** `export const NAME: T = { field: <literal>, … }` — the webview's own mirror. */
function constObject(text: string, name: string): Record<string, unknown> {
  const match = text.match(new RegExp(`const ${name}[^=]*= \\{([^}]*)\\}`))
  if (!match)
    throw new Error(`no \`const ${name} = { … }\` to read defaults from`)
  const fields = [
    ...match[1].matchAll(new RegExp(`(\\w+):\\s*(${LITERAL})`, "g")),
  ]
  if (!fields.length)
    throw new Error(`\`const ${name}\` holds no literal fields`)
  return Object.fromEntries(fields.map(f => [f[1], JSON.parse(f[2])]))
}

/**
 * Every key read out of `getConfiguration("tokenAtlas")` — directly, or through a
 * local alias (`const cfg = vscode.workspace.getConfiguration("tokenAtlas", uri)`).
 * Deliberately anchored on `getConfiguration`: a bare `.get<T>("key")` is also
 * how a Memento reads, and `workspaceState.get<T>("key")` is not a setting.
 */
function configReads(text: string): string[] {
  const aliases = [
    ...text.matchAll(
      /(?:const|let) (\w+) = [^\n;]*getConfiguration\("tokenAtlas"/g,
    ),
  ].map(m => m[1])
  const receivers = [
    `getConfiguration\\("tokenAtlas"[^)]*\\)`,
    ...new Set(aliases),
  ]
  const pattern = new RegExp(
    `(?:${receivers.join("|")})\\s*\\.get<[^>]*>\\("([^"]+)"\\)`,
    "g",
  )
  return [...text.matchAll(pattern)].map(m => m[1])
}

/**
 * Where each manifest default is duplicated. Naming the site is the point —
 * the coupling is between these places — but never the value: that comes from
 * `package.json` on one side and the file itself on the other.
 */
const SITES: { key: string; file: string; read: (text: string) => unknown }[] =
  [
    {
      key: "tokenAtlas.include",
      file: "src/host/workspaceIndex.ts",
      read: t => constArray(t, "DEFAULT_GLOBS"),
    },
    {
      key: "tokenAtlas.exclude",
      file: "src/host/workspaceIndex.ts",
      read: t => constArray(t, "DEFAULT_EXCLUDE"),
    },
    {
      key: "tokenAtlas.rootFontSize",
      file: "src/host/tokenEditorProvider.ts",
      read: t => nullishFallback(t, "rootFontSize"),
    },
    {
      key: "tokenAtlas.rootFontSize",
      file: "src/host/languageFeatures.ts",
      read: t => nullishFallback(t, "rootFontSize"),
    },
    {
      key: "tokenAtlas.defaultColorSpace",
      file: "src/host/tokenEditorProvider.ts",
      read: t => nullishFallback(t, "defaultColorSpace"),
    },
    {
      key: "tokenAtlas.defaultDimensionUnit",
      file: "src/host/tokenEditorProvider.ts",
      read: t => nullishFallback(t, "defaultDimensionUnit"),
    },
    {
      key: "tokenAtlas.contrastTarget",
      file: "src/host/tokenEditorProvider.ts",
      read: t => nullishFallback(t, "contrastTarget"),
    },
    {
      key: "tokenAtlas.contrastTarget",
      file: "src/host/languageFeatures.ts",
      read: t => nullishFallback(t, "contrastTarget"),
    },
    {
      key: "tokenAtlas.modeView",
      file: "src/host/tokenEditorProvider.ts",
      read: t => nullishFallback(t, "modeView"),
    },
    {
      key: "tokenAtlas.pathCollisions",
      file: "src/host/diagnostics.ts",
      read: t => nullishFallback(t, "pathCollisions"),
    },
    {
      key: "tokenAtlas.codeColorSwatches",
      file: "src/host/codeColorSwatches.ts",
      read: t => nullishFallback(t, "codeColorSwatches"),
    },
    {
      key: "tokenAtlas.inlayHints",
      file: "src/host/languageFeatures.ts",
      read: t => nullishFallback(t, "inlayHints"),
    },
  ]

describe("package.json ↔ host configuration defaults", () => {
  it.each(SITES)(
    "matches $key to its default in $file",
    ({ key, file, read: extract }) => {
      expect(properties[key]).toBeDefined()
      expect(extract(read(file))).toEqual(properties[key].default)
    },
  )

  it("matches the webview's DEFAULT_SETTINGS mirror to the same manifest defaults", () => {
    const mirror = constObject(
      read("src/webview/lib/settings.ts"),
      "DEFAULT_SETTINGS",
    )

    for (const [field, value] of Object.entries(mirror)) {
      expect(properties[`tokenAtlas.${field}`]?.default).toEqual(value)
    }
  })

  it("declares every setting the host reads, and no setting nothing reads", () => {
    const reads = configReads(srcText).map(key => `tokenAtlas.${key}`)

    expect(reads.length).toBeGreaterThan(0)
    expect(reads.filter(key => !(key in properties))).toEqual([])
    expect(Object.keys(properties).filter(key => !reads.includes(key))).toEqual(
      [],
    )
  })
})
