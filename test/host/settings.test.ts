/**
 * Resource-scoped settings read for the file they apply to, against the
 * stand-in `vscode` module. In a multi-root workspace each folder may set its
 * own `tokenAtlas.rootFontSize`; a read without the file's URI sees only the
 * user's value.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("vscode", () => import("./vscode-stub"))

import * as stub from "./vscode-stub"
import { parseTokens, indexTokens } from "../../src/core"
import { registerHardcodedValues } from "../../src/host/hardcodedValues"
import { buildTokenHover } from "../../src/host/languageFeatures"
import {
  invalidateWorkspaceIndex,
  registerIndexInvalidation,
} from "../../src/host/workspaceIndex"

const SPACE = JSON.stringify({
  space: { $type: "dimension", $value: { value: 20, unit: "px" } },
})

beforeEach(() => {
  stub.reset()
  stub.workspace.workspaceFolders = [
    { uri: stub.Uri.file("/a"), name: "a", index: 0 },
    { uri: stub.Uri.file("/b"), name: "b", index: 1 },
  ]
  stub.settings.folders["/b"] = { rootFontSize: 10 }
  stub.disk.set("/b/space.json", SPACE)
  registerIndexInvalidation({ subscriptions: [] } as never)
  invalidateWorkspaceIndex()
})

describe("resource-scoped settings", () => {
  it("converts a hover's rem against the hovered file's folder", () => {
    const token = indexTokens(parseTokens(SPACE)).get("space")!
    const hover = buildTokenHover(
      token,
      new Map(),
      new Map(),
      stub.Uri.file("/b/space.json") as never,
      undefined,
    )
    const markdown = (hover.contents[0] as unknown as stub.MarkdownString).value
    expect(markdown).toContain("rem at 10px root")
  })

  it("matches a stylesheet's rem against its own folder's root size", async () => {
    stub.settings.global.hardcodedValues = "warning"
    registerHardcodedValues({ subscriptions: [] } as never)
    // 2rem is 20px at the folder's 10px root, but 32px at the default 16.
    const css = stub.openDocument(
      "/b/site.css",
      ".card { margin: 2rem; }\n",
      "css",
    )
    const reported = () =>
      stub.collections.get("token-atlas-hardcoded")!.get(css.doc.uri.toString())
    for (let i = 0; i < 200 && !reported()?.length; i++)
      await new Promise(r => setTimeout(r, 10))
    expect(reported()?.map(d => d.message)).toEqual([
      "2rem matches token space",
    ])
  })
})
