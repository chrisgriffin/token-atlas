import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { TYPE_ICON_PATHS, TypeIcon } from "../../src/webview/icons"
import { ALL_TYPES } from "../../src/core/types"

afterEach(cleanup)

describe("TypeIcon", () => {
  it("draws a distinct, decorative icon for every token type", () => {
    for (const type of ALL_TYPES) {
      const { container } = render(<TypeIcon type={type} />)
      const svg = container.querySelector(`svg.type-icon[data-type="${type}"]`)
      expect(svg?.getAttribute("aria-hidden"), type).toBe("true")
      expect(svg?.querySelector("path")?.getAttribute("d"), type).toBe(
        TYPE_ICON_PATHS[type],
      )
      cleanup()
    }
    expect(new Set(Object.values(TYPE_ICON_PATHS)).size).toBe(ALL_TYPES.length)
  })

  it("draws nothing for an untyped token", () => {
    const { container } = render(<TypeIcon type={undefined} />)
    expect(container.innerHTML).toBe("")
  })
})
