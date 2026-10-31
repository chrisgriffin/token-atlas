import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// App.tsx imports vscodeApi, which calls acquireVsCodeApi() at load.
vi.mock("../../src/webview/vscodeApi", () => ({
  post: vi.fn(),
  getPanelWidth: vi.fn(),
  getSelectedPath: vi.fn(() => null),
  setPanelWidthState: vi.fn(),
  setSelectedPathState: vi.fn(),
}))

import { post } from "../../src/webview/vscodeApi"
import { App } from "../../src/webview/App"

afterEach(cleanup)

describe("error screen", () => {
  it("offers Open as JSON when the file cannot be read", () => {
    render(<App />)
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "error", message: "Unexpected token" },
        }),
      )
    })

    expect(
      screen.getByText(/Could not read tokens: Unexpected token/),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Open as JSON" }))

    expect(post).toHaveBeenLastCalledWith({ type: "openAsText" })
  })
})
