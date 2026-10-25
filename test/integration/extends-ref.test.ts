/**
 * Group `$extends` and `$ref` JSON Pointers (DTCG 2025.10 §6.4, §7), through
 * the real hover, definition and inlay hint providers.
 *
 * The probe is an untitled document, so the workspace's fixture files — whose
 * token and swatch counts other suites pin — are untouched. It extends
 * `color.base`, a group only `primitives.tokens.json` defines, so the
 * inheritance crosses files through the workspace index, and it points at a
 * token of its own with `$ref`. Each case opens its own probe: the root
 * `afterEach` hooks in color.test.ts and detection.test.ts close every editor
 * after every case in every file, and a closed untitled probe comes back empty.
 */
import * as assert from "node:assert/strict"
import * as vscode from "vscode"
import type { TokenAtlasTestHooks } from "../../src/extension"

const PROBE = JSON.stringify(
  {
    surface: { $extends: "{color.base}" },
    page: { $value: "{surface.white}" },
    accent: {
      $type: "color",
      $value: { colorSpace: "srgb", components: [1, 0, 0] },
    },
    alert: { $ref: "#/accent/$value", $type: "color" },
  },
  null,
  2,
)

/** Poll until `check` returns a value; the workspace index is built lazily. */
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

describe("$extends and $ref", () => {
  let probe: vscode.TextDocument
  const at = (needle: string) => {
    const offset = probe.getText().indexOf(needle)
    assert.notEqual(offset, -1, `the probe no longer contains ${needle}`)
    return probe.positionAt(offset + 2)
  }
  const hoverAt = async (needle: string) =>
    (
      await vscode.commands.executeCommand<vscode.Hover[]>(
        "vscode.executeHoverProvider",
        probe.uri,
        at(needle),
      )
    )
      .flatMap(h => h.contents.map(c => (typeof c === "string" ? c : c.value)))
      .join("\n")
  const definitionAt = async (needle: string) =>
    (
      (await vscode.commands.executeCommand<
        Array<vscode.Location | vscode.LocationLink>
      >("vscode.executeDefinitionProvider", probe.uri, at(needle))) ?? []
    ).map(d =>
      "targetUri" in d
        ? new vscode.Location(d.targetUri, d.targetRange)
        : (d as vscode.Location),
    )

  before(async () => {
    const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>(
      "chrisgriffinio.token-atlas",
    )
    assert.ok(ext, "extension not found")
    await ext.activate()
  })

  beforeEach(async () => {
    probe = await vscode.workspace.openTextDocument({
      language: "json",
      content: PROBE,
    })
  })

  it("hovers a token inherited from a group in another file", async () => {
    const hover = await waitFor(async () => {
      const md = await hoverAt('"{surface.white}"')
      return md.includes("#ffffff") ? md : undefined
    }, "the hover of {surface.white} to show primitives.tokens.json's white")
    assert.match(
      hover,
      /color\.base\.white/,
      "the hover does not name the origin",
    )
  })

  it("shows an inlay hint with the value of a token inherited from another file", async () => {
    const label = await waitFor(async () => {
      const hints =
        (await vscode.commands.executeCommand<vscode.InlayHint[]>(
          "vscode.executeInlayHintProvider",
          probe.uri,
          new vscode.Range(0, 0, probe.lineCount, 0),
        )) ?? []
      const hint = hints.find(
        h =>
          probe.offsetAt(h.position) ===
          probe.getText().indexOf('"{surface.white}"') + 17,
      )
      if (!hint) return undefined
      return typeof hint.label === "string"
        ? hint.label
        : hint.label.map(p => p.value).join("")
    }, "an inlay hint after {surface.white}")
    assert.equal(label, "= #ffffff")
  })

  it("goes to the inherited token's origin, in the file it was copied from", async () => {
    const [definition, ...rest] = await waitFor(async () => {
      const found = await definitionAt('"{surface.white}"')
      return found.length ? found : undefined
    }, "a definition for {surface.white}")
    assert.deepEqual(rest, [])
    assert.ok(
      definition.uri.path.endsWith("primitives.tokens.json"),
      definition.uri.path,
    )
    const doc = await vscode.workspace.openTextDocument(definition.uri)
    assert.equal(doc.getText(definition.range), '"white"')
  })

  it("goes from an $extends value to the group it names", async () => {
    const [definition] = await waitFor(async () => {
      const found = await definitionAt('"{color.base}"')
      return found.length ? found : undefined
    }, "a definition for the $extends target")
    assert.ok(
      definition.uri.path.endsWith("primitives.tokens.json"),
      definition.uri.path,
    )
    const doc = await vscode.workspace.openTextDocument(definition.uri)
    assert.equal(doc.getText(definition.range), '"base"')
  })

  it("hovers and goes to definition through a $ref pointer", async () => {
    const hover = await waitFor(async () => {
      const md = await hoverAt('"#/accent/$value"')
      return md.includes("#ff0000") ? md : undefined
    }, "the hover of the $ref to show accent's red")
    assert.match(hover, /accent/)
    const [definition] = await definitionAt('"#/accent/$value"')
    assert.ok(definition, "no definition for the $ref")
    assert.equal(definition.uri.toString(), probe.uri.toString())
    assert.equal(probe.getText(definition.range), '"accent"')
  })
})
