/**
 * The stand-in for VS Code's command registry (#72): it runs the built-in
 * commands the host calls, as VS Code always has them, still fails on any
 * other id nothing registered (#67), and disposing an older registration of
 * an id leaves a newer one in place.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("vscode", () => import("./vscode-stub"))

import * as stub from "./vscode-stub"
import { registerDeprecation } from "../../src/host/deprecate"
import {
  invalidateWorkspaceIndex,
  registerIndexInvalidation,
} from "../../src/host/workspaceIndex"

const PATH = "/ws/colors.tokens.json"
const TOKENS = JSON.stringify(
  {
    color: {
      $type: "color",
      ink: { $value: "{color.old}" },
      old: { $value: "#111111", $deprecated: "Use {color.ink}." },
    },
  },
  null,
  2,
)

beforeEach(() => {
  stub.reset()
  stub.disk.set(PATH, TOKENS)
  stub.settings.global.deprecationWorkflow = true
  registerIndexInvalidation({ subscriptions: [] } as never)
  registerDeprecation({ subscriptions: [] } as never)
  invalidateWorkspaceIndex()
})

describe("the stub's command registry", () => {
  it("built-in VS Code command: Find Deprecated Uses peeks the uses without failing", async () => {
    stub.openDocument(PATH, TOKENS)
    const run = stub.commands.executeCommand.bind(stub.commands)
    const calls: Array<{ id: string; result: Promise<unknown> }> = []
    const spy = vi
      .spyOn(stub.commands, "executeCommand")
      .mockImplementation((id: string, ...args: unknown[]) => {
        const result = run(id, ...args)
        calls.push({ id, result })
        return result
      })
    const uses = await stub.commands.executeCommand(
      "tokenAtlas.findDeprecatedUses",
      { uri: stub.Uri.file(PATH).toString(), path: ["color", "old"] },
    )
    spy.mockRestore()
    expect(uses).toHaveLength(1)
    const peek = calls.find(c => c.id === "editor.action.showReferences")
    expect(peek).toBeDefined()
    await expect(peek!.result).resolves.toBeUndefined()
  })

  it("built-in VS Code command: an id VS Code does not have still fails", async () => {
    await expect(
      stub.commands.executeCommand("editor.action.noSuchAction"),
    ).rejects.toThrow("editor.action.noSuchAction")
  })

  it("re-registered command: disposing the older registration keeps the newer", async () => {
    const older = stub.commands.registerCommand("test.twice", () => "older")
    stub.commands.registerCommand("test.twice", () => "newer")
    older.dispose()
    await expect(stub.commands.executeCommand("test.twice")).resolves.toBe(
      "newer",
    )
  })

  it("re-registered command: disposing the older registration keeps the newer when both hold the same handler", async () => {
    const handler = () => "live"
    const older = stub.commands.registerCommand("test.same", handler)
    stub.commands.registerCommand("test.same", handler)
    older.dispose()
    await expect(stub.commands.executeCommand("test.same")).resolves.toBe(
      "live",
    )
  })

  it("re-registered command: Find Deprecated Uses still runs after its older registration is disposed", async () => {
    const older = { subscriptions: [] as Array<{ dispose(): unknown }> }
    registerDeprecation(older as never)
    registerDeprecation({ subscriptions: [] } as never)
    for (const s of older.subscriptions) s.dispose()
    stub.openDocument(PATH, TOKENS)
    await expect(
      stub.commands.executeCommand("tokenAtlas.findDeprecatedUses", {
        uri: stub.Uri.file(PATH).toString(),
        path: ["color", "old"],
      }),
    ).resolves.toHaveLength(1)
  })

  it("built-in VS Code command: a contributed view's generated focus command resolves", async () => {
    await expect(
      stub.commands.executeCommand("tokenAtlas.tokens.focus"),
    ).resolves.toBeUndefined()
  })
})
