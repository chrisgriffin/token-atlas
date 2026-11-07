/**
 * Deprecate Token…'s two prompts carry the copy Chris approved (#85). VS
 * Code appends "(Press 'Enter' to confirm or 'Escape' to cancel)" to any
 * prompt, so the prompt itself carries no parenthetical.
 */
import { beforeEach, expect, it, vi } from "vitest"

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
      ink: { $value: "#000000" },
      text: { $value: "#111111" },
    },
  },
  null,
  2,
)

beforeEach(() => {
  stub.reset()
  stub.disk.set(PATH, TOKENS)
  stub.openDocument(PATH, TOKENS)
  stub.settings.global.deprecationWorkflow = true
  registerIndexInvalidation({ subscriptions: [] } as never)
  registerDeprecation({ subscriptions: [] } as never)
  invalidateWorkspaceIndex()
})

it("Deprecate Token… asks for the reason, then the replacement, in the approved words", async () => {
  stub.prompts.inputAnswer = ""
  await stub.commands.executeCommand("tokenAtlas.deprecateToken", {
    uri: stub.Uri.file(PATH).toString(),
    path: ["color", "ink"],
  })

  expect(stub.prompts.inputBoxes).toEqual([
    {
      title: "Deprecate color.ink",
      placeHolder: "Deprecation reason (optional)…",
      prompt: "Optional. Shown wherever the token is used.",
      value: "",
    },
  ])
  expect(stub.prompts.quickPicks.map(p => p.options)).toEqual([
    { title: "Replace color.ink with", placeHolder: "Replacement token" },
  ])
})
