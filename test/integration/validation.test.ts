/**
 * `tokenAtlas.validation: off`, exercised inside a real VS Code.
 *
 * `refresh` in `src/host/diagnostics.ts` reads `tokenAtlas.validation` per
 * document and, when it is `off`, deletes the document from the `token-atlas`
 * collection instead of computing anything; any `tokenAtlas.*` change re-runs it
 * over every open document. So the switch has to clear what was already
 * published, and bring it back when the setting returns to `on`.
 *
 * The token file is written outside the workspace folder, so the scan never
 * sees it and the `token-atlas-collisions` collection, which `validation` does
 * not control and which also signs itself "Token Atlas", can never report on it.
 * Diagnostics are matched by message as well as source all the same.
 *
 * Closing a document also clears its diagnostics, so each case re-shows the
 * file, and the "off" case checks it is still open: a clear that came from a
 * close would otherwise pass for the switch. (Whichever suite runs first can
 * see the workbench close its editor while it starts up.)
 */
import * as assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as vscode from "vscode"
import type { TokenAtlasTestHooks } from "../../src/extension"

const PROBLEM = "Unresolved reference: {nowhere.at.all}"
const OTHER = "a diagnostic from another source"

/** Poll until `check` returns a truthy value; diagnostics are computed async. */
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

const validation = (value: string | undefined) =>
  vscode.workspace
    .getConfiguration("tokenAtlas")
    .update("validation", value, vscode.ConfigurationTarget.Global)

describe("tokenAtlas.validation", () => {
  const dir = mkdtempSync(join(tmpdir(), "token-atlas-validation-"))
  const uri = vscode.Uri.file(join(dir, "validation.json"))
  let other: vscode.DiagnosticCollection

  /** Token Atlas's report of the fixture's problem. */
  const reported = () =>
    vscode.languages
      .getDiagnostics(uri)
      .filter(d => d.source === "Token Atlas" && d.message === PROBLEM)
  /** The test's own diagnostic, standing in for any other extension's. */
  const foreign = () =>
    vscode.languages.getDiagnostics(uri).filter(d => d.message === OTHER)
  const isOpen = () =>
    vscode.workspace.textDocuments.some(
      d => d.uri.toString() === uri.toString(),
    )
  const show = async () =>
    vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri))

  before(async () => {
    const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>(
      "chrisgriffinio.token-atlas",
    )
    assert.ok(ext, "extension not found")
    await ext.activate()

    writeFileSync(
      uri.fsPath,
      JSON.stringify(
        { alias: { $type: "color", $value: "{nowhere.at.all}" } },
        null,
        2,
      ),
    )
    other = vscode.languages.createDiagnosticCollection("validation-test-other")
    const d = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1),
      OTHER,
      vscode.DiagnosticSeverity.Information,
    )
    d.source = "other"
    other.set(uri, [d])
  })

  beforeEach(show)

  after(async () => {
    await validation(undefined)
    other.dispose()
    await vscode.commands.executeCommand("workbench.action.closeAllEditors")
    rmSync(dir, { recursive: true, force: true })
  })

  it("reports the problem at the default, on", async () => {
    assert.equal(
      vscode.workspace.getConfiguration("tokenAtlas", uri).get("validation"),
      "on",
    )
    await waitFor(
      () => reported().length === 1,
      "the unresolved reference reported",
    )
    assert.equal(reported()[0].severity, vscode.DiagnosticSeverity.Error)
    assert.equal(
      foreign().length,
      1,
      "the other source's diagnostic is present",
    )
  })

  it("clears Token Atlas's diagnostics when switched off, leaving other sources", async () => {
    await waitFor(
      () => reported().length === 1,
      "the unresolved reference reported",
    )
    await validation("off")
    await waitFor(
      () => reported().length === 0,
      "Token Atlas's diagnostic cleared",
    )
    assert.ok(
      isOpen(),
      "the document closed, so the clear proves nothing about the switch",
    )
    assert.deepEqual(
      vscode.languages
        .getDiagnostics(uri)
        .filter(d => d.source === "Token Atlas"),
      [],
      "no Token Atlas diagnostic of any kind remains",
    )
    assert.equal(
      foreign().length,
      1,
      "the other source's diagnostic is untouched",
    )
  })

  it("reports the problem again when switched back on", async () => {
    await validation("off")
    await waitFor(
      () => reported().length === 0,
      "Token Atlas's diagnostic cleared",
    )
    await validation("on")
    await waitFor(
      () => reported().length === 1,
      "the unresolved reference reported again",
    )
    assert.ok(isOpen(), "the document closed")
    assert.equal(
      foreign().length,
      1,
      "the other source's diagnostic is still there",
    )
  })
})
