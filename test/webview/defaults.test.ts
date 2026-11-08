import { describe, it, expect } from "vitest"
import { COMPOSITE_TYPES, PRIMITIVE_TYPES } from "../../src/core/types"
import {
  defaultValueFor,
  isPlaceholderValue,
} from "../../src/webview/lib/defaults"
import { summarize } from "../../src/webview/lib/css"
import type { EditorSettings } from "../../src/shared/protocol"

const PX: EditorSettings = {
  rootFontSize: 16,
  defaultColorSpace: "srgb",
  defaultDimensionUnit: "px",
  contrastTarget: "AA",
  modeView: "single",
}
const REM_P3: EditorSettings = {
  rootFontSize: 16,
  defaultColorSpace: "display-p3",
  defaultDimensionUnit: "rem",
  contrastTarget: "AA",
  modeView: "single",
}

describe("defaultValueFor", () => {
  it("gives every DTCG type a value the table can summarize", () => {
    for (const t of [...PRIMITIVE_TYPES, ...COMPOSITE_TYPES]) {
      const v = defaultValueFor(t)
      expect(v, t).not.toBeUndefined()
      expect(summarize(v, t), t).not.toBe("")
    }
  })
  it("recognises the placeholder a new token is created with", () => {
    expect(isPlaceholderValue(0)).toBe(true)
    expect(isPlaceholderValue("")).toBe(true)
    expect(isPlaceholderValue({ value: 1, unit: "px" })).toBe(false)
  })

  it("creates dimensions in the configured unit, converting through the root size", () => {
    expect(defaultValueFor("dimension", PX)).toEqual({ value: 16, unit: "px" })
    expect(defaultValueFor("dimension", REM_P3)).toEqual({
      value: 1,
      unit: "rem",
    })
    expect(
      defaultValueFor("dimension", { ...REM_P3, rootFontSize: 10 }),
    ).toEqual({
      value: 1.6,
      unit: "rem",
    })
  })

  it("uses the configured unit inside composites too", () => {
    const t = defaultValueFor("typography", REM_P3) as Record<string, unknown>
    expect(t.fontSize).toEqual({ value: 1, unit: "rem" })
  })

  it("creates colours in the configured space, dropping the sRGB hex fallback", () => {
    expect(defaultValueFor("color", PX)).toMatchObject({
      colorSpace: "srgb",
      hex: "#000000",
    })
    const c = defaultValueFor("color", REM_P3) as Record<string, unknown>
    expect(c.colorSpace).toBe("display-p3")
    expect(c.hex).toBeUndefined()
  })

  it("starts composite colours as colour objects in the configured space (#8)", () => {
    const colors = (t: "border" | "shadow" | "gradient", s: EditorSettings) => {
      const v = defaultValueFor(t, s)
      return (Array.isArray(v) ? v : [v]).map(
        x => (x as Record<string, unknown>).color,
      )
    }
    for (const t of ["border", "shadow", "gradient"] as const) {
      for (const c of colors(t, PX))
        expect(c, t).toMatchObject({ colorSpace: "srgb" })
      for (const c of colors(t, REM_P3)) {
        expect(c, t).toMatchObject({ colorSpace: "display-p3" })
        expect((c as Record<string, unknown>).hex, t).toBeUndefined()
      }
    }
    expect(colors("shadow", PX)[0]).toMatchObject({ alpha: 0.2 })
    expect(colors("gradient", PX)[1]).toMatchObject({ components: [1, 1, 1] })
  })
})
