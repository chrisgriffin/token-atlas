/**
 * The workspace index's cost per event, against a stand-in `vscode` module
 * (`vscode-stub.ts`) that counts searches and file reads. The workspace is the
 * shape that made typing slow: five token files among 495 other JSON files,
 * all matched by the default `tokenAtlas.include`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("vscode", () => import("./vscode-stub"))

import * as stub from "./vscode-stub"
import {
  buildWorkspaceIndex,
  findTokenFiles,
  invalidateWorkspaceIndex,
  onDidInvalidateWorkspaceIndex,
  registerIndexInvalidation,
  setActiveSet,
} from "../../src/host/workspaceIndex"

const token = (name: string, value: number) =>
  JSON.stringify({ [name]: { $type: "number", $value: value } })

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

beforeEach(() => {
  stub.reset()
  for (let i = 0; i < 5; i++)
    stub.disk.set(`/ws/tokens${i}.json`, token(`t${i}`, i))
  for (let i = 0; i < 495; i++)
    stub.disk.set(`/ws/data/f${i}.json`, JSON.stringify({ k: i }))
  registerIndexInvalidation({ subscriptions: [] } as never)
  setActiveSet([])
  invalidateWorkspaceIndex()
})

/** Searches and reads since the last call. */
function work() {
  const done = {
    findFiles: stub.stats.findFiles,
    readFile: stub.stats.readFile,
  }
  stub.stats.findFiles = stub.stats.readFile = 0
  return done
}

/** tokens0.json, open in an editor over the text on disk. */
function openTokens0() {
  return stub.openDocument(
    "/ws/tokens0.json",
    stub.disk.get("/ws/tokens0.json")!,
  )
}

describe("workspace index", () => {
  it("scans once, reading each candidate file once", async () => {
    await buildWorkspaceIndex()
    expect(work()).toEqual({ findFiles: 1, readFile: 500 })
  })

  it("answers a keystroke in a token file without searching or reading the disk", async () => {
    const editor = openTokens0()
    await buildWorkspaceIndex()
    work()
    editor.edit(token("typed", 1))
    const index = await buildWorkspaceIndex()
    expect(work()).toEqual({ findFiles: 0, readFile: 0 })
    expect(index.has("typed")).toBe(true)
    expect(index.has("t0")).toBe(false)
    expect(index.has("t4")).toBe(true)
  })

  it("shares one scan between callers that arrive together", async () => {
    await Promise.all([1, 2, 3, 4, 5].map(() => buildWorkspaceIndex()))
    expect(work()).toEqual({ findFiles: 1, readFile: 500 })
  })

  it("keeps a scan a keystroke lands in, with the keystroke in it", async () => {
    const editor = openTokens0()
    const scan = buildWorkspaceIndex()
    editor.edit(token("typed", 1))
    await scan
    work()
    const index = await buildWorkspaceIndex()
    expect(work()).toEqual({ findFiles: 0, readFile: 0 })
    expect(index.has("typed")).toBe(true)
  })

  it("keeps a file's last tokens while its JSON is half-typed", async () => {
    const editor = openTokens0()
    await buildWorkspaceIndex()
    editor.edit(`{ "new\n${stub.disk.get("/ws/tokens0.json")!.slice(1)}`)
    expect((await buildWorkspaceIndex()).has("t0")).toBe(true)
  })

  it("drops a .json file edited so it no longer holds tokens", async () => {
    const editor = openTokens0()
    await buildWorkspaceIndex()
    editor.edit('{ "plain": true }')
    expect((await buildWorkspaceIndex()).has("t0")).toBe(false)
    expect((await findTokenFiles()).map(f => f.uri.path)).not.toContain(
      "/ws/tokens0.json",
    )
  })

  it("adds a .json file edited until it holds tokens", async () => {
    const editor = stub.openDocument(
      "/ws/data/f0.json",
      stub.disk.get("/ws/data/f0.json")!,
    )
    await buildWorkspaceIndex()
    editor.edit(token("fresh", 1))
    expect((await buildWorkspaceIndex()).has("fresh")).toBe(true)
  })

  it("adds a .json file created after the scan once it is typed into", async () => {
    await buildWorkspaceIndex()
    stub.disk.set("/ws/colors.json", "")
    stub.emit("watcher.create", stub.Uri.file("/ws/colors.json"))
    await sleep(10)
    const editor = stub.openDocument("/ws/colors.json", "")
    editor.edit(token("fresh", 1))
    expect((await buildWorkspaceIndex()).has("fresh")).toBe(true)
    work()
    editor.edit(token("fresher", 2))
    const index = await buildWorkspaceIndex()
    expect(work()).toEqual({ findFiles: 0, readFile: 0 })
    expect(index.has("fresher")).toBe(true)
  })

  it("tells listeners once per pause in typing, not once per keystroke", async () => {
    const editor = openTokens0()
    await buildWorkspaceIndex()
    let fired = 0
    onDidInvalidateWorkspaceIndex(() => fired++)
    for (let i = 0; i < 10; i++) editor.edit(token("t0", i))
    await sleep(400)
    expect(fired).toBe(1)
  })

  it("reads each workspace folder's own tokenAtlas.include", async () => {
    stub.disk.clear()
    stub.workspace.workspaceFolders = [
      { uri: stub.Uri.file("/a"), name: "a", index: 0 },
      { uri: stub.Uri.file("/b"), name: "b", index: 1 },
    ]
    stub.settings.folders["/b"] = { include: ["**/*.tokens"] }
    stub.disk.set("/a/x.json", token("x", 1))
    stub.disk.set("/b/y.json", token("y", 1))
    stub.disk.set("/b/z.tokens", token("z", 1))
    invalidateWorkspaceIndex()
    const index = await buildWorkspaceIndex()
    expect([...index.keys()].sort()).toEqual(["x", "z"])
  })
})
