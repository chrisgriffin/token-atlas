/**
 * The visual editor's detail panel after an edit from the right-click menu
 * (#55): the host tells the open editor what was renamed or removed, and only
 * when the file really changed. The webview's side — following `renamed`,
 * closing on `deleted` — is pinned in `test/webview/contextMenu.test.tsx`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("vscode", () => import("./vscode-stub"))

import * as stub from "./vscode-stub"
import { registerDeprecation } from "../../src/host/deprecate"
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
      old: { $value: "#111111", $deprecated: "Use {color.ink}." },
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
  const notices = () =>
    posted.filter(m => m.type === "renamed" || m.type === "deleted")
  return { doc, notices }
}

/** The `data-vscode-context` a right-click on that row hands a menu command. */
const row = (path: string[]) => ({ uri: stub.Uri.file(PATH).toString(), path })

beforeEach(() => {
  stub.reset()
  stub.disk.set(PATH, TOKENS)
  stub.settings.global.deprecationWorkflow = true
  registerIndexInvalidation({ subscriptions: [] } as never)
  registerRename({ subscriptions: [] } as never)
  registerDeprecation({ subscriptions: [] } as never)
  invalidateWorkspaceIndex()
})

describe("the detail panel follows menu edits", () => {
  it("panel follows menu: Rename Token Without Keeping Old Name sends the new name", async () => {
    const { doc, notices } = await openEditor()
    const renamed = await stub.commands.executeCommand(
      "tokenAtlas.renameWithoutAlias",
      row(["color", "ink"]),
      undefined,
      "black",
    )
    expect(renamed).toBe(true)
    expect(JSON.parse(doc.getText()).color).toHaveProperty("black")
    expect(notices()).toEqual([
      { type: "renamed", path: ["color", "ink"], newName: "black" },
    ])
  })

  it("panel follows menu: Remove Deprecated Token sends the removed path", async () => {
    const { doc, notices } = await openEditor()
    const removed = await stub.commands.executeCommand(
      "tokenAtlas.removeDeprecatedToken",
      row(["color", "old"]),
    )
    expect(removed).toBe(true)
    expect(JSON.parse(doc.getText()).color).not.toHaveProperty("old")
    expect(notices()).toEqual([{ type: "deleted", path: ["color", "old"] }])
  })

  it("panel follows menu: a rename or remove VS Code refuses sends nothing", async () => {
    const { doc, notices } = await openEditor()
    stub.applyEditRefuses.value = true
    await stub.commands.executeCommand(
      "tokenAtlas.renameWithoutAlias",
      row(["color", "ink"]),
      undefined,
      "black",
    )
    await stub.commands.executeCommand(
      "tokenAtlas.removeDeprecatedToken",
      row(["color", "old"]),
    )
    expect(doc.getText()).toBe(TOKENS)
    expect(notices()).toEqual([])
  })

  it("panel follows menu: a delete that changes nothing leaves the panel open", async () => {
    stub.settings.global.deprecationWorkflow = false
    const { doc, notices } = await openEditor()
    const uri = stub.Uri.file(PATH) as never
    // Nothing to delete: no edits to make.
    await TokenEditorProvider.receive(uri, {
      type: "deleteNode",
      path: ["color", "missing"],
    })
    // Something to delete, but VS Code turns the edit down.
    stub.applyEditRefuses.value = true
    await TokenEditorProvider.receive(uri, {
      type: "deleteNode",
      path: ["color", "ink"],
    })
    expect(doc.getText()).toBe(TOKENS)
    expect(notices()).toEqual([])
    // And one that lands still closes it.
    stub.applyEditRefuses.value = false
    await TokenEditorProvider.receive(uri, {
      type: "deleteNode",
      path: ["color", "ink"],
    })
    expect(notices()).toEqual([{ type: "deleted", path: ["color", "ink"] }])
  })
})
