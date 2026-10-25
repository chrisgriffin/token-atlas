/**
 * `tokenAtlas.hardcodedValues` inside a real VS Code (#384): a literal in a
 * stylesheet that equals a token is reported, the quick fix offers the token's
 * exported name (one fix per matching token), a variable definition in an exported stylesheet is not, and
 * turning the setting off clears it. The matching itself is unit-tested in
 * test/core/hardcoded.test.ts; this covers the diagnostics and code-action
 * wiring vitest cannot load.
 */
import * as assert from "node:assert/strict"
import * as vscode from "vscode"
import type { TokenAtlasTestHooks } from "../../src/extension"

const workspace = vscode.workspace.workspaceFolders![0].uri
const file = (name: string) => vscode.Uri.joinPath(workspace, name)

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

const hardcoded = (name: string) =>
  vscode.languages
    .getDiagnostics(file(name))
    .filter(d => d.code === "hardcoded-value")

/**
 * The code action titled `title` on `range`, asked for until it appears.
 * VS Code cancels a code-action request when any code-action provider
 * registers or unregisters mid-flight, and returns only the answers already in,
 * so one request can come back without this extension's fix (#412).
 */
const fixAt = (name: string, range: vscode.Range, title: string) => {
  let titles: string[] = []
  return waitFor(async () => {
    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      "vscode.executeCodeActionProvider",
      file(name),
      range,
    )
    titles = actions.map(a => a.title)
    return actions.find(a => a.title === title)
  }, `"${title}"`).then(
    fix => fix!, // waitFor only returns once the check is truthy
    (e: Error) => {
      throw new Error(`${e.message}; last offered ${JSON.stringify(titles)}`)
    },
  )
}

const setting = (value: string | undefined) =>
  vscode.workspace
    .getConfiguration("tokenAtlas")
    .update("hardcodedValues", value, vscode.ConfigurationTarget.Global)

describe("Hard-coded values", () => {
  before(async () => {
    const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>(
      "chrisgriffinio.token-atlas",
    )
    assert.ok(ext, "extension not found")
    await ext.activate()
    await vscode.workspace.openTextDocument(file("hardcoded.css"))
    await vscode.workspace.openTextDocument(file("exported.css"))
    await vscode.workspace.openTextDocument(file("hardcoded-prefixed.css"))
  })

  after(() => setting(undefined))

  it("reports a literal that equals a token, with a replace quick fix", async () => {
    await setting("hint")
    const [d] = await waitFor<vscode.Diagnostic[] | undefined>(() => {
      const found = hardcoded("hardcoded.css")
      return found.length ? found : undefined
    }, "a hard-coded value diagnostic").then(found => found!)
    assert.equal(
      hardcoded("hardcoded.css").length,
      1,
      "the comment's copy was reported too",
    )
    // Whether other suites' fixtures also match depends on run order, so the
    // message may name one token or list several; slate-900 is always there.
    assert.match(
      d.message,
      /^#0f172a matches (token |\d+ tokens: .*)color\.base\.slate-900/,
    )
    assert.equal(d.severity, vscode.DiagnosticSeverity.Hint)
    const doc = await vscode.workspace.openTextDocument(file("hardcoded.css"))
    assert.equal(doc.getText(d.range), "#0f172a")

    const fix = await fixAt(
      "hardcoded.css",
      d.range,
      "Replace with var(--color-base-slate-900)",
    )
    assert.ok(
      !fix.isPreferred,
      "the fix must stay opt-in, never Auto Fix's pick",
    )
    const [[uri, [edit]]] = fix.edit!.entries()
    assert.equal(uri.toString(), file("hardcoded.css").toString())
    assert.equal(edit.newText, "var(--color-base-slate-900)")
  })

  it("keeps the export prefix the stylesheet already uses", async () => {
    const [d] = await waitFor(
      () => hardcoded("hardcoded-prefixed.css").length > 0,
      "a diagnostic in the prefixed stylesheet",
    ).then(() => hardcoded("hardcoded-prefixed.css"))
    await fixAt(
      "hardcoded-prefixed.css",
      d.range,
      "Replace with var(--ds-color-base-slate-900)",
    )
  })

  it("leaves the custom property that defines a token alone", () => {
    assert.deepEqual(hardcoded("exported.css"), [])
  })

  it("clears when the setting goes back to off", async () => {
    await setting("off")
    await waitFor(
      () => hardcoded("hardcoded.css").length === 0,
      "the diagnostic to clear",
    )
  })
})
