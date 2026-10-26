/**
 * Go-to-definition *inside* token JSON, exercised inside a real VS Code.
 *
 * `src/host/languageFeatures.ts` registers `TokenDefinitionProvider` over token
 * documents. It reads the alias under the cursor with `tokenReferenceAtOffset`,
 * answers from the current document's own index first, and falls back to the
 * lazily-built workspace index for a reference that resolves in another file —
 * the cross-file hop the multi-file theming model rests on (`CLAUDE.md`
 * § Spec target). `exports.test.ts` drives the *other* definition provider,
 * `ExportDefinitionProvider`, which jumps from a CSS custom property into a
 * token file; this file drives the one that jumps from an alias to the token
 * it names.
 *
 * `provideDefinition` takes a `vscode.TextDocument` and a `vscode.Position`, so
 * vitest cannot reach it: everything here goes through
 * `executeDefinitionProvider`, the same way F12 does.
 *
 * No fixture is added or edited. The workspace already carries all three cases,
 * and two exact-count assertions elsewhere make a new one costly — `panel.test.ts`
 * pins the comma-joined token-file list verbatim, and `color.test.ts` pins one
 * swatch per concrete colour token plus "dist/copy.tokens.json is the
 * workspace's one hex-string $value".
 */
import * as assert from "node:assert/strict"
import * as vscode from "vscode"
import type { TokenAtlasTestHooks } from "../../src/extension"

const workspace = vscode.workspace.workspaceFolders![0].uri
const file = (name: string) => vscode.Uri.joinPath(workspace, name)

/**
 * Poll until `check` returns a value; the workspace index is built lazily.
 *
 * `check` returns `undefined` until it has an answer, rather than a falsy value
 * of its own: an empty array is truthy, so a helper returning the raw result of
 * `tokenDefinitionsAt` would come back satisfied on the first miss.
 */
async function waitFor<T>(
  check: () => T | undefined | Promise<T | undefined>,
  what: string,
  ms = 20_000,
): Promise<T> {
  const deadline = Date.now() + ms
  let last: T | undefined
  while (Date.now() < deadline) {
    last = await check()
    if (last) return last
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error(
    `timed out waiting for ${what} (last: ${JSON.stringify(last)})`,
  )
}

/** The position just inside `needle`'s first occurrence in `name`. */
async function positionOf(name: string, needle: string) {
  const uri = file(name)
  const doc = await vscode.workspace.openTextDocument(uri)
  const offset = doc.getText().indexOf(needle)
  assert.notEqual(offset, -1, `${name} no longer contains ${needle}`)
  return { uri, position: doc.positionAt(offset + 1) }
}

/**
 * The definitions at `needle` in `name` that land in a token file.
 *
 * `executeDefinitionProvider` merges every provider, so the filter keeps only
 * Token Atlas's shape of answer — the same filter `exports.test.ts` applies, for
 * the same reason.
 */
async function tokenDefinitionsAt(
  name: string,
  needle: string,
): Promise<vscode.Location[]> {
  const { uri, position } = await positionOf(name, needle)
  const found =
    (await vscode.commands.executeCommand<
      Array<vscode.Location | vscode.LocationLink>
    >("vscode.executeDefinitionProvider", uri, position)) ?? []
  return found
    .map(d =>
      "targetUri" in d
        ? new vscode.Location(d.targetUri, d.targetRange)
        : (d as vscode.Location),
    )
    .filter(loc => loc.uri.path.endsWith(".tokens.json"))
}

/**
 * The offset of the key that opens `path`'s member in `doc`.
 *
 * Walks the path group by group, matching each key against the `{` that opens
 * its member rather than the bare key: `"light"` is also a plain string value
 * under `$themes` → `selectedTokenSets` in `studio.tokens.json`, ahead of the
 * `light` group itself, so a bare-key search would land there.
 */
function keyOffsetOf(doc: vscode.TextDocument, path: string[]) {
  const text = doc.getText()
  let cursor = 0
  let offset = -1
  for (const key of path) {
    const opens = new RegExp(`"${key}"\\s*:\\s*\\{`, "g")
    opens.lastIndex = cursor
    const match = opens.exec(text)
    assert.ok(
      match,
      `${doc.uri.path} no longer opens a member at ${path.join(".")}`,
    )
    offset = match.index
    cursor = match.index + match[0].length
  }
  return offset
}

/**
 * Assert `location` is the key that opens the token at `path` — what `keyRange`
 * returns, and what `definitionLocation` returns through it. A file-only
 * assertion could not tell a correct jump from a jump to line 1.
 *
 * The whole path, not the leaf key: `studio.tokens.json` defines `surface`
 * twice, once under `light` and once under `dark`, so a leaf-only assertion
 * would also pass a provider that resolved `{light.surface}` to `dark.surface`.
 */
async function assertLandsOnKey(
  location: vscode.Location,
  fileName: string,
  path: string[],
) {
  assert.ok(
    location.uri.path.endsWith(fileName),
    `definition landed in ${location.uri.path}, not ${fileName}`,
  )
  const doc = await vscode.workspace.openTextDocument(location.uri)
  const key = path[path.length - 1]
  assert.equal(doc.getText(location.range), `"${key}"`)
  const landed = doc.offsetAt(location.range.start)
  const expected = keyOffsetOf(doc, path)
  assert.equal(
    landed,
    expected,
    `the definition is not the key that opens ${path.join(".")} — ${landed} !== ${expected}`,
  )
  const member = doc.getText().slice(landed)
  assert.match(
    member,
    new RegExp(`^"${key}":\\s*\\{\\s*"\\$(type|value)"`),
    `the definition range is not the key that opens ${key}'s member`,
  )
}

/** The one definition at `needle`, asserting no other token file claimed it. */
async function soleDefinitionAt(
  name: string,
  needle: string,
): Promise<vscode.Location> {
  const [definition, ...rest] = await waitFor(async () => {
    const found = await tokenDefinitionsAt(name, needle)
    return found.length ? found : undefined
  }, `a token-file definition for ${needle} in ${name}`)
  assert.deepEqual(rest, [], "more than one token file claimed the definition")
  return definition
}

describe("Token JSON go-to-definition", () => {
  // Inside the suite, not at the root: a root-level hook belongs to the root
  // suite and runs around every other file's tests too (exports.test.ts and
  // rename.test.ts both say the same). Nothing here opens an editor —
  // executeDefinitionProvider works off a TextDocument — so there is no
  // teardown to pair with it.
  before(async () => {
    const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>(
      "chrisgriffinio.token-atlas",
    )
    assert.ok(ext, "extension not found")
    await ext.activate()
  })

  it("jumps from an alias to a token defined in the same file", async () => {
    // studio.tokens.json's `semantic.page` is `{light.surface}`, and
    // `light.surface` is defined in that same file — the provider's
    // local-first branch, which never consults the workspace index.
    const definition = await soleDefinitionAt(
      "studio.tokens.json",
      '"{light.surface}"',
    )
    await assertLandsOnKey(definition, "studio.tokens.json", [
      "light",
      "surface",
    ])
  })

  it("jumps from an alias in a theme file to the token in the shared primitives file", async () => {
    // light.tokens.json is nothing but aliases into primitives.tokens.json:
    // the multi-file model, where a theme file references a shared primitives
    // file. `color.base.white` is defined only there — `brand.primary` is
    // defined in two fixtures and would be first-file-wins (exports.test.ts
    // records the same constraint).
    const definition = await soleDefinitionAt(
      "light.tokens.json",
      '"{color.base.white}"',
    )
    await assertLandsOnKey(definition, "primitives.tokens.json", [
      "color",
      "base",
      "white",
    ])
  })

  it("stays silent on a $value that is a plain string rather than an alias", async () => {
    // dist/copy.tokens.json's `accent` is the workspace's one plain-string
    // `$value` (`"#123456"`). It sits under a `tokenAtlas.exclude` default, which
    // keeps a file out of SCANNING only — opened directly it still gets
    // language features, which color.test.ts already proves for the
    // `isTokenDocument`-gated colour provider on this exact document.
    assert.deepEqual(
      await tokenDefinitionsAt("dist/copy.tokens.json", '"#123456"'),
      [],
    )

    // And again in studio.tokens.json, where the test above proves the
    // provider answers — so the silence is pinned to the value's shape, not to
    // a provider that never ran. `"#ffffff"` is `light.surface`'s `hex`: a
    // string, nested under a `$value`, that is not a reference. Both earlier
    // guards in `tokenReferenceAtOffset` pass on it, so this reaches the
    // reference match itself.
    assert.ok(
      (await tokenDefinitionsAt("studio.tokens.json", '"{light.surface}"'))
        .length > 0,
      "the alias in studio.tokens.json stopped resolving, so the silence below proves nothing",
    )
    assert.deepEqual(
      await tokenDefinitionsAt("studio.tokens.json", '"#ffffff"'),
      [],
    )
  })

  // Invariant 3: the workspace index scans only the `tokenAtlas.include` globs
  // only. Narrowed to `scale/`, the index holds `scale/space.json` alone, so
  // the theme → primitives hop above must stop resolving, while a path the
  // active document defines itself still does (invariant 4).
  describe("with tokenAtlas.include narrowed", () => {
    const include = (globs: string[] | undefined) =>
      vscode.workspace
        .getConfiguration("tokenAtlas")
        .update("include", globs, vscode.ConfigurationTarget.Global)

    after(() => include(undefined))

    it("stops resolving a reference into a file outside the globs", async () => {
      // At the default include first, so the miss below is the narrowing and
      // not a broken fixture.
      const definition = await soleDefinitionAt(
        "light.tokens.json",
        '"{color.base.white}"',
      )
      await assertLandsOnKey(definition, "primitives.tokens.json", [
        "color",
        "base",
        "white",
      ])

      await include(["scale/**"])
      await waitFor(async () => {
        const found = await tokenDefinitionsAt(
          "light.tokens.json",
          '"{color.base.white}"',
        )
        return found.length === 0 || undefined
      }, "{color.base.white} to stop resolving once primitives.tokens.json is outside include")
    })

    it("still resolves a path the active document defines itself", async () => {
      // studio.tokens.json is outside `scale/**` too: it answers from its own
      // tokens, never the index.
      await include(["scale/**"])
      const definition = await soleDefinitionAt(
        "studio.tokens.json",
        '"{light.surface}"',
      )
      await assertLandsOnKey(definition, "studio.tokens.json", [
        "light",
        "surface",
      ])
    })
  })
})
