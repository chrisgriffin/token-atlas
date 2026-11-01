/**
 * Inlay hints with each alias's resolved value, inside a real VS Code.
 *
 * `src/host/languageFeatures.ts` registers `TokenInlayHintsProvider`. Asked
 * through `executeInlayHintProvider`, the way the editor asks, it puts the
 * value a `{reference}` resolves to right after it: across files
 * (`light.tokens.json` into `primitives.tokens.json`) and in tokens written
 * inline in a resolver. `src/host/exportFeatures.ts` does the same after each
 * `var(--token)` in a CSS, Sass or Less file. `tokenAtlas.inlayHints: false`
 * turns every hint off.
 */
import * as assert from "node:assert/strict"
import * as vscode from "vscode"
import type { TokenAtlasTestHooks } from "../../src/extension"

const workspace = vscode.workspace.workspaceFolders![0].uri
const config = () => vscode.workspace.getConfiguration("tokenAtlas")

/** `<text before the hint>|<label>` for each hint, so a hint is pinned to its reference. */
async function hints(doc: vscode.TextDocument): Promise<string[]> {
  const range = new vscode.Range(0, 0, doc.lineCount, 0)
  const found =
    (await vscode.commands.executeCommand<vscode.InlayHint[]>(
      "vscode.executeInlayHintProvider",
      doc.uri,
      range,
    )) ?? []
  return found.map(h => {
    const line = doc.lineAt(h.position.line).text.slice(0, h.position.character)
    const label =
      typeof h.label === "string" ? h.label : h.label.map(p => p.value).join("")
    return `${line.trim()}|${label}`
  })
}

/** Polled: the workspace index behind cross-file values is built lazily. */
async function hintsWhen(
  doc: vscode.TextDocument,
  done: (found: string[]) => boolean,
): Promise<string[]> {
  const deadline = Date.now() + 20_000
  for (;;) {
    const found = await hints(doc)
    if (done(found) || Date.now() > deadline) return found
    await new Promise(r => setTimeout(r, 100))
  }
}

describe("Inlay hints", () => {
  before(async () => {
    const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>(
      "chrisgriffinio.token-atlas",
    )
    assert.ok(ext, "extension not found")
    await ext.activate()
  })

  after(async () => {
    await config().update(
      "inlayHints",
      undefined,
      vscode.ConfigurationTarget.Global,
    )
    await vscode.commands.executeCommand("workbench.action.closeAllEditors")
  })

  it("shows the value an alias resolves to in another file", async () => {
    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(workspace, "light.tokens.json"),
    )
    const found = await hintsWhen(doc, f => f.length === 4)
    assert.deepEqual(found, [
      '"background": { "$value": "{color.base.white}"|= #ffffff',
      '"surface": { "$value": "{color.base.slate-100}"|= #f1f5f9',
      '"text": { "$value": "{color.base.slate-900}"|= #0f172a',
      '"accent": { "$value": "{color.base.blue-600}"|= #2563eb',
    ])
  })

  it("shows values for tokens written inline in a resolver", async () => {
    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(workspace, "themes.resolver.json"),
    )
    const found = await hintsWhen(doc, f => f.length === 2)
    assert.deepEqual(found, [
      '"inlineAlias": { "$type": "number", "$value": "{inline}"|= 1',
      '"edge": { "$type": "color", "$value": "{color.base.slate-800}"|= #1e293b',
    ])
  })

  it("shows the value after each var(--token) in CSS, after any fallback, but not in a comment", async () => {
    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(workspace, "inlay.css"),
    )
    const found = await hintsWhen(doc, f => f.length === 2)
    assert.deepEqual(found, [
      "color: var(--color-base-blue-600)|= #2563eb",
      "background: var(--color-base-slate-900, #000)|= #0f172a",
    ])
  })

  it("shows the value after var(--token) in Sass and Less", async () => {
    for (const name of ["inlay.scss", "inlay.less"]) {
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.joinPath(workspace, name),
      )
      const found = await hintsWhen(doc, f => f.length === 1)
      assert.deepEqual(
        found,
        ["color: var(--color-base-blue-600)|= #2563eb"],
        name,
      )
    }
  })

  it("writes a color outside sRGB in its own space, as the JSON hint does", async () => {
    // Unsaved, so color.base.p3-red stays unused on disk for the unused-token suite.
    const doc = await vscode.workspace.openTextDocument({
      language: "css",
      content: ".a { color: var(--color-base-p3-red); }",
    })
    const found = await hintsWhen(doc, f => f.length === 1)
    assert.deepEqual(found, [
      ".a { color: var(--color-base-p3-red)|= color(display-p3 1 0 0)",
    ])
  })

  it("shows nothing once tokenAtlas.inlayHints is off", async () => {
    await config().update(
      "inlayHints",
      false,
      vscode.ConfigurationTarget.Global,
    )
    for (const name of ["light.tokens.json", "inlay.css"]) {
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.joinPath(workspace, name),
      )
      assert.deepEqual(await hintsWhen(doc, f => f.length === 0), [], name)
    }
  })
})
