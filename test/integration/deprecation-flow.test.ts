/**
 * Carrying a deprecation out, inside a real VS Code (spec 015): deprecate a
 * token with a replacement from the text editor and from the visual editor,
 * move a use onto the replacement by quick fix, list the uses that remain,
 * and say how many before removing the token. All of it is behind
 * `tokenAtlas.deprecationWorkflow` (spec 019), which the suite turns on.
 *
 * The suite writes its own files and removes them after, as
 * `token-editor-writes.test.ts` does, so the token-file list `panel.test.ts`
 * asserts is untouched. `flow-uses.tokens.json` is never shown in an editor:
 * its use must still be listed.
 */
import * as assert from "node:assert/strict"
import { rmSync, writeFileSync } from "node:fs"
import * as vscode from "vscode"
import type { TokenAtlasTestHooks } from "../../src/extension"

const workspace = vscode.workspace.workspaceFolders![0].uri
const baseName = (uri: vscode.Uri) =>
  uri.path.slice(uri.path.lastIndexOf("/") + 1)
const TOKENS = "flow.tokens.json"
const USES = "flow-uses.tokens.json"
const tokens = vscode.Uri.joinPath(workspace, TOKENS)
const uses = vscode.Uri.joinPath(workspace, USES)
const css = vscode.Uri.joinPath(workspace, "flow.css")
const js = vscode.Uri.joinPath(workspace, "flow.js")

const FIXTURE = `{
    // Borders.
    "flow": {
        "$type": "color",
        "subtle": {
            "$value":       { "colorSpace": "srgb", "components": [0.9, 0.9, 0.9] },
            "$description": "Hairline"
        },
        "strong": {
            "$value": { "colorSpace": "srgb", "components": [0.2, 0.2, 0.2] }
        },
        "button": { "$value": "{flow.subtle}" }
    }
}
`
const USES_FIXTURE = `{
  "card": { "$type": "color", "border": { "$value": "{flow.subtle}" } }
}
`
const CSS =
  ".card { border-color: var(--flow-subtle); }\n/* var(--flow-subtle) */\n"
const JS = "export const flowSubtle = 1;\nconst edge = flowSubtle;\n"

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

/** The lines `before` lost and `after` gained, the shared head and tail set aside. */
function changed(
  before: string,
  after: string,
): { lost: string[]; gained: string[] } {
  const a = before.split("\n")
  const b = after.split("\n")
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++
  }
  return {
    lost: a.slice(head, a.length - tail),
    gained: b.slice(head, b.length - tail),
  }
}

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

/** The `deprecated-token` hint covering `text` in `doc`, once diagnostics have it. */
const hintOn = (doc: vscode.TextDocument, text: string) =>
  waitFor(
    () =>
      vscode.languages
        .getDiagnostics(doc.uri)
        .find(
          d => d.code === "deprecated-token" && doc.getText(d.range) === text,
        ),
    `the deprecation hint on ${text} in ${baseName(doc.uri)}`,
  )

/** The replacement quick fixes offered on `range`. */
async function fixes(
  doc: vscode.TextDocument,
  range: vscode.Range,
): Promise<vscode.CodeAction[]> {
  const actions =
    (await vscode.commands.executeCommand<vscode.CodeAction[]>(
      "vscode.executeCodeActionProvider",
      doc.uri,
      range,
      vscode.CodeActionKind.QuickFix.value,
    )) ?? []
  return actions.filter(a => a.title.startsWith("Replace {"))
}

const where = (l: vscode.Location) => `${baseName(l.uri)}:${l.range.start.line}`

/** The token file deprecated from the text editor, as every test after the first needs it. */
async function deprecateSubtle(): Promise<void> {
  const ok = await vscode.commands.executeCommand<boolean>(
    "tokenAtlas.deprecateToken",
    tokens,
    ["flow", "subtle"],
    "too faint",
    "flow.strong",
  )
  assert.ok(ok, "the deprecate command did not apply its edit")
  await (await vscode.workspace.openTextDocument(tokens)).save()
}

describe("Carrying a deprecation out", () => {
  before(async () => {
    const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>(
      "chrisgriffinio.token-atlas",
    )
    assert.ok(ext, "extension not found")
    hooks = await ext.activate()
    await vscode.workspace
      .getConfiguration("tokenAtlas")
      .update("deprecationWorkflow", true, vscode.ConfigurationTarget.Global)
    writeFileSync(tokens.fsPath, FIXTURE)
    writeFileSync(uses.fsPath, USES_FIXTURE)
    writeFileSync(css.fsPath, CSS)
    writeFileSync(js.fsPath, JS)
  })

  beforeEach(async () => {
    await rewrite(tokens, FIXTURE)
    await rewrite(uses, USES_FIXTURE)
    await rewrite(css, CSS)
    await rewrite(js, JS)
    await vscode.commands.executeCommand("workbench.action.closeAllEditors")
  })

  after(async () => {
    await vscode.workspace
      .getConfiguration("tokenAtlas")
      .update(
        "deprecationWorkflow",
        undefined,
        vscode.ConfigurationTarget.Global,
      )
    // Emptied of DTCG keys first, then re-scanned on the exclude lever, as
    // token-editor-writes.test.ts explains.
    await rewrite(tokens, '{ "gone": true }\n')
    await rewrite(uses, '{ "gone": true }\n')
    await vscode.commands.executeCommand("workbench.action.closeAllEditors")
    for (const uri of [tokens, uses, css, js])
      rmSync(uri.fsPath, { force: true })
    const config = () => vscode.workspace.getConfiguration("tokenAtlas")
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

  it("deprecates from the text editor by the $deprecated line alone", async () => {
    const doc = await vscode.workspace.openTextDocument(tokens)
    await vscode.window.showTextDocument(doc)
    const before = doc.getText()
    await deprecateSubtle()
    assert.deepEqual(changed(before, doc.getText()), {
      lost: [],
      gained: [
        '            "$deprecated": "too faint; use {flow.strong} instead",',
      ],
    })
  })

  it("deprecates from the visual editor by the $deprecated line alone", async () => {
    const doc = await vscode.workspace.openTextDocument(tokens)
    await vscode.commands.executeCommand(
      "vscode.openWith",
      tokens,
      "tokenAtlas.tokenEditor.any",
    )
    const before = doc.getText()
    const intent: Intent = {
      type: "setDeprecated",
      path: ["flow", "subtle"],
      deprecated: "too faint",
      replacement: "flow.strong",
    }
    await waitFor(async () => {
      try {
        await hooks.tokenEditor.receive(tokens, intent)
        return true
      } catch {
        return false
      }
    }, "the visual editor to take the intent")
    await doc.save()
    assert.deepEqual(changed(before, doc.getText()), {
      lost: [],
      gained: [
        '            "$deprecated": "too faint; use {flow.strong} instead",',
      ],
    })
  })

  it("offers a quick fix that moves an alias in a token file to the replacement", async () => {
    await deprecateSubtle()
    const doc = await vscode.workspace.openTextDocument(tokens)
    await vscode.window.showTextDocument(doc)
    const hint = await hintOn(doc, "{flow.subtle}")
    const [fix, ...rest] = await waitFor(async () => {
      const found = await fixes(doc, hint.range)
      return found.length ? found : undefined
    }, "the replacement quick fix")
    assert.equal(rest.length, 0)
    assert.equal(fix.title, "Replace {flow.subtle} with {flow.strong}")
    const before = doc.getText()
    assert.ok(await vscode.workspace.applyEdit(fix.edit!))
    assert.deepEqual(changed(before, doc.getText()), {
      lost: ['        "button": { "$value": "{flow.subtle}" }'],
      gained: ['        "button": { "$value": "{flow.strong}" }'],
    })
  })

  it("offers the same quick fix on an exported name in a stylesheet and in code", async () => {
    await deprecateSubtle()
    for (const [uri, use, next] of [
      [css, "--flow-subtle", ".card { border-color: var(--flow-strong); }"],
      [js, "flowSubtle", "const edge = flowStrong;"],
    ] as const) {
      const doc = await vscode.workspace.openTextDocument(uri)
      await vscode.window.showTextDocument(doc)
      const hint = await hintOn(doc, use)
      const [fix, ...rest] = await waitFor(
        async () => {
          const found = await fixes(doc, hint.range)
          return found.length ? found : undefined
        },
        `the replacement quick fix in ${baseName(uri)}`,
      )
      assert.equal(rest.length, 0)
      assert.equal(fix.title, "Replace {flow.subtle} with {flow.strong}")
      const before = doc.getText()
      assert.ok(await vscode.workspace.applyEdit(fix.edit!))
      const { lost, gained } = changed(before, doc.getText())
      assert.equal(lost.length, 1, `${baseName(uri)}: ${JSON.stringify(lost)}`)
      assert.deepEqual(gained, [next])
    }
  })

  it("offers no quick fix when the deprecation names no replacement", async () => {
    await vscode.commands.executeCommand(
      "tokenAtlas.deprecateToken",
      tokens,
      ["flow", "subtle"],
      "going away",
      "",
    )
    const doc = await vscode.workspace.openTextDocument(tokens)
    await vscode.window.showTextDocument(doc)
    const hint = await hintOn(doc, "{flow.subtle}")
    assert.deepEqual(await fixes(doc, hint.range), [])
  })

  it("lists every remaining use, in files no editor has opened", async () => {
    await deprecateSubtle()
    await vscode.commands.executeCommand("workbench.action.closeAllEditors")
    const found = await waitFor(async () => {
      const list = await vscode.commands.executeCommand<vscode.Location[]>(
        "tokenAtlas.findDeprecatedUses",
        tokens,
        ["flow", "subtle"],
      )
      return list.length >= 4 ? list : undefined
    }, "the remaining uses")
    // The CSS comment and the JS declaration are not uses.
    assert.deepEqual(found.map(where).sort(), [
      "flow-uses.tokens.json:1",
      "flow.css:0",
      "flow.js:1",
      "flow.tokens.json:12",
    ])
    assert.ok(
      !vscode.window.visibleTextEditors.some(
        e => baseName(e.document.uri) === USES,
      ),
      "the unopened file was shown",
    )
  })

  it("states the remaining count before removing a deprecated token, and asks nothing once unused", async () => {
    await deprecateSubtle()
    const asked: string[] = []
    const restore = hooks.setRemovalPrompt(async message => {
      asked.push(message)
      return false
    })
    try {
      await waitFor(async () => {
        const list = await vscode.commands.executeCommand<vscode.Location[]>(
          "tokenAtlas.findDeprecatedUses",
          tokens,
          ["flow", "subtle"],
        )
        return list.length >= 4 ? true : undefined
      }, "the uses to be indexed")
      const removed = await vscode.commands.executeCommand<boolean>(
        "tokenAtlas.removeDeprecatedToken",
        tokens,
        ["flow", "subtle"],
      )
      assert.equal(removed, false)
      assert.deepEqual(asked, [
        '"flow.subtle" is deprecated and still has 4 uses. Remove it anyway?',
      ])
      assert.ok(
        (await vscode.workspace.openTextDocument(tokens))
          .getText()
          .includes('"subtle"'),
      )

      // Move every use off it, then removal asks nothing.
      await rewrite(
        uses,
        USES_FIXTURE.replace("{flow.subtle}", "{flow.strong}"),
      )
      await rewrite(css, ".card { border-color: var(--flow-strong); }\n")
      await rewrite(js, "export const flowStrong = 1;\n")
      const doc = await vscode.workspace.openTextDocument(tokens)
      await rewrite(
        tokens,
        doc
          .getText()
          .replace('"$value": "{flow.subtle}"', '"$value": "{flow.strong}"'),
      )
      await waitFor(async () => {
        const list = await vscode.commands.executeCommand<vscode.Location[]>(
          "tokenAtlas.findDeprecatedUses",
          tokens,
          ["flow", "subtle"],
        )
        return list.length === 0 ? true : undefined
      }, "no uses left")
      const gone = await vscode.commands.executeCommand<boolean>(
        "tokenAtlas.removeDeprecatedToken",
        tokens,
        ["flow", "subtle"],
      )
      assert.equal(gone, true)
      assert.equal(asked.length, 1, "removing an unused token asked")
      assert.ok(!doc.getText().includes('"subtle"'))
      await doc.save()
    } finally {
      restore()
    }
  })

  it("the visual editor's delete takes the same guard", async () => {
    await deprecateSubtle()
    const asked: string[] = []
    const restore = hooks.setRemovalPrompt(async message => {
      asked.push(message)
      return false
    })
    try {
      const doc = await vscode.workspace.openTextDocument(tokens)
      await vscode.commands.executeCommand(
        "vscode.openWith",
        tokens,
        "tokenAtlas.tokenEditor.any",
      )
      const before = doc.getText()
      await waitFor(async () => {
        try {
          await hooks.tokenEditor.receive(tokens, {
            type: "deleteNode",
            path: ["flow", "subtle"],
          })
          return true
        } catch {
          return false
        }
      }, "the visual editor to take the intent")
      assert.equal(asked.length, 1)
      assert.match(
        asked[0],
        /^"flow\.subtle" is deprecated and still has \d+ uses?\. Remove it anyway\?$/,
      )
      assert.equal(doc.getText(), before)
    } finally {
      restore()
    }
  })
})
