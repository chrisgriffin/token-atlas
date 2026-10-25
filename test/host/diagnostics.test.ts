/**
 * Diagnostics a document leaves behind when it closes, against the stand-in
 * `vscode` module. A real VS Code closes a document whenever it chooses to,
 * long after its editor goes, so the close is fired here by hand — and can
 * land exactly while the document's problems are still being worked out.
 */
import { beforeEach, expect, it, vi } from "vitest"

vi.mock("vscode", () => import("./vscode-stub"))

import * as stub from "./vscode-stub"
import { registerDiagnostics } from "../../src/host/diagnostics"
import { registerHardcodedValues } from "../../src/host/hardcodedValues"
import {
  buildWorkspaceIndex,
  invalidateWorkspaceIndex,
  registerIndexInvalidation,
} from "../../src/host/workspaceIndex"

async function waitFor(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (check()) return
    await new Promise(r => setTimeout(r, 10))
  }
  throw new Error(`timed out waiting for ${what}`)
}

beforeEach(() => {
  stub.reset()
  const context = { subscriptions: [] } as never
  registerIndexInvalidation(context)
  invalidateWorkspaceIndex()
  registerDiagnostics(context)
})

it("clears a closed document's unused-token hints", async () => {
  stub.settings.global.unusedTokens = "information"
  const editor = stub.openDocument(
    "/ws/orphan.json",
    JSON.stringify({ orphan: { $type: "number", $value: 1 } }),
  )
  const key = editor.doc.uri.toString()
  const unused = () => stub.collections.get("token-atlas-unused")!
  await waitFor(
    () => (unused().get(key)?.length ?? 0) > 0,
    "the orphan hinted as unused",
  )
  editor.close()
  expect(unused().has(key)).toBe(false)
})

/** Let every check started so far finish: the scan they wait on, then their own work. */
async function settle(): Promise<void> {
  await buildWorkspaceIndex()
  await new Promise(r => setTimeout(r, 50))
}

it("publishes nothing for a token document closed while it was checked", async () => {
  stub.disk.set(
    "/ws/space.json",
    JSON.stringify({ space: { $type: "number", $value: 1 } }),
  )
  // Opening starts a check that waits on the workspace scan; it closes meanwhile.
  const editor = stub.openDocument(
    "/ws/probe.json",
    JSON.stringify({ alias: { $type: "color", $value: "{nowhere}" } }),
  )
  editor.close()
  await settle()
  expect(
    stub.collections.get("token-atlas")!.has(editor.doc.uri.toString()),
  ).toBe(false)
})

it("publishes nothing for a stylesheet closed while it was checked", async () => {
  stub.settings.global.hardcodedValues = "warning"
  stub.disk.set(
    "/ws/space.json",
    JSON.stringify({
      space: { $type: "dimension", $value: { value: 20, unit: "px" } },
    }),
  )
  registerHardcodedValues({ subscriptions: [] } as never)
  const editor = stub.openDocument(
    "/ws/site.css",
    ".card { margin: 20px; }\n",
    "css",
  )
  editor.close()
  await settle()
  expect(
    stub.collections
      .get("token-atlas-hardcoded")!
      .has(editor.doc.uri.toString()),
  ).toBe(false)
})
