import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Glyph } from "../../src/webview/components/Glyph"
import type { TokenType } from "../../src/core/types"

/**
 * The small inline picture beside a value in a 28px table row. Every branch of
 * its `switch` draws a different element, and a type with nothing to draw must
 * draw nothing — so each test names the element and the one style property
 * that carries the value, and the undrawable cases assert empty DOM.
 */

// Vitest runs without `globals`, so testing-library's auto-cleanup never
// registers; unmount between tests explicitly or the renders accumulate.
afterEach(cleanup)

function draw(
  type: TokenType | undefined,
  value: unknown,
  onPick?: (v: unknown) => void,
) {
  return render(<Glyph value={value} type={type} onPick={onPick} />).container
}

// The capped lengths are written as `min(<value>, <cap>)`, which jsdom
// resolves to `calc(<whichever won>)` — so the assertions below read the cap
// as applied rather than as authored.

const RED = { colorSpace: "srgb", components: [1, 0, 0] }
const BLUE = { colorSpace: "srgb", components: [0, 0, 1] }

describe("Glyph — the drawable types", () => {
  it("draws a color as a 12px swatch filled with its hex", () => {
    const container = draw("color", RED)

    const swatch = container.querySelector(".glyph.swatch") as HTMLElement
    expect(swatch.style.width).toBe("12px")
    expect(swatch.style.height).toBe("12px")
    expect((swatch.firstElementChild as HTMLElement).style.background).toBe(
      "rgb(255, 0, 0)",
    )
  })

  it("draws a gradient as a wider swatch filled with its stops", () => {
    const container = draw("gradient", [
      { color: RED, position: 0 },
      { color: BLUE, position: 1 },
    ])

    const swatch = container.querySelector(".glyph.swatch") as HTMLElement
    expect(swatch.style.width).toBe("24px")
    expect((swatch.firstElementChild as HTMLElement).style.background).toBe(
      "linear-gradient(90deg, #ff0000 0%, #0000ff 100%)",
    )
  })

  it("draws a shadow as a card carrying the shadow, scaled to fit the row", () => {
    const container = draw("shadow", {
      offsetX: { value: 0, unit: "px" },
      offsetY: { value: 8, unit: "px" },
      blur: { value: 16, unit: "px" },
      spread: { value: 0, unit: "px" },
      color: RED,
    })

    const card = container.querySelector(".glyph.glyph-card") as HTMLElement
    // 0.25 of each length, so a row-sized shadow rather than the real one.
    expect(card.style.boxShadow).toBe("0px 2px 4px 0px #ff0000")
  })

  it("draws a border as a card carrying its style and color, width capped", () => {
    const card = draw("border", {
      width: { value: 8, unit: "px" },
      style: "dashed",
      color: BLUE,
    }).querySelector(".glyph.glyph-card") as HTMLElement

    expect(card.style.borderStyle).toBe("dashed")
    expect(card.style.borderColor).toBe("rgb(0, 0, 255)")
    // 8px would swamp a 28px row, so the cap wins.
    expect(card.style.borderWidth).toBe("calc(3px)")

    cleanup()
    const thin = draw("border", {
      width: { value: 1, unit: "px" },
      color: BLUE,
    }).querySelector(".glyph-card") as HTMLElement
    expect(thin.style.borderWidth).toBe("calc(1px)")
    // No `style` of its own still draws an edge.
    expect(thin.style.borderStyle).toBe("solid")
  })

  it("draws typography, a family and a weight as the Aa sample", () => {
    const typography = draw("typography", {
      fontFamily: ["Inter", "sans-serif"],
      fontWeight: "bold",
    }).querySelector(".glyph.glyph-sample") as HTMLElement
    expect(typography.textContent).toBe("Aa")
    expect(typography.style.fontFamily).toBe('"Inter", sans-serif')
    expect(typography.style.fontWeight).toBe("700")

    cleanup()
    const family = draw("fontFamily", "Inter").querySelector(
      ".glyph-sample",
    ) as HTMLElement
    // No generic in the stack, so one is appended for the preview.
    expect(family.style.fontFamily).toBe('"Inter", system-ui, sans-serif')
    expect(family.style.fontWeight).toBe("")

    cleanup()
    const weight = draw("fontWeight", 350).querySelector(
      ".glyph-sample",
    ) as HTMLElement
    expect(weight.style.fontWeight).toBe("350")
    expect(weight.style.fontFamily).toBe("")
  })

  it("draws a dimension as a fixed 12px ruler, whatever its length", () => {
    for (const value of [16, 64]) {
      const icon = draw("dimension", { value, unit: "px" }).querySelector(
        "svg.glyph.glyph-icon.ruler",
      )
      expect(icon?.getAttribute("width")).toBe("12")
      cleanup()
    }
  })

  it("draws a duration as a fixed 12px clock", () => {
    const icon = draw("duration", { value: 200, unit: "ms" }).querySelector(
      "svg.glyph.glyph-icon.clock",
    )
    expect(icon?.getAttribute("width")).toBe("12")
  })

  it("draws a cubicBezier as a curve through its control points", () => {
    const path = draw("cubicBezier", [0.25, 0.1, 0.25, 1]).querySelector(
      ".glyph.glyph-curve path",
    ) as SVGPathElement

    // The 12px box runs bottom-left to top-right, y inverted.
    expect(path.getAttribute("d")).toBe("M0 12 C 3 10.8, 3 0, 12 0")
  })

  it("draws a transition as the curve of its timing function", () => {
    const path = draw("transition", {
      duration: { value: 200, unit: "ms" },
      timingFunction: [0.25, 0.1, 0.25, 1],
    }).querySelector(".glyph-curve path") as SVGPathElement

    expect(path.getAttribute("d")).toBe("M0 12 C 3 10.8, 3 0, 12 0")
  })
})

describe("Glyph — nothing to draw", () => {
  it("renders nothing for a type it does not draw, or no type at all", () => {
    for (const type of ["number", "strokeStyle"] as TokenType[]) {
      expect(draw(type, 16).innerHTML).toBe("")
      cleanup()
    }
    expect(draw(undefined, "#ff0000").innerHTML).toBe("")
  })

  it("renders nothing for a color it cannot parse", () => {
    expect(draw("color", "not a color").innerHTML).toBe("")
  })

  it("renders nothing for a gradient with no stops", () => {
    expect(draw("gradient", []).innerHTML).toBe("")
    cleanup()
    expect(draw("gradient", { stops: [] }).innerHTML).toBe("")
  })

  it("renders nothing for a dimension or duration with no numeric length", () => {
    expect(draw("dimension", { value: "16", unit: "px" }).innerHTML).toBe("")
    cleanup()
    expect(draw("duration", { value: "200", unit: "ms" }).innerHTML).toBe("")
  })

  it("renders nothing for an easing that is not four numbers", () => {
    expect(draw("cubicBezier", [0.25, 0.1, 0.25]).innerHTML).toBe("")
    cleanup()
    expect(draw("cubicBezier", "ease-in-out").innerHTML).toBe("")
    cleanup()
    // A transition with no timing function draws no curve either.
    expect(
      draw("transition", { duration: { value: 200, unit: "ms" } }).innerHTML,
    ).toBe("")
  })
})

describe("Glyph — the editable color", () => {
  const translucent = {
    colorSpace: "oklch",
    components: [0.7, 0.2, 30],
    alpha: 0.5,
  }

  it("offers the picker only when a handler is given", () => {
    expect(screen.queryByLabelText("Pick color")).toBeNull()
    draw("color", RED)
    expect(screen.queryByLabelText("Pick color")).toBeNull()

    cleanup()
    draw("color", RED, vi.fn())
    expect(screen.getByLabelText("Pick color")).toBeTruthy()
  })

  it("reports the picked color in the value's own space, keeping its alpha", () => {
    const onPick = vi.fn()
    draw("color", translucent, onPick)

    fireEvent.change(screen.getByLabelText("Pick color"), {
      target: { value: "#0000ff" },
    })

    expect(onPick).toHaveBeenCalledTimes(1)
    const [picked] = onPick.mock.calls[0] as [
      { colorSpace: string; alpha?: number },
    ]
    expect(picked.colorSpace).toBe("oklch")
    expect(picked.alpha).toBe(0.5)
  })

  it("reports an opaque color with no alpha of its own", () => {
    const onPick = vi.fn()
    draw("color", RED, onPick)

    fireEvent.change(screen.getByLabelText("Pick color"), {
      target: { value: "#0000ff" },
    })

    expect(onPick.mock.calls).toEqual([
      [
        {
          colorSpace: "srgb",
          components: [0, 0, 1],
          hex: "#0000ff",
          alpha: undefined,
        },
      ],
    ])
  })
})
