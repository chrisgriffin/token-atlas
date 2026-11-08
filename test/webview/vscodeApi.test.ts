import { describe, it, expect, vi } from "vitest"
import type { WebviewToHost } from "../../src/shared/protocol"

// `src/webview/vscodeApi.ts` calls `acquireVsCodeApi()` at import time and the
// host allows exactly one call, so the fake has to be on `globalThis` before
// the module is loaded — hence `vi.resetModules()` plus a dynamic `import()`
// per test rather than a top-level import. Every other suite that reaches this
// module replaces it with `vi.mock` (`App.test.tsx`), so this file is the only
// place its real behaviour runs.

interface WebviewState {
  selectedPath?: string[] | null
  panelWidth?: number
}

interface VsCodeApiFake {
  postMessage(message: WebviewToHost): void
  getState(): WebviewState | undefined
  setState(state: WebviewState): void
}

/** Load the module fresh against a fake host holding `initial` state. */
async function loadWithState(initial?: WebviewState) {
  let stored = initial
  const postMessage = vi.fn<(message: WebviewToHost) => void>()
  const api: VsCodeApiFake = {
    postMessage,
    getState: () => stored,
    setState: state => {
      stored = state
    },
  }

  ;(
    globalThis as unknown as { acquireVsCodeApi: () => VsCodeApiFake }
  ).acquireVsCodeApi = () => api
  vi.resetModules()
  const mod = await import("../../src/webview/vscodeApi")

  return { mod, postMessage, state: () => stored }
}

describe("post", () => {
  it("forwards the message to the host unchanged", async () => {
    const { mod, postMessage } = await loadWithState()
    const message: WebviewToHost = {
      type: "setValue",
      path: ["color", "base", "blue"],
      value: { colorSpace: "srgb", components: [0, 0, 1] },
    }

    mod.post(message)

    expect(postMessage.mock.calls).toEqual([[message]])
  })
})

describe("reading state", () => {
  it("reads no selected path and no panel width before the host has stored any", async () => {
    const { mod } = await loadWithState(undefined)

    expect(mod.getSelectedPath()).toBeNull()
    expect(mod.getPanelWidth()).toBeUndefined()
  })

  it("reads back the stored selected path and panel width", async () => {
    const { mod } = await loadWithState({
      selectedPath: ["color", "base"],
      panelWidth: 320,
    })

    expect(mod.getSelectedPath()).toEqual(["color", "base"])
    expect(mod.getPanelWidth()).toBe(320)
  })

  it("reads a stored null selected path as null", async () => {
    const { mod } = await loadWithState({ selectedPath: null })

    expect(mod.getSelectedPath()).toBeNull()
    expect(mod.getPanelWidth()).toBeUndefined()
  })
})

// The two writers spread their defaults in a different order, so each could
// clobber the other's field. These pin what the code does today: both preserve.
describe("writing state", () => {
  it("keeps the panel width when the selected path is written", async () => {
    const { mod, state } = await loadWithState({
      selectedPath: ["space"],
      panelWidth: 280,
    })

    mod.setSelectedPathState(["color", "base", "blue"])

    expect(state()).toEqual({
      selectedPath: ["color", "base", "blue"],
      panelWidth: 280,
    })
    expect(mod.getPanelWidth()).toBe(280)
  })

  it("keeps the selected path when the panel width is written", async () => {
    const { mod, state } = await loadWithState({
      selectedPath: ["space"],
      panelWidth: 280,
    })

    mod.setPanelWidthState(400)

    expect(state()).toEqual({ selectedPath: ["space"], panelWidth: 400 })
    expect(mod.getSelectedPath()).toEqual(["space"])
  })

  it("writes a null selected path when the panel width is the first thing stored", async () => {
    const { mod, state } = await loadWithState(undefined)

    mod.setPanelWidthState(400)

    expect(state()).toEqual({ selectedPath: null, panelWidth: 400 })
  })

  it("round-trips a write of each field without losing the other", async () => {
    const { mod, state } = await loadWithState(undefined)

    mod.setSelectedPathState(["color"])
    mod.setPanelWidthState(360)
    mod.setSelectedPathState(["space", "md"])

    expect(state()).toEqual({ selectedPath: ["space", "md"], panelWidth: 360 })
    expect(mod.getSelectedPath()).toEqual(["space", "md"])
    expect(mod.getPanelWidth()).toBe(360)
  })
})
