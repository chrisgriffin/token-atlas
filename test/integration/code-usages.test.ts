/**
 * Token usages in exported code, exercised inside a real VS Code (#388).
 *
 * Find All References on a token key also lists the CSS, Sass and JS
 * identifiers `core/exportNames.ts` matches back to it (the reverse of
 * exports.test.ts), and `tokenAtlas.unusedTokens` hints the tokens nothing
 * uses. The fixtures are the exported.css / .scss / .js files beside
 * primitives.tokens.json; `color.base.white` appears in all three and
 * `color.base.p3-red` is referenced nowhere.
 */
import * as assert from "node:assert/strict"
import * as vscode from "vscode"

const workspace = vscode.workspace.workspaceFolders![0].uri
const file = (name: string) => vscode.Uri.joinPath(workspace, name)
const config = () => vscode.workspace.getConfiguration("tokenAtlas")

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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Every URI whose diagnostics change while `act` runs and for `settle` ms after. */
async function diagnosticChanges(
  act: () => Promise<void>,
  settle = 1500,
): Promise<Set<string>> {
  // Let earlier work land first, so only `act`'s own refreshes are counted.
  let last = Date.now()
  const idle = vscode.languages.onDidChangeDiagnostics(
    () => (last = Date.now()),
  )
  await waitFor(() => Date.now() - last > 1000, "diagnostics to settle")
  idle.dispose()
  const changed = new Set<string>()
  const sub = vscode.languages.onDidChangeDiagnostics(e => {
    for (const uri of e.uris) changed.add(uri.toString())
  })
  try {
    await act()
    await sleep(settle)
  } finally {
    sub.dispose()
  }
  return changed
}

/** Appends `text` to exported.css, unsaved, in the active editor; `revert` undoes it. */
async function editCss(text: string) {
  const doc = await vscode.workspace.openTextDocument(file("exported.css"))
  await vscode.window.showTextDocument(doc)
  const edit = new vscode.WorkspaceEdit()
  edit.insert(doc.uri, doc.positionAt(doc.getText().length), text)
  assert.ok(await vscode.workspace.applyEdit(edit), "edit applied")
  return {
    revert: async () => {
      await vscode.window.showTextDocument(doc)
      await vscode.commands.executeCommand("workbench.action.files.revert")
    },
  }
}

/** The position of the `"<key>"` member key in primitives.tokens.json. */
async function keyPosition(key: string) {
  const uri = file("primitives.tokens.json")
  const doc = await vscode.workspace.openTextDocument(uri)
  const offset = doc.getText().indexOf(`"${key}"`)
  assert.notEqual(offset, -1, `primitives.tokens.json no longer defines ${key}`)
  return { uri, doc, position: doc.positionAt(offset + 1) }
}

describe("Token usages in exported code", () => {
  after(async () => {
    await config().update(
      "unusedTokens",
      undefined,
      vscode.ConfigurationTarget.Global,
    )
  })

  it("Find All References on a token lists its CSS, Sass and JS usages", async () => {
    const { uri, position } = await keyPosition("white")
    const found = await waitFor(async () => {
      const all =
        (await vscode.commands.executeCommand<vscode.Location[]>(
          "vscode.executeReferenceProvider",
          uri,
          position,
        )) ?? []
      const code = all.filter(l => /\.(css|scss|js)$/.test(l.uri.path))
      return code.length >= 6 ? code : undefined
    }, "code references to color.base.white")

    const described = await Promise.all(
      found!.map(async l => {
        const doc = await vscode.workspace.openTextDocument(l.uri)
        return `${l.uri.path.split("/").pop()} ${doc.getText(l.range)}`
      }),
    )
    assert.deepEqual(described.sort(), [
      "exported.css --color-base-white",
      "exported.css --color-base-white",
      "exported.js colorBaseWhite",
      "exported.js tokens.color.base.white",
      "exported.scss $color-base-white",
      "exported.scss $color-base-white",
    ])
  })

  it("hints unused tokens only when tokenAtlas.unusedTokens is on", async () => {
    const { uri, doc } = await keyPosition("p3-red")
    await vscode.window.showTextDocument(doc)
    const unused = () =>
      vscode.languages
        .getDiagnostics(uri)
        .filter(d => d.code === "unused-token")
        .map(d => doc.getText(d.range))

    assert.deepEqual(unused(), [], "off by default")
    await config().update(
      "unusedTokens",
      "information",
      vscode.ConfigurationTarget.Global,
    )
    const flagged = await waitFor(
      () => (unused().length ? unused() : undefined),
      "unused-token diagnostics",
    )
    assert.ok(
      flagged!.includes('"p3-red"'),
      `p3-red should be unused: ${flagged}`,
    )
    assert.ok(
      !flagged!.includes('"white"'),
      "white is used in code and by aliases",
    )

    await config().update(
      "unusedTokens",
      "off",
      vscode.ConfigurationTarget.Global,
    )
    await waitFor(() => unused().length === 0, "unused hints cleared")
  })

  it("with the unused-token hint off, a code edit leaves token-file diagnostics alone", async () => {
    // #449: only the hint reads code usages, so nothing else re-runs for a code edit.
    await config().update(
      "unusedTokens",
      "off",
      vscode.ConfigurationTarget.Global,
    )
    const { uri } = await keyPosition("white")
    let css: { revert: () => Promise<void> } | undefined
    const changed = await diagnosticChanges(async () => {
      css = await editCss("\n.b { color: var(--color-base-white); }\n")
    })
    await css!.revert()
    assert.ok(
      !changed.has(uri.toString()),
      `a CSS edit re-checked primitives.tokens.json: ${[...changed].join(", ")}`,
    )
  })

  it("with the unused-token hint on, a code edit updates the hints after a pause", async () => {
    const { uri, doc } = await keyPosition("p3-red")
    await vscode.window.showTextDocument(doc)
    const flagged = () =>
      vscode.languages
        .getDiagnostics(uri)
        .some(
          d => d.code === "unused-token" && doc.getText(d.range) === '"p3-red"',
        )

    await config().update(
      "unusedTokens",
      "information",
      vscode.ConfigurationTarget.Global,
    )
    await waitFor(flagged, "p3-red hinted as unused")
    const css = await editCss("\n.c { color: var(--color-base-p3-red); }\n")
    await waitFor(() => !flagged(), "p3-red no longer unused once CSS uses it")
    await css.revert()
    await waitFor(flagged, "p3-red unused again after the revert")
    await config().update(
      "unusedTokens",
      "off",
      vscode.ConfigurationTarget.Global,
    )
  })
})
