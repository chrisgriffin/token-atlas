/**
 * The deprecation workflow setting, inside a real VS Code (spec 019, #36):
 * off, rename and delete behave as they always have and the deprecation
 * commands refuse; on, rename keeps the old name as a deprecated alias and
 * says so, `Rename Token Without Keeping Old Name` and Remove alias undo
 * that, and deleting a token that is still used offers to deprecate it.
 *
 * The suite writes its own files and removes them after, as
 * `deprecation-flow.test.ts` does, so the token-file list `panel.test.ts`
 * asserts is untouched. The core cases — groups, `a → b → c`, renaming
 * back, a deprecated replacement, per-file brands — are in
 * `test/core/rename-alias.test.ts`.
 */
import * as assert from "node:assert/strict"
import { rmSync, writeFileSync } from "node:fs"
import * as vscode from "vscode"
import type { TokenAtlasTestHooks } from "../../src/extension"

const workspace = vscode.workspace.workspaceFolders![0].uri
const baseName = (uri: vscode.Uri) =>
  uri.path.slice(uri.path.lastIndexOf("/") + 1)
const TOKENS = "workflow.tokens.json"
const USES = "workflow-uses.tokens.json"
const tokens = vscode.Uri.joinPath(workspace, TOKENS)
const uses = vscode.Uri.joinPath(workspace, USES)
const css = vscode.Uri.joinPath(workspace, "workflow.css")
const generated = vscode.Uri.joinPath(workspace, "workflow-generated.css")

const FIXTURE = `{
    "wf": {
        "$type": "color",
        "subtle": {
            "$value": { "colorSpace": "srgb", "components": [0.9, 0.9, 0.9] }
        },
        "strong": {
            "$value": { "colorSpace": "srgb", "components": [0.2, 0.2, 0.2] }
        },
        "button": { "$value": "{wf.subtle}" }
    }
}
`
const USES_FIXTURE = `{
  "card": { "$type": "color", "border": { "$value": "{wf.subtle}" } }
}
`
const CSS = ".card { border-color: var(--wf-subtle); }\n"
const GENERATED = `/**
 * Do not edit directly, this file was generated automatically.
 */
.chip { color: var(--wf-subtle); }
`
const ALIAS =
  '        "subtle": { "$value": "{wf.muted}", "$deprecated": "Renamed; use {wf.muted} instead" },'

type Intent = Parameters<TokenAtlasTestHooks["tokenEditor"]["receive"]>[1]
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

const textOf = async (uri: vscode.Uri) =>
  (await vscode.workspace.openTextDocument(uri)).getText()

/** Replace `uri`'s whole text and save it. */
async function rewrite(uri: vscode.Uri, text: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(uri)
  const edit = new vscode.WorkspaceEdit()
  edit.replace(
    uri,
    new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)),
    text,
  )
  await vscode.workspace.applyEdit(edit)
  assert.ok(await doc.save(), `${baseName(uri)} was not saved`)
}

/** F2 on `wf.subtle`'s key: the edit the rename provider offers, applied. */
async function f2(newName: string): Promise<vscode.WorkspaceEdit> {
  const doc = await vscode.workspace.openTextDocument(tokens)
  const at = doc.positionAt(doc.getText().indexOf('"subtle"') + 1)
  const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
    "vscode.executeDocumentRenameProvider",
    tokens,
    at,
    newName,
  )
  assert.ok(edit, "no rename edit")
  assert.ok(await vscode.workspace.applyEdit(edit))
  return edit
}

/** Send the visual editor on the token file an intent, once it is ready. */
async function intent(msg: Intent): Promise<void> {
  await vscode.commands.executeCommand(
    "vscode.openWith",
    tokens,
    "tokenAtlas.tokenEditor.any",
  )
  await waitFor(async () => {
    try {
      await hooks.tokenEditor.receive(tokens, msg)
      return true
    } catch {
      return false
    }
  }, "the visual editor to take the intent")
}

/** Wait until the rename walk reaches every fixture, so a rename moves them all. */
async function indexed(): Promise<void> {
  await waitFor(async () => {
    const doc = await vscode.workspace.openTextDocument(tokens)
    const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
      "vscode.executeDocumentRenameProvider",
      tokens,
      doc.positionAt(doc.getText().indexOf('"subtle"') + 1),
      "probe",
    )
    const names = edit?.entries().map(([uri]) => baseName(uri)) ?? []
    return names.includes(USES) && names.includes("workflow.css")
  }, "the rename walk to reach every fixture")
}

describe("The deprecation workflow setting", () => {
  let notices: string[]
  let restoreNotice: () => void

  before(async () => {
    const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>(
      "chrisgriffinio.token-atlas",
    )
    assert.ok(ext, "extension not found")
    hooks = await ext.activate()
    writeFileSync(tokens.fsPath, FIXTURE)
    writeFileSync(uses.fsPath, USES_FIXTURE)
    writeFileSync(css.fsPath, CSS)
    writeFileSync(generated.fsPath, GENERATED)
  })

  beforeEach(async () => {
    await setWorkflow(true)
    await rewrite(tokens, FIXTURE)
    await rewrite(uses, USES_FIXTURE)
    await rewrite(css, CSS)
    await rewrite(generated, GENERATED)
    await vscode.commands.executeCommand("workbench.action.closeAllEditors")
    await indexed()
    notices = []
    restoreNotice = hooks.setAliasNotice(async message => {
      notices.push(message)
      return undefined
    })
  })

  afterEach(() => restoreNotice())

  after(async () => {
    await setWorkflow(undefined)
    // Emptied of DTCG keys first, then re-scanned on the exclude lever, as
    // token-editor-writes.test.ts explains.
    await rewrite(tokens, '{ "gone": true }\n')
    await rewrite(uses, '{ "gone": true }\n')
    await vscode.commands.executeCommand("workbench.action.closeAllEditors")
    for (const uri of [tokens, uses, css, generated])
      rmSync(uri.fsPath, { force: true })
    await config().update(
      "exclude",
      [`**/${TOKENS}`, `**/${USES}`],
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
      async () =>
        !(await listed()).some(i => [TOKENS, USES].includes(baseName(i.uri))),
      "the written fixtures dropped from the panel",
    )
  })

  it("is off by default", () => {
    assert.equal(
      config().inspect<boolean>("deprecationWorkflow")?.defaultValue,
      false,
    )
  })

  it("off: rename keeps no old name, and the deprecation commands refuse", async () => {
    await setWorkflow(false)
    await f2("muted")
    const text = await textOf(tokens)
    assert.ok(!text.includes('"subtle"'), text)
    assert.ok(text.includes('"button": { "$value": "{wf.muted}" }'))
    assert.ok((await textOf(uses)).includes("{wf.muted}"))
    assert.deepEqual(notices, [])
    assert.equal(
      await vscode.commands.executeCommand(
        "tokenAtlas.deprecateToken",
        tokens,
        ["wf", "muted"],
        "too faint",
        "wf.strong",
      ),
      false,
    )
    assert.ok(!(await textOf(tokens)).includes("$deprecated"))
    assert.equal(
      await vscode.commands.executeCommand(
        "tokenAtlas.renameWithoutAlias",
        tokens,
        ["wf", "muted"],
        "quiet",
      ),
      false,
    )
  })

  it("off: deleting a used token asks nothing", async () => {
    await setWorkflow(false)
    const asked: string[] = []
    const restore = hooks.setDeletePrompt(async message => {
      asked.push(message)
      return undefined
    })
    try {
      await intent({ type: "deleteNode", path: ["wf", "subtle"] })
      assert.deepEqual(asked, [])
      assert.ok(!(await textOf(tokens)).includes('"subtle"'))
    } finally {
      restore()
    }
  })

  it("on: F2 keeps the old name as a deprecated alias, moves every use, and skips a generated file", async () => {
    await f2("muted")
    const text = await textOf(tokens)
    assert.ok(text.includes(ALIAS), text)
    assert.ok(text.includes('"button": { "$value": "{wf.muted}" }'))
    assert.ok((await textOf(uses)).includes('"$value": "{wf.muted}"'))
    assert.equal(
      await textOf(css),
      ".card { border-color: var(--wf-muted); }\n",
    )
    // Left to the export tool, and still resolving: wf.subtle is the alias.
    assert.equal(await textOf(generated), GENERATED)
    const message = await waitFor(() => notices[0], "the rename notification")
    assert.equal(
      message,
      'Renamed "wf.subtle" to "wf.muted". "wf.subtle" stays as a deprecated alias, so its uses outside this workspace keep working.',
    )
  })

  it("on: the visual editor's rename keeps the alias too, and Remove alias takes it out", async () => {
    restoreNotice()
    restoreNotice = hooks.setAliasNotice(async message => {
      notices.push(message)
      return "Remove alias"
    })
    await intent({
      type: "renameNode",
      path: ["wf", "subtle"],
      newName: "muted",
    })
    await waitFor(() => notices[0], "the rename notification")
    const doc = await vscode.workspace.openTextDocument(tokens)
    await waitFor(
      () => !doc.getText().includes('"subtle"'),
      "the alias to be removed",
    )
    assert.ok(doc.getText().includes('"muted"'))
    assert.ok(doc.getText().includes('"button": { "$value": "{wf.muted}" }'))
  })

  it("on: Rename Token Without Keeping Old Name leaves no alias", async () => {
    const renamed = await vscode.commands.executeCommand<boolean>(
      "tokenAtlas.renameWithoutAlias",
      tokens,
      ["wf", "subtle"],
      "muted",
    )
    assert.equal(renamed, true)
    const text = await textOf(tokens)
    assert.ok(!text.includes('"subtle"'), text)
    assert.ok(text.includes('"button": { "$value": "{wf.muted}" }'))
    assert.deepEqual(notices, [])
  })

  it("on: deleting a used token offers Deprecate instead / Delete anyway / Cancel", async () => {
    const asked: string[] = []
    let answer: Awaited<
      ReturnType<Parameters<TokenAtlasTestHooks["setDeletePrompt"]>[0]>
    > = undefined
    const restore = hooks.setDeletePrompt(async message => {
      asked.push(message)
      return answer
    })
    try {
      // Cancel: nothing changes.
      await intent({ type: "deleteNode", path: ["wf", "subtle"] })
      assert.equal(asked.length, 1)
      assert.match(
        asked[0],
        /^"wf\.subtle" still has \d+ uses\. Deprecate it instead\?$/,
      )
      assert.equal(await textOf(tokens), FIXTURE)

      // Deprecate instead: the token stays, deprecated.
      answer = {
        action: "deprecate",
        reason: "too faint",
        replacement: "wf.strong",
      }
      await intent({ type: "deleteNode", path: ["wf", "subtle"] })
      const deprecated = await textOf(tokens)
      assert.ok(deprecated.includes('"subtle"'))
      assert.ok(
        deprecated.includes(
          '"$deprecated": "too faint; use {wf.strong} instead"',
        ),
        deprecated,
      )

      // Delete anyway: it goes.
      await rewrite(tokens, FIXTURE)
      answer = { action: "delete" }
      await intent({ type: "deleteNode", path: ["wf", "subtle"] })
      assert.ok(!(await textOf(tokens)).includes('"subtle"'))
      assert.equal(asked.length, 3)
    } finally {
      restore()
    }
  })

  it("on: deleting an unused token asks nothing", async () => {
    const asked: string[] = []
    const restore = hooks.setDeletePrompt(async message => {
      asked.push(message)
      return undefined
    })
    try {
      await intent({ type: "deleteNode", path: ["wf", "strong"] })
      assert.deepEqual(asked, [])
      assert.ok(!(await textOf(tokens)).includes('"strong"'))
    } finally {
      restore()
    }
  })
})
