/**
 * Find All References from the visual editor's right-click menu (#83): the
 * host sends what Shift+F12 finds to the open Token Editor as one
 * `references` message, and opens a clicked reference with `openReference`.
 * The webview's side, the Referenced by section, is pinned in
 * `test/webview/references.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("vscode", () => import("./vscode-stub"))

import * as stub from "./vscode-stub"
import { registerEditorMenu } from "../../src/host/editorMenu"
import { TokenEditorProvider } from "../../src/host/tokenEditorProvider"
import { invalidateWorkspaceIndex } from "../../src/host/workspaceIndex"
import type { HostToWebview, TokenReference } from "../../src/shared/protocol"

const PATH = "/ws/colors.tokens.json"
const BRAND = "/ws/brand.tokens.json"
const CSS = "/ws/app.css"
const TOKENS = JSON.stringify(
  {
    color: {
      $type: "color",
      ink: { $value: "#000000" },
      button: { $value: "{color.ink}" },
    },
  },
  null,
  2,
)
const BRAND_TOKENS = JSON.stringify(
  { brand: { text: { $type: "color", $value: "{color.ink}" } } },
  null,
  2,
)
const CSS_TEXT = ".a { color: var(--color-ink); }"

const context = {
  extensionUri: stub.Uri.file("/ext"),
  globalState: { get: <T>(_key: string, fallback: T) => fallback },
  subscriptions: [] as unknown[],
}

/** Closes every editor a test opened: the provider's registries are static. */
const closers: Array<() => void> = []
afterEach(() => closers.splice(0).forEach(close => close()))

/** Opens the Token Editor on the file; returns what the host posts to it. */
async function openEditor() {
  const { doc } = stub.openDocument(PATH, TOKENS)
  const posted: HostToWebview[] = []
  const disposers: Array<() => void> = []
  const panel = {
    webview: {
      options: {},
      html: "",
      cspSource: "",
      asWebviewUri: (uri: unknown) => uri,
      postMessage: async (msg: HostToWebview) => posted.push(msg),
      onDidReceiveMessage: () => ({ dispose: () => {} }),
    },
    onDidDispose: (listener: () => void) => {
      disposers.push(listener)
      return { dispose: () => {} }
    },
    reveal: () => {},
  }
  await new TokenEditorProvider(context as never).resolveCustomTextEditor(
    doc as never,
    panel as never,
  )
  const references = () =>
    posted.filter(
      (m): m is Extract<HostToWebview, { type: "references" }> =>
        m.type === "references",
    )
  const close = () => disposers.splice(0).forEach(d => d())
  closers.push(close)
  return { doc, posted, references, close }
}

/** A location at `needle` in a file, as the reference provider returns one. */
function at(path: string, text: string, needle: string) {
  const offset = text.indexOf(needle)
  const start = new stub.Position(0, offset)
  return new stub.Location(stub.Uri.file(path), new stub.Range(start, start))
}

const row = (path: string[]) => ({ uri: stub.Uri.file(PATH).toString(), path })

/** Run commands the host calls, as VS Code would; returns each call's args. */
function handle(id: string, result?: unknown) {
  const calls: unknown[][] = []
  stub.commands.registerCommand(id, (...args: unknown[]) => {
    calls.push(args)
    return result
  })
  return calls
}

beforeEach(() => {
  stub.reset()
  stub.disk.set(PATH, TOKENS)
  stub.disk.set(BRAND, BRAND_TOKENS)
  stub.disk.set(CSS, CSS_TEXT)
  stub.openDocument(CSS, CSS_TEXT, "css")
  invalidateWorkspaceIndex()
  registerEditorMenu({ subscriptions: [] } as never)
})

describe("Find All References in the visual editor", () => {
  it("sends every reference to the editor, token files by token, the rest by file and line", async () => {
    const editor = await openEditor()
    const peek = handle("editor.action.showReferences")
    handle("vscode.executeReferenceProvider", [
      at(PATH, TOKENS, '"button"'),
      at(BRAND, BRAND_TOKENS, '"text"'),
      at(CSS, CSS_TEXT, "var(--color-ink)"),
    ])

    await stub.commands.executeCommand(
      "tokenAtlas.findReferences",
      row(["color", "ink"]),
    )

    expect(peek).toEqual([])
    expect(stub.textEditorsShown).toEqual([])
    expect(TokenEditorProvider.prefersText(stub.Uri.file(PATH) as never)).toBe(
      false,
    )
    const [sent] = editor.references()
    expect(sent.path).toEqual(["color", "ink"])
    expect(
      sent.references.map(r => ({ file: r.file, path: r.path, line: r.line })),
    ).toEqual([
      { file: "colors.tokens.json", path: ["color", "button"], line: 1 },
      { file: "brand.tokens.json", path: ["brand", "text"], line: 1 },
      { file: "app.css", path: undefined, line: 1 },
    ])
    // Each token entry carries its value, resolved in its own file.
    expect(sent.references.map(r => [r.type, r.value])).toEqual([
      ["color", "#000000"],
      ["color", "#000000"],
      [undefined, undefined],
    ])
    // Classified from the workspace scan: the code file is never opened.
    expect(stub.opened).not.toContain(CSS)
  })

  it("resolves a referencing token in its own file when another holds the same path", async () => {
    const OTHER = "/ws/other.tokens.json"
    const OTHER_TOKENS = JSON.stringify(
      {
        color: {
          $type: "color",
          ink: { $value: "#ffffff" },
          button: { $value: "{color.ink}" },
        },
      },
      null,
      2,
    )
    stub.disk.set(OTHER, OTHER_TOKENS)
    invalidateWorkspaceIndex()
    const editor = await openEditor()
    handle("vscode.executeReferenceProvider", [
      at(PATH, TOKENS, '"button"'),
      at(OTHER, OTHER_TOKENS, '"button"'),
    ])
    await stub.commands.executeCommand(
      "tokenAtlas.findReferences",
      row(["color", "ink"]),
    )
    const [sent] = editor.references()
    expect(sent.references.map(r => [r.file, r.path, r.value])).toEqual([
      ["colors.tokens.json", ["color", "button"], "#000000"],
      ["other.tokens.json", ["color", "button"], "#ffffff"],
    ])
  })

  it("sends an empty list when nothing references the token", async () => {
    const editor = await openEditor()
    handle("vscode.executeReferenceProvider", [])
    await stub.commands.executeCommand(
      "tokenAtlas.findReferences",
      row(["color", "ink"]),
    )
    expect(editor.references()).toEqual([
      { type: "references", path: ["color", "ink"], references: [] },
    ])
  })

  it("says so when the editor closed before the results arrived", async () => {
    const editor = await openEditor()
    handle("vscode.executeReferenceProvider", [at(PATH, TOKENS, '"button"')])
    editor.close()
    await stub.commands.executeCommand(
      "tokenAtlas.findReferences",
      row(["color", "ink"]),
    )
    expect(editor.references()).toEqual([])
    expect(stub.shown.at(-1)).toMatch(/Token Editor for this file was closed/)
  })
})

describe("opening a reference from the Referenced by section", () => {
  const reference = (r: Partial<TokenReference>): TokenReference => ({
    uri: "",
    file: "",
    line: 1,
    character: 0,
    ...r,
  })

  it("opens another token file in the Token Editor on that token", async () => {
    await openEditor()
    const opened = handle("vscode.openWith")
    await TokenEditorProvider.receive(stub.Uri.file(PATH) as never, {
      type: "openReference",
      reference: reference({
        uri: stub.Uri.file(BRAND).toString(),
        path: ["brand", "text"],
      }),
    })
    expect(opened).toHaveLength(1)
    expect(String(opened[0][0])).toBe(stub.Uri.file(BRAND).toString())
    expect(opened[0][1]).toBe(TokenEditorProvider.viewType)
    expect(TokenEditorProvider.scopeOf(stub.Uri.file(BRAND) as never)).toEqual([
      "brand",
    ])
    expect(stub.textEditorsShown).toEqual([])
  })

  it("opens a code file as text with the cursor on the use", async () => {
    await openEditor()
    await TokenEditorProvider.receive(stub.Uri.file(PATH) as never, {
      type: "openReference",
      reference: reference({
        uri: stub.Uri.file(CSS).toString(),
        line: 1,
        character: 12,
      }),
    })
    expect(stub.textEditorsShown).toHaveLength(1)
    const [shown] = stub.textEditorsShown
    expect(shown.uri.toString()).toBe(stub.Uri.file(CSS).toString())
    const selection = (shown.options as { selection: { start: stub.Position } })
      .selection
    expect(selection.start).toEqual(new stub.Position(0, 12))
  })

  it("folds a clean text tab on that token file into the Token Editor", async () => {
    await openEditor()
    handle("vscode.openWith")
    const textTab = {
      input: new stub.TabInputText(stub.Uri.file(BRAND)),
      isDirty: false,
    }
    stub.tabs.push(textTab)
    await TokenEditorProvider.receive(stub.Uri.file(PATH) as never, {
      type: "openReference",
      reference: reference({
        uri: stub.Uri.file(BRAND).toString(),
        path: ["brand", "text"],
      }),
    })
    expect(stub.closedTabs).toEqual([textTab])
  })

  it("says why when the file will not open, and keeps this editor's table", async () => {
    const editor = await openEditor()
    await TokenEditorProvider.receive(stub.Uri.file(PATH) as never, {
      type: "openReference",
      reference: reference({
        uri: stub.Uri.file("/ws/gone.css").toString(),
        file: "gone.css",
        line: 3,
      }),
    })
    expect(editor.posted.filter(m => m.type === "error")).toEqual([])
    expect(stub.shown.at(-1)).toMatch(/Could not open gone\.css/)
  })

  it("says why when the Token Editor will not open on the token file", async () => {
    const editor = await openEditor()
    stub.commands.registerCommand("vscode.openWith", () => {
      throw new Error("no editor")
    })
    await TokenEditorProvider.receive(stub.Uri.file(PATH) as never, {
      type: "openReference",
      reference: reference({
        uri: stub.Uri.file(BRAND).toString(),
        file: "brand.tokens.json",
        path: ["brand", "text"],
      }),
    })
    expect(editor.posted.filter(m => m.type === "error")).toEqual([])
    expect(stub.shown.at(-1)).toMatch(/Could not open brand\.tokens\.json/)
  })
})
