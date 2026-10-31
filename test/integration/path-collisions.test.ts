/**
 * Cross-file path collisions, exercised inside a real VS Code.
 *
 * `refreshCollisions` in `src/host/diagnostics.ts` writes the
 * `token-atlas-collisions` diagnostic collection: on every file that loses a path
 * it shares with another, a report naming the file whose definition the
 * workspace index kept. A path the active editor defines itself is exempt —
 * local-first resolution, invariant 4, and the one place a user sees it at
 * work. `tokenAtlas.pathCollisions` reports it as an information by default,
 * a warning, or not at all. It is workspace-wide and re-runs on active-editor and settings changes,
 * so only the extension host can drive it.
 *
 * The fixtures already exist: `brand-a.tokens.json` and `brand-b.tokens.json`
 * both define `brand.primary`; `shared.tokens.json` references it without
 * defining it, which makes it the neutral active editor. `light.tokens.json`
 * and `dark.tokens.json` both define every `theme.*` path, but
 * `themes.resolver.json` lists them only as contexts of its `theme` modifier:
 * alternatives, so never a collision.
 *
 * The workspace scan is sorted by URI, so brand-a wins on every rescan (an
 * unsorted scan let a rescan mid-suite move the report to the other brand).
 * `before` pins that through go-to-definition.
 */
import * as assert from "node:assert/strict"
import * as vscode from "vscode"
import type { TokenAtlasTestHooks } from "../../src/extension"

const workspace = vscode.workspace.workspaceFolders![0].uri
const file = (name: string) => vscode.Uri.joinPath(workspace, name)
const baseName = (uri: vscode.Uri) =>
  uri.path.slice(uri.path.lastIndexOf("/") + 1)

const BRANDS = ["brand-a.tokens.json", "brand-b.tokens.json"]
const [winner, loser] = BRANDS
const SHARED = "shared.tokens.json"

/** Poll until `check` returns a truthy value; the collision pass is async. */
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

/**
 * The collision reports on `brand.primary` in `name`. `getDiagnostics` merges
 * every collection, so the message is what picks out `token-atlas-collisions`.
 */
const collisionsOn = (name: string, path = "brand.primary") =>
  vscode.languages
    .getDiagnostics(file(name))
    .filter(d => d.message.startsWith(`"${path}" is also defined in`))

const show = async (name: string) =>
  vscode.window.showTextDocument(
    await vscode.workspace.openTextDocument(file(name)),
  )

const pathCollisions = (value: string | undefined) =>
  vscode.workspace
    .getConfiguration("tokenAtlas")
    .update("pathCollisions", value, vscode.ConfigurationTarget.Global)

describe("Path collisions", () => {
  before(async () => {
    const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>(
      "chrisgriffinio.token-atlas",
    )
    assert.ok(ext, "extension not found")
    await ext.activate()
    // Both brands in the index: an active set would hide one from it.
    await vscode.commands.executeCommand("tokenAtlas.chooseActiveSet", [])
    await show(SHARED)

    const doc = await vscode.workspace.openTextDocument(file(SHARED))
    const at = doc.positionAt(doc.getText().indexOf("{brand.primary}") + 2)
    const kept = await waitFor(async () => {
      const found =
        (await vscode.commands.executeCommand<
          Array<vscode.Location | vscode.LocationLink>
        >("vscode.executeDefinitionProvider", doc.uri, at)) ?? []
      const uri = found.map(d => ("targetUri" in d ? d.targetUri : d.uri))[0]
      return uri && BRANDS.includes(baseName(uri)) ? baseName(uri) : undefined
    }, "the index's definition of brand.primary")
    assert.equal(
      kept,
      winner,
      "the index keeps the first file in code-point URI order",
    )
  })

  after(async () => {
    await pathCollisions(undefined)
    await vscode.commands.executeCommand("workbench.action.closeAllEditors")
  })

  it("reports on the losing file at Information, naming the file the index kept", async () => {
    const [report] = await waitFor(() => {
      const found = collisionsOn(loser)
      return found.length ? found : undefined
    }, `a collision on ${loser}`)
    assert.equal(collisionsOn(loser).length, 1)
    assert.equal(report.severity, vscode.DiagnosticSeverity.Information)
    assert.ok(
      report.message.includes(`also defined in ${winner},`),
      report.message,
    )
    assert.deepEqual(collisionsOn(winner), [], "the winner is not reported")
  })

  it("does not report paths shared only by one resolver modifier's contexts", async () => {
    // The brand report proves this pass ran; the theme files are in the same pass.
    await waitFor(
      () => collisionsOn(loser).length === 1,
      `a collision on ${loser}`,
    )
    for (const name of ["light.tokens.json", "dark.tokens.json"])
      assert.deepEqual(
        collisionsOn(name, "theme.background"),
        [],
        `${name} is not reported`,
      )
  })

  it("exempts the active editor's own definition (local-first)", async () => {
    await waitFor(
      () => collisionsOn(loser).length === 1,
      `a collision on ${loser}`,
    )
    await show(loser)
    await waitFor(
      () => collisionsOn(loser).length === 0,
      `${loser}'s own path exempted`,
    )
    await show(SHARED)
    await waitFor(
      () => collisionsOn(loser).length === 1,
      "the report back once it is not active",
    )
  })

  it("reports at Warning when tokenAtlas.pathCollisions is warning", async () => {
    await pathCollisions("warning")
    await waitFor(
      () =>
        collisionsOn(loser)[0]?.severity === vscode.DiagnosticSeverity.Warning,
      "the report raised to Warning",
    )
  })

  it("clears the report when tokenAtlas.pathCollisions is off", async () => {
    await waitFor(
      () => collisionsOn(loser).length === 1,
      `a collision on ${loser}`,
    )
    await pathCollisions("off")
    await waitFor(
      () => BRANDS.every(b => collisionsOn(b).length === 0),
      "no collision on either brand",
    )
  })
})
