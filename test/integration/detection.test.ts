/**
 * Which files Token Atlas treats as design tokens, exercised inside a real VS Code.
 *
 * `isTokenDocument` in `src/host/workspaceIndex.ts` is the one check eleven
 * call sites consult before offering a language feature, and it takes a
 * `vscode.TextDocument` — so vitest cannot reach it at all. Its three rules
 * (CLAUDE.md invariant 3):
 *
 *   1. `.tokens` / `.tokens.json` wins by declaration, even when the file is `{}`.
 *   2. A `languageId` that is not `json` or `jsonc` never counts, whatever the
 *      text holds.
 *   3. Otherwise JSON/JSONC counts only if the text holds `"$value"` or `"$type"`.
 *
 * Each case below asserts what a consumer observes — a hover, a document
 * symbol, a diagnostic, which editor a file opens in — never the predicate
 * itself, which the tests cannot import.
 */
import * as assert from "node:assert/strict"
import { rmSync, writeFileSync } from "node:fs"
import * as vscode from "vscode"
import type { TokenAtlasTestHooks } from "../../src/extension"

const workspace = vscode.workspace.workspaceFolders![0].uri
const file = (name: string) => vscode.Uri.joinPath(workspace, name)
const baseName = (uri: vscode.Uri) =>
  uri.path.slice(uri.path.lastIndexOf("/") + 1)

let hooks: TokenAtlasTestHooks

/** Poll until `check` returns a truthy value; indexing and diagnostics are debounced. */
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

const settle = (ms = 1_500) => new Promise(r => setTimeout(r, ms))

const config = () => vscode.workspace.getConfiguration("tokenAtlas")

/** Every hover offered at `needle`'s position in `name`, as one string. */
async function hoverAt(name: string, needle: string): Promise<string> {
  const uri = file(name)
  const doc = await vscode.workspace.openTextDocument(uri)
  const offset = doc.getText().indexOf(needle)
  assert.notEqual(offset, -1, `${name} no longer contains ${needle}`)
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    uri,
    doc.positionAt(offset + 1),
  )
  return hovers
    .flatMap(h => h.contents.map(c => (typeof c === "string" ? c : c.value)))
    .join("\n")
}

/**
 * The names of Token Atlas's own group symbols in `name`. `executeDocumentSymbolProvider`
 * merges every provider and the built-in JSON language service answers for the
 * same file, so the filter is Token Atlas's signature: `registerDocumentSymbolProvider`
 * builds a group as a Namespace carrying the detail `group`.
 */
async function tokenAtlasGroupSymbols(name: string): Promise<string[]> {
  const symbols =
    (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider",
      file(name),
    )) ?? []
  return symbols
    .filter(s => s.kind === vscode.SymbolKind.Namespace && s.detail === "group")
    .map(s => s.name)
}

/** Token Atlas's diagnostics on `uri`, as plain messages — other sources ignored. */
const problems = (uri: vscode.Uri) =>
  vscode.languages
    .getDiagnostics(uri)
    .filter(d => d.source === "Token Atlas")
    .map(d => d.message)

function tabKinds(uri: vscode.Uri): string[] {
  return vscode.window.tabGroups.all
    .flatMap(g => g.tabs)
    .filter(
      t =>
        (t.input as { uri?: vscode.Uri } | undefined)?.uri?.toString() ===
        uri.toString(),
    )
    .map(t =>
      t.input instanceof vscode.TabInputCustom
        ? "visual"
        : t.input instanceof vscode.TabInputText
          ? "text"
          : "other",
    )
}

before(async () => {
  const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>(
    "chrisgriffinio.token-atlas",
  )
  assert.ok(ext, "extension not found")
  hooks = await ext.activate()
})

afterEach(async () => {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors")
  await config().update(
    "defaultEditor",
    undefined,
    vscode.ConfigurationTarget.Global,
  )
})

describe("Token-document detection", () => {
  it("hovers a token in a DTCG file and stays silent in ordinary JSON", async () => {
    // scale/space.json carries no token extension, so only the content sniff
    // (rule 3) makes it a token document.
    const hover = await waitFor(async () => {
      const text = await hoverAt("scale/space.json", '"sm"')
      return text.includes("space.sm") ? text : ""
    }, "the hover for space.sm")
    assert.ok(hover.includes("dimension"), `no type in the hover: ${hover}`)

    // The same provider, a file in the same workspace with no DTCG key: nothing.
    // On its own this cannot fail — a hover needs a token and a token needs
    // `$value`, so a file without one answers nothing whatever the predicate
    // says. The symbol case below is what catches a loosened sniff.
    assert.equal(await hoverAt("detection-plain.json", '"build"'), "")
  })

  it("offers no symbols in ordinary JSON, and does offer them in a token file", async () => {
    // Groups need no `$value`, so document symbols are the one language feature
    // whose answer changes when the content sniff stops discriminating: with
    // `looksLikeTokens` returning true, detection-plain.json's `build` object
    // is reported as a group.
    assert.deepEqual(await tokenAtlasGroupSymbols("detection-plain.json"), [])
    assert.deepEqual(await tokenAtlasGroupSymbols("scale/space.json"), [
      "space",
    ])
  })

  it("treats an empty {} .tokens.json as a token document", async () => {
    // Rule 1: the name alone. Written rather than committed — a committed
    // `*.tokens.json` is listed by name even while empty, which would move
    // panel.test.ts's exact token-file list.
    const empty = file("empty.tokens.json")
    try {
      writeFileSync(empty.fsPath, "{}\n")
      await config().update(
        "defaultEditor",
        "visual",
        vscode.ConfigurationTarget.Global,
      )
      await vscode.commands.executeCommand("vscode.open", empty)
      await waitFor(
        () => tabKinds(empty).join() === "visual",
        "the visual editor on it",
      )
    } finally {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors")
      rmSync(empty.fsPath, { force: true })
    }
    // Gone again before the next file runs: the panel asserts its list exactly.
    const listed = async () =>
      ((await hooks.tokenTree.provider.getChildren()) ?? []) as Array<{
        uri: vscode.Uri
      }>
    await waitFor(
      async () =>
        !(await listed()).some(i => baseName(i.uri) === "empty.tokens.json"),
      "the written file dropped from the panel",
    )
  })

  it("ignores a non-JSON file holding $value, and validates the same text as JSON", async () => {
    // Rule 2: detection-tokens.txt is DTCG text with an unresolved reference,
    // saved as plaintext. Diagnostics refresh on open with no document
    // selector in the way, so the predicate is what keeps Token Atlas off it.
    const plain = file("detection-tokens.txt")
    const doc = await vscode.workspace.openTextDocument(plain)
    assert.equal(doc.languageId, "plaintext")
    assert.ok(doc.getText().includes('"$value"'), "the fixture lost its $value")
    await settle()
    assert.deepEqual(problems(plain), [])

    // The same text as JSON does get the diagnostic, so the case above can fail.
    const asJson = await vscode.workspace.openTextDocument({
      content: doc.getText(),
      language: "json",
    })
    await waitFor(
      () =>
        problems(asJson.uri).includes("Unresolved reference: {nowhere.at.all}"),
      "the unresolved reference reported once the same text is JSON",
    )
  })
})
