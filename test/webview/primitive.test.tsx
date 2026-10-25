import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ComponentType } from "react"
import type { EditorProps } from "../../src/webview/editors/registry"
import {
  ColorEditor,
  CubicBezierEditor,
  DimensionEditor,
  DurationEditor,
  FontFamilyEditor,
  FontWeightEditor,
  NumberEditor,
} from "../../src/webview/editors/primitive"

/**
 * The primitive editors each turn what was typed into a DTCG 2025.10 value.
 * These pin the value handed to `onChange`; the field controls themselves are
 * covered by `fields.test.tsx`.
 */

afterEach(cleanup)

/** Text and number inputs commit on blur as well as on a pause; blur keeps tests exact. */
const type = (input: HTMLElement, value: string) => {
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}

const mount = (Editor: ComponentType<EditorProps>, value: unknown) => {
  const onChange = vi.fn()
  render(<Editor value={value} onChange={onChange} />)
  return onChange
}

const numbers = () => screen.getAllByRole("spinbutton")

/** The hex text field, not the native colour swatch beside it. */
const hexField = (value: string) =>
  screen.getAllByDisplayValue(value).find(el => el.classList.contains("mono"))!

describe("ColorEditor", () => {
  const red = { colorSpace: "srgb", components: [1, 0, 0], hex: "#ff0000" }

  it("writes a typed hex as a DTCG color object in the token's space", () => {
    const onChange = mount(ColorEditor, red)
    type(hexField("#ff0000"), "#0000ff")
    expect(onChange).toHaveBeenCalledWith({
      colorSpace: "srgb",
      components: [0, 0, 1],
      hex: "#0000ff",
    })
  })

  it("writes a changed component with the hex recomputed", () => {
    const onChange = mount(ColorEditor, red)
    type(numbers()[1], "1")
    expect(onChange).toHaveBeenCalledWith({
      colorSpace: "srgb",
      components: [1, 1, 0],
      hex: "#ffff00",
    })
  })

  it("writes alpha, clamped to 0..1", () => {
    const onChange = mount(ColorEditor, red)
    type(numbers()[3], "1.5")
    type(numbers()[3], "0.5")
    expect(onChange.mock.calls).toEqual([
      [{ colorSpace: "srgb", components: [1, 0, 0], hex: "#ff0000" }],
      [
        {
          colorSpace: "srgb",
          components: [1, 0, 0],
          alpha: 0.5,
          hex: "#ff0000",
        },
      ],
    ])
  })

  it("keeps the alpha when the hex changes", () => {
    const onChange = mount(ColorEditor, { ...red, alpha: 0.5 })
    type(hexField("#ff000080"), "#00ff00")
    expect(onChange).toHaveBeenCalledWith({
      colorSpace: "srgb",
      components: [0, 1, 0],
      alpha: 0.5,
      hex: "#00ff00",
    })
  })

  it("converts to a newly picked color space", () => {
    const onChange = mount(ColorEditor, red)
    fireEvent.change(screen.getByDisplayValue("srgb"), {
      target: { value: "display-p3" },
    })
    const next = onChange.mock.calls[0][0]
    expect(next.colorSpace).toBe("display-p3")
    expect(next.components).toHaveLength(3)
    expect(next.hex).toBe("#ff0000")
  })

  it("reads a legacy hex string and writes back an object", () => {
    const onChange = mount(ColorEditor, "#ff0000")
    type(numbers()[2], "1")
    expect(onChange).toHaveBeenCalledWith({
      colorSpace: "srgb",
      components: [1, 0, 1],
      hex: "#ff00ff",
    })
  })

  it("ignores a hex that does not parse", () => {
    const onChange = mount(ColorEditor, red)
    type(hexField("#ff0000"), "not a color")
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe("DimensionEditor", () => {
  it("writes { value, unit } when the number changes", () => {
    const onChange = mount(DimensionEditor, { value: 16, unit: "px" })
    type(numbers()[0], "24")
    expect(onChange).toHaveBeenCalledWith({ value: 24, unit: "px" })
  })

  it("writes { value, unit } when the unit changes", () => {
    const onChange = mount(DimensionEditor, { value: 1, unit: "px" })
    fireEvent.change(screen.getByDisplayValue("px"), {
      target: { value: "rem" },
    })
    expect(onChange).toHaveBeenCalledWith({ value: 1, unit: "rem" })
  })

  it("starts an empty value at 0px", () => {
    const onChange = mount(DimensionEditor, undefined)
    type(numbers()[0], "8")
    expect(onChange).toHaveBeenCalledWith({ value: 8, unit: "px" })
  })
})

describe("NumberEditor", () => {
  it("writes a bare number", () => {
    const onChange = mount(NumberEditor, 1.5)
    type(numbers()[0], "2.25")
    expect(onChange.mock.calls).toEqual([[2.25]])
  })

  it("treats a non-number value as 0", () => {
    mount(NumberEditor, "oops")
    expect((numbers()[0] as HTMLInputElement).value).toBe("0")
  })
})

describe("DurationEditor", () => {
  it("writes { value, unit } when the number changes", () => {
    const onChange = mount(DurationEditor, { value: 200, unit: "ms" })
    type(numbers()[0], "300")
    expect(onChange).toHaveBeenCalledWith({ value: 300, unit: "ms" })
  })

  it("writes { value, unit } when the unit changes", () => {
    const onChange = mount(DurationEditor, { value: 1, unit: "ms" })
    fireEvent.change(screen.getByDisplayValue("ms"), { target: { value: "s" } })
    expect(onChange).toHaveBeenCalledWith({ value: 1, unit: "s" })
  })

  it("starts an empty value at 0ms", () => {
    const onChange = mount(DurationEditor, undefined)
    type(numbers()[0], "150")
    expect(onChange).toHaveBeenCalledWith({ value: 150, unit: "ms" })
  })
})

describe("FontFamilyEditor", () => {
  const input = () =>
    screen.getByPlaceholderText("Inter, system-ui, sans-serif")

  it("writes one family as a string", () => {
    const onChange = mount(FontFamilyEditor, "Inter")
    type(input(), " Roboto ")
    expect(onChange.mock.calls).toEqual([["Roboto"]])
  })

  it("writes a comma-separated stack as an array, trimmed and without blanks", () => {
    const onChange = mount(FontFamilyEditor, "Inter")
    type(input(), " Inter , system-ui ,, sans-serif ")
    expect(onChange.mock.calls).toEqual([
      [["Inter", "system-ui", "sans-serif"]],
    ])
  })

  it("shows an existing fallback array as a comma-separated list", () => {
    mount(FontFamilyEditor, ["Inter", "sans-serif"])
    expect((input() as HTMLInputElement).value).toBe("Inter, sans-serif")
  })

  it("writes an array cut down to one family as a string", () => {
    const onChange = mount(FontFamilyEditor, ["Inter", "sans-serif"])
    type(input(), "Inter")
    expect(onChange.mock.calls).toEqual([["Inter"]])
  })
})

describe("FontWeightEditor", () => {
  const keyword = () =>
    screen.getByLabelText("Weight keyword") as HTMLSelectElement

  it("writes a typed numeric weight as a number", () => {
    const onChange = mount(FontWeightEditor, 400)
    type(numbers()[0], "700")
    expect(onChange.mock.calls).toEqual([[700]])
  })

  it("writes a picked keyword as the keyword string", () => {
    const onChange = mount(FontWeightEditor, 400)
    fireEvent.change(keyword(), { target: { value: "bold" } })
    expect(onChange.mock.calls).toEqual([["bold"]])
  })

  it("shows a keyword value's weight, and a number's keyword", () => {
    mount(FontWeightEditor, "semi-bold")
    expect((numbers()[0] as HTMLInputElement).value).toBe("600")
    expect(keyword().value).toBe("semi-bold")
    cleanup()
    mount(FontWeightEditor, 300)
    expect(keyword().value).toBe("light")
  })

  it("shows an in-between weight as custom, and picking custom writes the number", () => {
    const onChange = mount(FontWeightEditor, 450)
    expect(keyword().value).toBe("")
    fireEvent.change(keyword(), { target: { value: "" } })
    expect(onChange.mock.calls).toEqual([[450]])
  })
})

describe("CubicBezierEditor", () => {
  it("writes the four numbers with the edited one replaced", () => {
    const onChange = mount(CubicBezierEditor, [0.4, 0, 0.2, 1])
    type(numbers()[1], "0.5")
    expect(onChange.mock.calls).toEqual([[[0.4, 0.5, 0.2, 1]]])
  })

  it("clamps x1 and x2 to 0..1, as DTCG requires, and leaves y free", () => {
    const onChange = mount(CubicBezierEditor, [0.4, 0, 0.2, 1])
    type(numbers()[0], "1.5")
    type(numbers()[2], "-0.5")
    type(numbers()[3], "1.8")
    expect(onChange.mock.calls).toEqual([
      [[1, 0, 0.2, 1]],
      [[0.4, 0, 0, 1]],
      [[0.4, 0, 0.2, 1.8]],
    ])
  })

  it.each([
    ["three numbers", [0.4, 0, 0.2]],
    ["a non-number among four", [0.4, "0", 0.2, 1]],
    ["a string", "ease-in"],
  ])(
    "replaces %s with the default curve rather than editing it",
    (_, value) => {
      const onChange = mount(CubicBezierEditor, value)
      type(numbers()[3], "0.9")
      expect(onChange.mock.calls).toEqual([[[0.25, 0.1, 0.25, 0.9]]])
    },
  )
})
