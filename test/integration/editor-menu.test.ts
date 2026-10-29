/**
 * The visual editor's right-click menu (spec 022), inside a real VS Code.
 *
 * VS Code has no API for right-clicking inside a webview, so each command is
 * run with the argument a `webview/context` entry passes: the row's merged
 * `data-vscode-context` plus `webview`, the shape
 * `test/webview/contextMenu.test.tsx` pins on the webview side. Which items a
 * row shows is the manifest's `when` clauses, held to those contexts by
 * `test/ci/manifest-couplings.test.ts`.
 *
 * The suite writes its own file and removes it after, as
 * `deprecation-workflow.test.ts` does, so the token-file list
 * `panel.test.ts` asserts is untouched.
 */
import * as assert from "node:assert/strict"
import { rmSync, writeFileSync } from "node:fs"
import * as vscode from "vscode"
import type { TokenAtlasTestHooks } from "../../src/extension"

const workspace = vscode.workspace.workspaceFolders![0].uri
const baseName = (uri: vscode.Uri) =>
  uri.path.slice(uri.path.lastIndexOf("/") + 1)
const TOKENS = "menu.tokens.json"
const tokens = vscode.Uri.joinPath(workspace, TOKENS)

const FIXTURE = `{
  "menu": {
    "$type": "color",
    "ink": { "$value": { "colorSpace": "srgb", "components": [0, 0, 0] } },
    "old": {
      "$value": { "colorSpace": "srgb", "components": [0.5, 0.5, 0.5] },
      "$deprecated": "use {menu.ink} instead"
    },
    "spare": { "$value": { "colorSpace": "srgb", "components": [1, 1, 1] } },
    "button": { "$value": "{menu.ink}" }
  }
}
`

let hooks: TokenAtlasTestHooks

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

const config = () => vscode.workspace.getConfiguration("tokenAtlas")
const setWorkflow = (on: boolean | undefined) =>
  config().update("deprecationWorkflow", on, vscode.ConfigurationTarget.Global)

const textOf = async () =>
  (await vscode.workspace.openTextDocument(tokens)).getText()

/** Replace the fixture's whole text and save it. */
async function rewrite(text: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(tokens)
  const edit = new vscode.WorkspaceEdit()
  edit.replace(
    tokens,
    new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)),
    text,
  )
  await vscode.workspace.applyEdit(edit)
  assert.ok(await doc.save(), `${TOKENS} was not saved`)
}

/** What a right-click on `path`'s row passes its command. */
const row = (path: string[], section = "token") => ({
  webview: "tokenAtlas.tokenEditor.any",
  uri: tokens.toString(),
  webviewSection: section,
  path,
})

/** Open the visual editor on the fixture and wait until it takes intents. */
async function openEditor(): Promise<void> {
  await vscode.commands.executeCommand(
    "vscode.openWith",
    tokens,
    "tokenAtlas.tokenEditor.any",
  )
  await waitFor(async () => {
    try {
      await hooks.tokenEditor.receive(tokens, { type: "setScope", path: [] })
      return true
    } catch {
      return false
    }
  }, "the visual editor to take intents")
}

describe("The visual editor's right-click menu", () => {
  before(async () => {
    const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>(
      "chrisgriffinio.token-atlas",
    )
    assert.ok(ext, "extension not found")
    hooks = await ext.activate()
    writeFileSync(tokens.fsPath, FIXTURE)
  })

  beforeEach(async () => {
    await setWorkflow(undefined)
    await rewrite(FIXTURE)
    await vscode.commands.executeCommand("workbench.action.closeAllEditors")
  })

  after(async () => {
    await setWorkflow(undefined)
    // Emptied of DTCG keys first, then re-scanned on the exclude lever, as
    // token-editor-writes.test.ts explains.
    await rewrite('{ "gone": true }\n')
    await vscode.commands.executeCommand("workbench.action.closeAllEditors")
    rmSync(tokens.fsPath, { force: true })
    await config().update(
      "exclude",
      [`**/${TOKENS}`],
      vscode.ConfigurationTarget.Global,
    )
    await config().update(
      "exclude",
      undefined,
      vscode.ConfigurationTarget.Global,
    )
    const listed = async () =>
      ((await hooks.tokenTree.provider.getChildren()) ?? []) as Array<{
        uri: vscode.Uri
      }>
    await waitFor(
      async () => !(await listed()).some(i => baseName(i.uri) === TOKENS),
      `${TOKENS} to leave the Tokens panel`,
    )
  })

  it("Copy Reference puts the row's {reference} on the clipboard", async () => {
    const copied = await vscode.commands.executeCommand(
      "tokenAtlas.copyReference",
      row(["menu", "ink"], "inherited"),
    )
    assert.equal(copied, "{menu.ink}")
    assert.equal(await vscode.env.clipboard.readText(), "{menu.ink}")
  })

  it("Find All References finds what Shift+F12 on the key finds", async () => {
    const found = await waitFor(async () => {
      const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        "tokenAtlas.findReferences",
        row(["menu", "ink"]),
      )
      return locations?.length ? locations : undefined
    }, "a reference to menu.ink")
    const doc = await vscode.workspace.openTextDocument(tokens)
    const texts = found
      .filter(l => baseName(l.uri) === TOKENS)
      .map(l => doc.getText(l.range))
    assert.ok(
      texts.some(t => t.includes("button")),
      `no hit on menu.button: ${JSON.stringify(texts)}`,
    )
  })

  it("Show in JSON opens the text with the key selected", async () => {
    await openEditor()
    const editor = await vscode.commands.executeCommand<vscode.TextEditor>(
      "tokenAtlas.showInJson",
      row(["menu", "spare"]),
    )
    assert.equal(editor.document.uri.toString(), tokens.toString())
    assert.equal(editor.document.getText(editor.selection), '"spare"')
  })

  it("Rename… renames the row through the editor's own rename", async () => {
    await openEditor()
    await vscode.commands.executeCommand(
      "tokenAtlas.renameNode",
      row(["menu", "spare"]),
      "white",
    )
    const text = await waitFor(async () => {
      const t = await textOf()
      return t.includes('"white"') ? t : undefined
    }, "the rename")
    assert.ok(!text.includes('"spare"'))
  })

  it("Delete removes the row's token", async () => {
    await openEditor()
    await vscode.commands.executeCommand(
      "tokenAtlas.deleteNode",
      row(["menu", "spare"]),
    )
    await waitFor(
      async () => !(await textOf()).includes('"spare"'),
      "the delete",
    )
  })

  it("Delete on a group heading removes the group", async () => {
    await openEditor()
    await vscode.commands.executeCommand(
      "tokenAtlas.deleteNode",
      row(["menu"], "group"),
    )
    await waitFor(
      async () => !(await textOf()).includes('"menu"'),
      "the group delete",
    )
  })

  describe("with the deprecation workflow on", () => {
    beforeEach(() => setWorkflow(true))

    it("Deprecate Token… deprecates the row's token", async () => {
      await vscode.commands.executeCommand(
        "tokenAtlas.deprecateToken",
        row(["menu", "spare"]),
        undefined,
        "Too bright",
        "menu.ink",
      )
      const doc = await vscode.workspace.openTextDocument(tokens)
      const spare = JSON.parse(doc.getText()).menu.spare
      assert.match(spare.$deprecated, /Too bright/)
      assert.match(spare.$deprecated, /\{menu\.ink\}/)
    })

    it("Find Remaining Uses lists the row's uses", async () => {
      await rewrite(FIXTURE.replace('"{menu.ink}"', '"{menu.old}"'))
      const uses = await waitFor(async () => {
        const found = await vscode.commands.executeCommand<vscode.Location[]>(
          "tokenAtlas.findDeprecatedUses",
          row(["menu", "old"]),
        )
        return found?.length ? found : undefined
      }, "a use of menu.old")
      assert.equal(uses.length, 1)
    })

    it("Remove Deprecated Token removes the row's token", async () => {
      assert.equal(
        await vscode.commands.executeCommand(
          "tokenAtlas.removeDeprecatedToken",
          row(["menu", "old"]),
        ),
        true,
      )
      assert.ok(!(await textOf()).includes('"old"'))
    })

    it("Rename Token Without Keeping Old Name leaves no alias", async () => {
      assert.equal(
        await vscode.commands.executeCommand(
          "tokenAtlas.renameWithoutAlias",
          row(["menu", "spare"]),
          undefined,
          "white",
        ),
        true,
      )
      const text = await textOf()
      assert.ok(text.includes('"white"'))
      assert.ok(!text.includes('"spare"'))
    })
  })
})
