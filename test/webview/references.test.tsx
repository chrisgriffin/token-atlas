import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// App.tsx imports vscodeApi, which calls acquireVsCodeApi() at load.
vi.mock("../../src/webview/vscodeApi", () => ({
  post: vi.fn(),
  getPanelWidth: vi.fn(),
  getSelectedPath: vi.fn(),
  setPanelWidthState: vi.fn(),
  setSelectedPathState: vi.fn(),
}))

import { parseTokens, resolveAliases, validate } from "../../src/core"
import { App, flattenTokens } from "../../src/webview/App"
import { post, setSelectedPathState } from "../../src/webview/vscodeApi"
import type { TokenReference } from "../../src/shared/protocol"

/**
 * Find All References in the visual editor (#83): the host's `references`
 * message opens the token's detail panel with a Referenced by section. Its
 * host side is pinned in `test/host/editor-references.test.ts`.
 */

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver
})

beforeEach(() => vi.mocked(post).mockClear())
afterEach(cleanup)

const URI = "file:///work/colors.tokens.json"
const BRAND = "file:///work/brand.tokens.json"
const black = { colorSpace: "srgb", components: [0, 0, 0] }

const send = (data: unknown) =>
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data }))
  })

function open() {
  render(<App />)
  const model = parseTokens(
    JSON.stringify({
      color: {
        $type: "color",
        ink: { $value: black },
        button: { $value: "{color.ink}" },
      },
    }),
  )
  resolveAliases(model)
  const brand = parseTokens(
    JSON.stringify({
      brand: { text: { $type: "color", $value: black } },
    }),
  )
  resolveAliases(brand)
  send({
    type: "init",
    uri: URI,
    model,
    validation: validate(model),
    externalTokens: flattenTokens(brand.root),
    settings: {
      rootFontSize: 16,
      defaultColorSpace: "srgb",
      defaultDimensionUnit: "px",
      contrastTarget: "AA",
      modeView: "single",
    },
    scope: [],
    columnWidths: {},
  })
}

const button: TokenReference = {
  uri: URI,
  file: "colors.tokens.json",
  line: 6,
  character: 4,
  path: ["color", "button"],
}
const brandText: TokenReference = {
  uri: BRAND,
  file: "brand.tokens.json",
  line: 2,
  character: 4,
  path: ["brand", "text"],
}
const css: TokenReference = {
  uri: "file:///work/app.css",
  file: "app.css",
  line: 12,
  character: 9,
}

const section = () =>
  document.querySelector<HTMLElement>("aside.panel .references")

describe("the Referenced by section", () => {
  it("opens the token's panel and lists tokens apart from code", () => {
    open()
    send({
      type: "references",
      path: ["color", "ink"],
      references: [button, brandText, css],
    })
    expect(vi.mocked(setSelectedPathState)).toHaveBeenLastCalledWith([
      "color",
      "ink",
    ])
    const list = section()!
    expect(list).not.toBeNull()
    const tokens = [...list.querySelectorAll(".reference.token")].map(
      b => b.textContent,
    )
    expect(tokens).toEqual([
      "color.buttoncolors.tokens.json",
      "brand.textbrand.tokens.json",
    ])
    // Each referencing token draws its value.
    expect(list.querySelectorAll(".reference.token .swatch").length).toBe(2)
    const code = [...list.querySelectorAll(".reference.code")].map(
      b => b.textContent,
    )
    expect(code).toEqual(["app.css:12"])
  })

  it("says when nothing references the token", () => {
    open()
    send({ type: "references", path: ["color", "ink"], references: [] })
    expect(section()!.textContent).toContain("Nothing references {color.ink}.")
  })

  it("a token in this file opens its own panel, without the host", () => {
    open()
    send({ type: "references", path: ["color", "ink"], references: [button] })
    fireEvent.click(screen.getByTitle("Open color.button"))
    expect(vi.mocked(setSelectedPathState)).toHaveBeenLastCalledWith([
      "color",
      "button",
    ])
    expect(vi.mocked(post)).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "openReference" }),
    )
    // The list belongs to color.ink, so it goes with its panel.
    expect(section()).toBeNull()
  })

  it("a token in another file, or a use in code, goes to the host", () => {
    open()
    send({
      type: "references",
      path: ["color", "ink"],
      references: [brandText, css],
    })
    fireEvent.click(screen.getByTitle("Open brand.text"))
    expect(vi.mocked(post)).toHaveBeenLastCalledWith({
      type: "openReference",
      reference: brandText,
    })
    fireEvent.click(screen.getByTitle("Open app.css:12"))
    expect(vi.mocked(post)).toHaveBeenLastCalledWith({
      type: "openReference",
      reference: css,
    })
  })
})
