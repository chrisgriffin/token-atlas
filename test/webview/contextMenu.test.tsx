import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"

// App.tsx imports vscodeApi, which calls acquireVsCodeApi() at load.
vi.mock("../../src/webview/vscodeApi", () => ({
  post: vi.fn(),
  getPanelWidth: vi.fn(),
  getSelectedPath: vi.fn(),
  setPanelWidthState: vi.fn(),
  setSelectedPathState: vi.fn(),
}))

import { parseTokens, resolveAliases, validate } from "../../src/core"
import { App } from "../../src/webview/App"
import { setSelectedPathState } from "../../src/webview/vscodeApi"

/**
 * The right-click menu (spec 022) is VS Code's `webview/context`, filtered by
 * the `data-vscode-context` of the element clicked and its ancestors, merged
 * root first. These are the contexts the table sets; `package.json`'s `when`
 * clauses read them (held together by `test/ci/manifest-couplings.test.ts`),
 * and `test/integration/editor-menu.test.ts` runs each command with one.
 */

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver
})

afterEach(cleanup)

const URI = "file:///work/tokens.json"
const black = { colorSpace: "srgb", components: [0, 0, 0] }

function open() {
  render(<App />)
  const model = parseTokens(
    JSON.stringify({
      color: {
        $type: "color",
        ink: { $value: black },
        old: { $value: black, $deprecated: "use {color.ink} instead" },
      },
      legacy: { $type: "color", $deprecated: true, grey: { $value: black } },
      brand: { $extends: "{color}" },
    }),
  )
  resolveAliases(model)
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "init",
          uri: URI,
          model,
          validation: validate(model),
          externalTokens: [],
          settings: {
            rootFontSize: 16,
            defaultColorSpace: "srgb",
            defaultDimensionUnit: "px",
            contrastTarget: "AA",
            modeView: "single",
          },
          scope: [],
          columnWidths: {},
        },
      }),
    )
  })
}

/** What VS Code would pass for a right-click on `el`: every context from the root down, merged. */
function contextAt(el: Element): Record<string, unknown> {
  const chain: Element[] = []
  for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e)
  return Object.assign(
    {},
    ...chain
      .map(e => e.getAttribute("data-vscode-context"))
      .filter((c): c is string => c !== null)
      .map(c => JSON.parse(c)),
  )
}

const row = (title: string) =>
  document.querySelector(`tr.token [title="${title}"]`)!

describe("right-click contexts in the visual editor", () => {
  it("a token row names its section, the document and its path", () => {
    open()
    expect(contextAt(row("color.ink"))).toEqual({
      uri: URI,
      webviewSection: "token",
      path: ["color", "ink"],
      tokenDeprecated: false,
    })
  })

  it("says a token is deprecated, directly or through its group", () => {
    open()
    expect(contextAt(row("color.old")).tokenDeprecated).toBe(true)
    expect(contextAt(row("legacy.grey")).tokenDeprecated).toBe(true)
  })

  it("an inherited token is its own section, with no key to edit", () => {
    open()
    expect(contextAt(row("brand.ink"))).toEqual({
      uri: URI,
      webviewSection: "inherited",
      path: ["brand", "ink"],
    })
  })

  it("each group heading names its own group", () => {
    open()
    const heading = [...document.querySelectorAll("button.section-name")].find(
      b => b.textContent === "legacy",
    )!
    expect(contextAt(heading)).toEqual({
      uri: URI,
      webviewSection: "group",
      path: ["legacy"],
    })
  })

  it("the rest of a group heading is the group's too", () => {
    open()
    const heading = [...document.querySelectorAll("tr.section th")].find(
      th => th.textContent === "legacy",
    )!
    expect(contextAt(heading)).toEqual({
      uri: URI,
      webviewSection: "group",
      path: ["legacy"],
    })
  })
})

describe("the detail panel after a menu rename or delete", () => {
  const send = (data: unknown) =>
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data }))
    })
  const openPanel = (title: string) =>
    fireEvent.doubleClick(row(title).closest("tr")!)
  const panel = () => document.querySelector("aside.panel")

  it("follows the renamed token", () => {
    open()
    openPanel("color.ink")
    expect(panel()).not.toBeNull()
    send({ type: "renamed", path: ["color", "ink"], newName: "black" })
    expect(vi.mocked(setSelectedPathState)).toHaveBeenLastCalledWith([
      "color",
      "black",
    ])
  })

  it("follows a token whose group was renamed", () => {
    open()
    openPanel("color.ink")
    send({ type: "renamed", path: ["color"], newName: "paint" })
    expect(vi.mocked(setSelectedPathState)).toHaveBeenLastCalledWith([
      "paint",
      "ink",
    ])
  })

  it("closes on the deleted token, and stays open on another", () => {
    open()
    openPanel("color.ink")
    send({ type: "deleted", path: ["color", "old"] })
    expect(panel()).not.toBeNull()
    send({ type: "deleted", path: ["color", "ink"] })
    expect(panel()).toBeNull()
    expect(vi.mocked(setSelectedPathState)).toHaveBeenLastCalledWith(null)
  })
})
