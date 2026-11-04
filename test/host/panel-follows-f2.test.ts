/**
 * The visual editor's detail panel after an F2 rename in the text editor
 * (#68): VS Code applies F2's edit now, after the refactor preview, or never,
 * so the host tells the open editor what was renamed only once the edit has
 * landed. The webview's side — following `renamed` for the node the panel is
 * on or inside, and staying put for any other — is pinned in
 * `test/webview/contextMenu.test.tsx`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("vscode", () => import("./vscode-stub"))

import * as stub from "./vscode-stub"
import { registerRename } from "../../src/host/rename"
import { TokenEditorProvider } from "../../src/host/tokenEditorProvider"
import {
  invalidateWorkspaceIndex,
  registerIndexInvalidation,
} from "../../src/host/workspaceIndex"
import type { HostToWebview } from "../../src/shared/protocol"

const PATH = "/ws/colors.tokens.json"
const TOKENS = JSON.stringify(
  {
    color: {
      $type: "color",
      ink: { $value: "#000000" },
      old: { $value: "#111111" },
    },
  },
  null,
  2,
)

const context = {
  extensionUri: stub.Uri.file("/ext"),
  globalState: { get: <T>(_key: string, fallback: T) => fallback },
  subscriptions: [],
}

/** Opens the Token Editor on the file; returns what the host posts to it. */
async function openEditor() {
  const { doc } = stub.openDocument(PATH, TOKENS)
  const posted: HostToWebview[] = []
  const panel = {
    webview: {
      options: {},
      html: "",
      cspSource: "",
      asWebviewUri: (uri: unknown) => uri,
      postMessage: async (msg: HostToWebview) => posted.push(msg),
      onDidReceiveMessage: () => ({ dispose: () => {} }),
    },
    onDidDispose: () => ({ dispose: () => {} }),
    reveal: () => {},
  }
  await new TokenEditorProvider(context as never).resolveCustomTextEditor(
    doc as never,
    panel as never,
  )
  const notices = () => posted.filter(m => m.type === "renamed")
  return { doc, notices }
}

type RenameProvider = {
  provideRenameEdits(
    doc: unknown,
    position: unknown,
    newName: string,
  ): Promise<stub.WorkspaceEdit | undefined>
}

/** F2 on the key `"key"` (its first occurrence), typing `newName`: the edit VS Code is handed. */
async function f2(doc: stub.StubDocument, key: string, newName: string) {
  const provider = stub.renameProviders[0] as RenameProvider
  const at = doc.getText().indexOf(`"${key}"`) + 1
  const edit = await provider.provideRenameEdits(
    doc,
    new stub.Position(0, at),
    newName,
  )
  expect(edit).toBeDefined()
  return edit!
}

beforeEach(() => {
  stub.reset()
  stub.disk.set(PATH, TOKENS)
  registerIndexInvalidation({ subscriptions: [] } as never)
  registerRename({ subscriptions: [] } as never)
  invalidateWorkspaceIndex()
})

describe("the detail panel follows F2", () => {
  it("panel follows F2: renaming the token tells the editor once the edit lands", async () => {
    const { doc, notices } = await openEditor()
    const edit = await f2(doc, "ink", "black")
    // Handed to VS Code, not applied yet: nothing to follow.
    expect(notices()).toEqual([])
    expect(await stub.workspace.applyEdit(edit)).toBe(true)
    expect(JSON.parse(doc.getText()).color).toHaveProperty("black")
    expect(notices()).toEqual([
      { type: "renamed", path: ["color", "ink"], newName: "black" },
    ])
  })

  it("panel follows F2: renaming a group tells the editor the group's path", async () => {
    const { doc, notices } = await openEditor()
    await stub.workspace.applyEdit(await f2(doc, "color", "paint"))
    expect(JSON.parse(doc.getText())).toHaveProperty("paint.ink")
    expect(notices()).toEqual([
      { type: "renamed", path: ["color"], newName: "paint" },
    ])
  })

  it("panel follows F2: with the old name kept as an alias, it still tells the editor", async () => {
    stub.settings.global.deprecationWorkflow = true
    const { doc, notices } = await openEditor()
    await stub.workspace.applyEdit(await f2(doc, "ink", "black"))
    const color = JSON.parse(doc.getText()).color
    expect(color).toHaveProperty("black")
    expect(color).toHaveProperty("ink")
    expect(notices()).toEqual([
      { type: "renamed", path: ["color", "ink"], newName: "black" },
    ])
  })

  it("panel follows F2: a rename cancelled in the refactor preview posts nothing", async () => {
    const { doc, notices } = await openEditor()
    // Discarded in the preview: the edit is never applied.
    await f2(doc, "ink", "black")
    // Typing elsewhere in the file is not the rename landing.
    const typed = doc.getText().replace("#111111", "#222222")
    await stub.workspace.applyEdit(
      Object.assign(new stub.WorkspaceEdit(), {
        replacements: [
          {
            uri: doc.uri,
            range: new stub.Range(
              new stub.Position(0, 0),
              new stub.Position(0, doc.getText().length),
            ),
            content: typed,
          },
        ],
      }),
    )
    expect(doc.getText()).toBe(typed)
    expect(notices()).toEqual([])
  })

  it("panel follows F2: it names only the renamed node, so a panel on another stays put", async () => {
    const { doc, notices } = await openEditor()
    await stub.workspace.applyEdit(await f2(doc, "old", "older"))
    // One message, naming `color.old`: the webview leaves a panel on
    // `color.ink` alone (contextMenu.test.tsx).
    expect(notices()).toEqual([
      { type: "renamed", path: ["color", "old"], newName: "older" },
    ])
  })
})
