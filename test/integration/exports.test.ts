/**
 * Token hovers and go-to-definition inside *exported* code, exercised inside a
 * real VS Code (#283).
 *
 * `src/host/exportFeatures.ts` registers a hover provider and a definition
 * provider over eight languages and matches the identifier under the cursor
 * back to a token with `core/exportNames.ts` — `--color-base-white`,
 * `$color-base-white`, `colorBaseWhite`, `tokens.color.base.white` all stand
 * for `color.base.white`. Both providers take a `vscode.TextDocument` and a
 * `vscode.Position`, so vitest cannot reach either; everything here goes
 * through `executeHoverProvider` / `executeDefinitionProvider`, the same way a
 * user does.
 *
 * The token under test is `color.base.white`, defined only in
 * primitives.tokens.json — `brand.primary` is defined in two fixtures, so its
 * definition would be first-file-wins and brittle.
 *
 * The built-in CSS and Sass language services answer for the same files, so
 * every assertion filters for Token Atlas's own answer: a hover carrying its
 * badge-pill markup, a definition landing in a token file. A miss must leave
 * nothing of Token Atlas's behind — the "never spam ordinary files" rule that
 * CLAUDE.md invariant 3 states for detection.
 */
import * as assert from "node:assert/strict"
import * as vscode from "vscode"
import type { TokenAtlasTestHooks } from "../../src/extension"

const workspace = vscode.workspace.workspaceFolders![0].uri
const file = (name: string) => vscode.Uri.joinPath(workspace, name)

/** The token every spelling below must resolve to, and where it is defined. */
const TOKEN_PATH = "color.base.white"
const TOKEN_KEY = '"white"'
const TOKEN_FILE = "primitives.tokens.json"

/**
 * The token's `$type`, as `hoverMarkdown` renders it: a badge pill padded with
 * non-breaking spaces (`src/core/hover.ts`, `pill`). `color.base.white` inherits
 * `"$type": "color"` from its group.
 */
const TYPE_PILL = "&nbsp;color&nbsp;"

/** Poll until `check` returns a truthy value; the workspace index is built lazily. */
async function waitFor<T>(
  check: () => T | Promise<T>,
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
 * Token Atlas's own hover at `needle` in `name`, as one string, or `""`.
 *
 * `executeHoverProvider` merges every provider and the built-in CSS/Sass
 * language services answer for a custom property and a `$variable` in these
 * same files, so the filter is Token Atlas's signature: `hoverMarkdown` renders
 * the type as a pill coloured with `--vscode-badge-background`, which nothing
 * built in emits.
 */
async function tokenAtlasHoverAt(
  name: string,
  needle: string,
): Promise<string> {
  const { uri, position } = await positionOf(name, needle)
  const hovers =
    (await vscode.commands.executeCommand<vscode.Hover[]>(
      "vscode.executeHoverProvider",
      uri,
      position,
    )) ?? []
  return hovers
    .flatMap(h => h.contents.map(c => (typeof c === "string" ? c : c.value)))
    .filter(text => text.includes("--vscode-badge-background"))
    .join("\n")
}

/**
 * The definitions at `needle` in `name` that land in a token file. The CSS
 * language service resolves `var(--x)` to its own declaration in the same
 * stylesheet, which is not what this file is about.
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
 * Token Atlas's completions at the end of `needle` in `name`. The built-in CSS
 * and Sass services also answer, so the filter is Token Atlas's signature: a
 * label whose description names the token path.
 */
async function tokenCompletionsAt(
  name: string,
  needle: string,
): Promise<vscode.CompletionItem[]> {
  const uri = file(name)
  const doc = await vscode.workspace.openTextDocument(uri)
  const offset = doc.getText().indexOf(needle)
  assert.notEqual(offset, -1, `${name} no longer contains ${needle}`)
  const list = await vscode.commands.executeCommand<vscode.CompletionList>(
    "vscode.executeCompletionItemProvider",
    uri,
    doc.positionAt(offset + needle.length),
  )
  return (list?.items ?? []).filter(
    i =>
      typeof i.label !== "string" &&
      (i.label.description ?? "").includes(TOKEN_PATH),
  )
}

const labelOf = (i: vscode.CompletionItem) =>
  typeof i.label === "string" ? i.label : i.label.label

describe("Exported code", () => {
  // Inside the suite, not at the root: a root-level hook belongs to the root
  // suite and runs around every other file's tests too (rename.test.ts says
  // the same of its `before`). Nothing here opens an editor — the two
  // `execute*Provider` commands work off a TextDocument — so there is no
  // teardown to pair with it.
  before(async () => {
    const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>(
      "chrisgriffinio.token-atlas",
    )
    assert.ok(ext, "extension not found")
    await ext.activate()
  })

  it("hovers a custom property in a .css file and names the token behind it", async () => {
    const hover = await waitFor(async () => {
      const text = await tokenAtlasHoverAt("exported.css", "--color-base-white")
      return text.includes(TOKEN_PATH) ? text : ""
    }, `the hover for ${TOKEN_PATH} in exported.css`)
    // The hover is the token's, not the stylesheet's: its own type and value.
    // The type is the rendered pill, not the bare word: the `waitFor` above only
    // returns a hover already carrying `color.base.white`, so a `"color"`
    // substring check could never go red.
    assert.ok(hover.includes(TYPE_PILL), `no type pill in the hover: ${hover}`)
    assert.ok(
      hover.includes("#ffffff"),
      `no resolved value in the hover: ${hover}`,
    )
  })

  it("jumps from that custom property to the token's own definition", async () => {
    const [definition, ...rest] = await tokenDefinitionsAt(
      "exported.css",
      "--color-base-white",
    )
    assert.ok(definition, "no definition in a token file")
    assert.deepEqual(
      rest,
      [],
      "more than one token file claimed the definition",
    )
    assert.ok(
      definition.uri.path.endsWith(TOKEN_FILE),
      `definition landed in ${definition.uri.path}, not ${TOKEN_FILE}`,
    )

    // It lands on the token's own key — the member carrying its `$value` —
    // which is what `definitionLocation` returns via `keyRange`.
    const doc = await vscode.workspace.openTextDocument(definition.uri)
    assert.equal(doc.getText(definition.range), TOKEN_KEY)
    const member = doc.getText().slice(doc.offsetAt(definition.range.start))
    assert.match(
      member,
      /^"white":\s*\{\s*"\$value"/,
      "the definition range is not the key that carries the token's $value",
    )
  })

  it("resolves all four exported identifier spellings to the same token", async () => {
    // One per language the spelling is actually written in; exportFeatures
    // registers for all of them.
    assert.ok(
      (await tokenAtlasHoverAt("exported.css", "--color-base-white")).includes(
        TOKEN_PATH,
      ),
      "the CSS custom property did not resolve",
    )
    assert.ok(
      (await tokenAtlasHoverAt("exported.scss", "$color-base-white")).includes(
        TOKEN_PATH,
      ),
      "the Sass variable did not resolve",
    )
    assert.ok(
      (await tokenAtlasHoverAt("exported.js", "colorBaseWhite")).includes(
        TOKEN_PATH,
      ),
      "the camelCase identifier did not resolve",
    )
    assert.ok(
      (
        await tokenAtlasHoverAt("exported.js", "tokens.color.base.white")
      ).includes(TOKEN_PATH),
      "the dotted object path did not resolve",
    )
  })

  it("stays silent on an exported identifier that is not a token", async () => {
    assert.equal(
      await tokenAtlasHoverAt("exported.css", "--not-a-token-at-all"),
      "",
    )
    assert.deepEqual(
      await tokenDefinitionsAt("exported.css", "--not-a-token-at-all"),
      [],
    )
  })

  it("stays silent on a bare word in a stylesheet, even one that spells a token", async () => {
    // `grid-area: color-base-white` names a grid area: in CSS only `--x` is a variable.
    assert.equal(
      await tokenAtlasHoverAt("exported.css", " color-base-white;"),
      "",
    )
    assert.deepEqual(
      await tokenDefinitionsAt("exported.css", " color-base-white;"),
      [],
    )
  })

  it("completes a token as a custom property, a Sass variable and an object path", async () => {
    // The workspace index is built lazily, so wait for the first non-empty list.
    const css = (await waitFor(async () => {
      const items = await tokenCompletionsAt(
        "exported.css",
        "var(--color-base-w",
      )
      return items.length ? items : undefined
    }, "the CSS completion"))!.map(labelOf)
    assert.ok(
      css.includes("--color-base-white"),
      `no --color-base-white in ${css}`,
    )

    const scss = (
      await tokenCompletionsAt("exported.scss", "background: $color-base-w")
    ).map(labelOf)
    assert.ok(
      scss.includes("$color-base-white"),
      `no $color-base-white in ${scss}`,
    )

    const js = (
      await tokenCompletionsAt("exported.js", "tokens.color.base.")
    ).map(labelOf)
    assert.deepEqual(js, ["white"])
  })

  it("offers no tokens where no token name is being typed", async () => {
    assert.deepEqual(
      await tokenCompletionsAt("exported.css", "border-radius: "),
      [],
    )
  })
})
