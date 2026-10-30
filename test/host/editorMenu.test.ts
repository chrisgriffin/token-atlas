/**
 * The right-click menu's Delete (spec 054) asks before it sends the delete,
 * as the panel's click-again Delete does. `vscode`, the editor's intent queue
 * and the row reader are stood in for: what is pinned is whether `deleteNode`
 * reaches the queue, and what the prompt says.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const TEXT = JSON.stringify({
  color: {
    $type: "color",
    ink: { $value: "#000000" },
    brand: { primary: { $value: "#ff0000" }, accent: { $value: "#00ff00" } },
  },
})

const commands = new Map<string, (...args: unknown[]) => unknown>()

vi.mock("vscode", () => ({
  commands: {
    registerCommand: (id: string, run: (...args: unknown[]) => unknown) => {
      commands.set(id, run)
      return { dispose: () => {} }
    },
  },
  window: { showInformationMessage: vi.fn() },
  workspace: {
    openTextDocument: async () => ({ getText: () => TEXT }),
  },
}))

const receive = vi.fn(async (..._args: unknown[]) => {})
vi.mock("../../src/host/tokenEditorProvider", () => ({
  TokenEditorProvider: { receive: (...args: unknown[]) => receive(...args) },
}))
vi.mock("../../src/host/workspaceIndex", () => ({
  rowTarget: (arg: { uri: string; path: string[] }) => ({
    uri: arg.uri,
    path: arg.path,
  }),
  keyRange: () => undefined,
}))

import {
  registerEditorMenu,
  setMenuDeletePrompt,
} from "../../src/host/editorMenu"

registerEditorMenu({ subscriptions: [] } as never)
const deleteNode = (path: string[]) =>
  commands.get("tokenAtlas.deleteNode")!({ uri: "file:///t.json", path })

let asked: string[]
const answer = (yes: boolean) =>
  setMenuDeletePrompt(async message => {
    asked.push(message)
    return yes
  })

beforeEach(() => {
  asked = []
  receive.mockClear()
})

describe("menu delete asks", () => {
  it("menu delete asks before a group goes, and a cancel sends nothing", async () => {
    const restore = answer(false)
    try {
      await deleteNode(["color", "brand"])
    } finally {
      restore()
    }
    expect(asked).toEqual([
      'Delete group "color.brand" and the 2 tokens in it?',
    ])
    expect(receive).not.toHaveBeenCalled()
  })

  it("menu delete asks before a group goes, and a confirm deletes it", async () => {
    const restore = answer(true)
    try {
      await deleteNode(["color"])
    } finally {
      restore()
    }
    expect(asked).toEqual(['Delete group "color" and the 3 tokens in it?'])
    expect(receive).toHaveBeenCalledWith("file:///t.json", {
      type: "deleteNode",
      path: ["color"],
    })
  })

  it("menu delete asks before a token goes", async () => {
    const restore = answer(false)
    try {
      await deleteNode(["color", "ink"])
    } finally {
      restore()
    }
    expect(asked).toEqual(['Delete "color.ink"?'])
    expect(receive).not.toHaveBeenCalled()

    const again = answer(true)
    try {
      await deleteNode(["color", "ink"])
    } finally {
      again()
    }
    expect(receive).toHaveBeenCalledWith("file:///t.json", {
      type: "deleteNode",
      path: ["color", "ink"],
    })
  })
})
