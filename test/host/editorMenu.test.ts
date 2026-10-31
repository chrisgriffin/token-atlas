/**
 * The right-click menu's Delete (spec 054) asks before it sends the delete,
 * as the panel's click-again Delete does. `vscode`, the editor's intent queue
 * and the row reader are stood in for: what is pinned is whether `deleteNode`
 * reaches the queue, and what the prompt says.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const PLAIN = JSON.stringify({
  color: {
    $type: "color",
    ink: { $value: "#000000" },
    brand: { primary: { $value: "#ff0000" }, accent: { $value: "#00ff00" } },
  },
})

// `dark` extends `light`: `dark.bg` and `dark.fg.muted` are its own keys,
// `dark.fg.ink` and `dark.fg.line` (and the whole of `dark.border`) are not.
const EXTENDS = JSON.stringify({
  light: {
    $type: "color",
    bg: { $value: "#ffffff" },
    fg: { ink: { $value: "#000000" }, line: { $value: "#cccccc" } },
    border: { hair: { $value: "#eeeeee" } },
  },
  dark: {
    $extends: "{light}",
    bg: { $value: "#000000" },
    fg: { muted: { $value: "#888888" } },
  },
})

let TEXT = PLAIN
const info = vi.fn()
const commands = new Map<string, (...args: unknown[]) => unknown>()

vi.mock("vscode", () => ({
  commands: {
    registerCommand: (id: string, run: (...args: unknown[]) => unknown) => {
      commands.set(id, run)
      return { dispose: () => {} }
    },
  },
  window: { showInformationMessage: (...args: unknown[]) => info(...args) },
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
  externalIndexFor: async () => new Map(),
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
  TEXT = PLAIN
  asked = []
  receive.mockClear()
  info.mockClear()
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

  it("menu delete asks nothing of an inherited group, and sends nothing", async () => {
    TEXT = EXTENDS
    const restore = answer(true)
    try {
      await deleteNode(["dark", "border"])
    } finally {
      restore()
    }
    expect(asked).toEqual([])
    expect(info).toHaveBeenCalledWith(
      '"dark.border" is inherited through $extends and has no key in this file to delete.',
    )
    expect(receive).not.toHaveBeenCalled()
  })

  it("menu delete asks with the inherited rows that leave the view counted", async () => {
    TEXT = EXTENDS
    const restore = answer(false)
    try {
      await deleteNode(["dark"])
      // `dark.fg.muted` goes; `dark.fg.ink` and `.line` stay, from `light`.
      await deleteNode(["dark", "fg"])
    } finally {
      restore()
    }
    expect(asked).toEqual([
      'Delete group "dark" and the 5 tokens in it?',
      'Delete group "dark.fg" and the 1 token in it?',
    ])
    expect(receive).not.toHaveBeenCalled()
  })

  it("menu delete asks with the rows a group extending it loses counted", async () => {
    TEXT = EXTENDS
    const restore = answer(false)
    try {
      // `dark.fg.ink`, `dark.fg.line` and `dark.border.hair` go with `light`.
      await deleteNode(["light"])
    } finally {
      restore()
    }
    expect(asked).toEqual([
      'Delete group "light" and the 4 tokens in it? 3 more rows that $extends gives other groups leave the view with it.',
    ])
    expect(receive).not.toHaveBeenCalled()
  })

  it("menu delete asks nothing of a row no longer in the file, and says so", async () => {
    TEXT = "{ not json"
    const restore = answer(true)
    try {
      await deleteNode(["color", "ink"])
    } finally {
      restore()
    }
    expect(asked).toEqual([])
    expect(info).toHaveBeenCalledWith('"color.ink" is no longer in this file.')
    expect(receive).not.toHaveBeenCalled()
  })
})
