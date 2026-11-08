import { describe, it, expect } from "vitest"
import { parseTokens } from "../../src/core/parse"
import { resolveAliases } from "../../src/core/resolve"
import { validate } from "../../src/core/validate"

function issuesFor(doc: Record<string, unknown>) {
  const model = parseTokens(JSON.stringify(doc))
  resolveAliases(model)
  return validate(model).issues
}
const shapeErrors = (doc: Record<string, unknown>) =>
  issuesFor(doc).filter(i => /\$value must be/.test(i.message))

describe("validate — $value shape for color, dimension, duration", () => {
  const good = {
    colorSpace: "srgb",
    components: [0, 0, 1],
  }

  it("flags a legacy string color as an error naming the expected shape", () => {
    const errs = shapeErrors({
      color: { $type: "color", a: { $value: "#ff0000" } },
    })
    expect(errs).toHaveLength(1)
    expect(errs[0].severity).toBe("error")
    expect(errs[0].path).toEqual(["color", "a"])
    expect(errs[0].message).toMatch(/colorSpace/)
    expect(errs[0].message).toMatch(/components/)
  })

  it("flags a legacy string dimension and a string duration", () => {
    const errs = shapeErrors({
      space: { $type: "dimension", md: { $value: "16px" } },
      motion: { $type: "duration", fast: { $value: "150ms" } },
    })
    expect(errs.map(e => e.path.join("."))).toEqual(["space.md", "motion.fast"])
    for (const e of errs) expect(e.message).toMatch(/value.*unit/)
  })

  it("flags an object missing a required member", () => {
    const errs = shapeErrors({
      color: { $type: "color", a: { $value: { colorSpace: "srgb" } } },
      space: { $type: "dimension", md: { $value: { value: 16 } } },
    })
    expect(errs).toHaveLength(2)
  })

  it("says whether a member is missing or merely the wrong type", () => {
    const [missing, wrong] = shapeErrors({
      space: {
        $type: "dimension",
        a: { $value: { value: 16 } },
        b: { $value: { value: "16", unit: "px" } },
      },
    })
    expect(missing.message).toMatch(/unit missing/)
    expect(wrong.message).toMatch(/value a string \(expected number\)/)
    expect(wrong.message).not.toMatch(/missing/)
  })

  it("accepts a well-formed object of each type", () => {
    expect(
      shapeErrors({
        color: { $type: "color", a: { $value: good } },
        space: {
          $type: "dimension",
          md: { $value: { value: 16, unit: "px" } },
        },
        motion: {
          $type: "duration",
          fast: { $value: { value: 150, unit: "ms" } },
        },
      }),
    ).toEqual([])
  })

  it("reports nothing new for an alias or a token with no $type", () => {
    const issues = issuesFor({
      color: {
        $type: "color",
        a: { $value: good },
        b: { $value: "{color.a}" },
      },
      untyped: { x: { $value: "#ff0000" } },
    })
    expect(issues.filter(i => /\$value must be/.test(i.message))).toEqual([])
    // The untyped token is still reported once, for the missing $type only.
    expect(issues.filter(i => i.path.join(".") === "untyped.x")).toHaveLength(1)
  })
})

describe("validate — $value shape for number, fontWeight, cubicBezier, fontFamily", () => {
  it("flags a string number and accepts a numeric one", () => {
    expect(
      shapeErrors({ n: { $type: "number", bad: { $value: "16" } } }),
    ).toHaveLength(1)
    expect(
      shapeErrors({ n: { $type: "number", ok: { $value: 1.25 } } }),
    ).toEqual([])
  })

  it("fontWeight accepts a number or a spec keyword and rejects anything else", () => {
    expect(
      shapeErrors({
        w: {
          $type: "fontWeight",
          num: { $value: 600 },
          kw: { $value: "semi-bold" },
          kw2: { $value: "extra-black" },
        },
      }),
    ).toEqual([])
    const errs = shapeErrors({
      w: { $type: "fontWeight", bad: { $value: "boldish" } },
    })
    expect(errs).toHaveLength(1)
    expect(errs[0].message).toMatch(/keyword/)
  })

  it("cubicBezier must be exactly four numbers", () => {
    expect(
      shapeErrors({
        e: { $type: "cubicBezier", ok: { $value: [0.4, 0, 0.2, 1] } },
      }),
    ).toEqual([])
    const errs = shapeErrors({
      e: {
        $type: "cubicBezier",
        three: { $value: [0.4, 0, 0.2] },
        strings: { $value: ["0.4", "0", "0.2", "1"] },
        str: { $value: "ease-in" },
      },
    })
    expect(errs.map(e => e.path[1])).toEqual(["three", "strings", "str"])
    expect(errs[0].message).toMatch(/four numbers/)
  })

  it("fontFamily accepts a string or an array of strings", () => {
    expect(
      shapeErrors({
        f: {
          $type: "fontFamily",
          one: { $value: "Inter" },
          stack: { $value: ["Inter", "sans-serif"] },
        },
      }),
    ).toEqual([])
    const errs = shapeErrors({
      f: {
        $type: "fontFamily",
        num: { $value: 12 },
        mixed: { $value: ["Inter", 3] },
      },
    })
    expect(errs.map(e => e.path[1])).toEqual(["num", "mixed"])
  })

  it("reports nothing new for an alias or a token with no $type", () => {
    const issues = issuesFor({
      n: { $type: "number", a: { $value: 1 }, b: { $value: "{n.a}" } },
      untyped: { x: { $value: "16" } },
    })
    expect(issues.filter(i => /\$value must be/.test(i.message))).toEqual([])
  })
})

describe("validate with a local scope", () => {
  const model = () =>
    parseTokens(
      JSON.stringify({
        light: { surface: { $type: "number", $value: 1 } },
        semantic: { page: { $type: "number", $value: "{light.surface}" } },
      }),
    )

  it("accepts a local reference when no scope is given", () => {
    const m = model()
    resolveAliases(m)
    expect(validate(m).issues).toEqual([])
  })

  it("reports a reference into an out-of-scope key as unresolved", () => {
    const m = model()
    const scope = (key: string) => key.startsWith("semantic.")
    resolveAliases(m, undefined, scope)
    const { issues } = validate(m, undefined, scope)
    expect(issues).toEqual([
      {
        severity: "error",
        path: ["semantic", "page"],
        message: "Unresolved reference: {light.surface}",
      },
    ])
  })
})

describe("core model fixes — what DTCG 2025.10 rejects", () => {
  const px = (value: number) => ({ value, unit: "px" })
  const black = { colorSpace: "srgb", components: [0, 0, 0] }
  const at = (doc: Record<string, unknown>) =>
    issuesFor(doc)
      .filter(i => i.severity === "error")
      .map(i => `${i.path.join(".")}: ${i.message}`)

  it("reports an unknown $type on a token and on a group, where it is declared", () => {
    expect(
      at({
        a: { $type: "colour", $value: "#f00" },
        b: { $type: "string", $value: 3 },
        g: { $type: "Color", c: { $value: 1 } },
      }),
    ).toEqual([
      `g.$type: Unknown $type "Color": use one of color, dimension, fontFamily, fontWeight, duration, cubicBezier, number, strokeStyle, border, transition, shadow, gradient, typography.`,
      `a.$type: Unknown $type "colour": use one of color, dimension, fontFamily, fontWeight, duration, cubicBezier, number, strokeStyle, border, transition, shadow, gradient, typography.`,
      `b.$type: Unknown $type "string": use one of color, dimension, fontFamily, fontWeight, duration, cubicBezier, number, strokeStyle, border, transition, shadow, gradient, typography.`,
    ])
  })

  it("allows only px and rem for a dimension, ms and s for a duration (§8.2, §8.5)", () => {
    expect(
      at({
        d: { $type: "dimension", $value: { value: 1, unit: "em" } },
        t: { $type: "duration", $value: { value: 1, unit: "min" } },
        ok: { $type: "dimension", $value: { value: 1, unit: "rem" } },
        ok2: { $type: "duration", $value: { value: 1, unit: "s" } },
      }),
    ).toEqual([
      `d: dimension unit must be "px" or "rem" (DTCG 2025.10); got "em".`,
      `t: duration unit must be "ms" or "s" (DTCG 2025.10); got "min".`,
    ])
  })

  it("checks a color object's space, components, alpha and hex", () => {
    expect(
      at({
        c: {
          $type: "color",
          space: { $value: { colorSpace: "rgb", components: [255, 0, 0] } },
          count: { $value: { colorSpace: "srgb", components: [1, 0] } },
          comp: { $value: { colorSpace: "srgb", components: ["x", 0, 0] } },
          alpha: {
            $value: { colorSpace: "srgb", components: [1, 0, 0], alpha: 7 },
          },
          hex: {
            $value: { colorSpace: "srgb", components: [1, 0, 0], hex: "red" },
          },
          ok: {
            $value: {
              colorSpace: "hsl",
              components: ["none", 0, 100],
              alpha: 0.5,
              hex: "#ffffff",
            },
          },
        },
      }),
    ).toEqual([
      `c.space: color colorSpace "rgb" is not one the spec defines (srgb, srgb-linear, hsl, hwb, lab, lch, oklab, oklch, display-p3, a98-rgb, prophoto-rgb, rec2020, xyz-d65, xyz-d50).`,
      `c.count: color components must be 3 numbers or "none"; got an array of 2.`,
      `c.comp: color components must be 3 numbers or "none"; got "x".`,
      `c.alpha: color alpha must be a number from 0 to 1; got 7.`,
      `c.hex: color hex must be a 6-digit CSS hex color such as "#ff0000"; got "red".`,
    ])
  })

  it("checks each composite's members and runs the primitive checks on its sub-values (§9)", () => {
    expect(
      at({
        s: { $type: "shadow", $value: { color: "#000", offsetX: "2px" } },
        b: { $type: "border", $value: 42 },
        ty: { $type: "typography", $value: "16px Inter" },
        tr: {
          $type: "transition",
          $value: {
            duration: px(1),
            delay: { value: 0, unit: "ms" },
            timingFunction: [0, 0, 1, 1],
            ease: 1,
          },
        },
        gr: { $type: "gradient", $value: [{ color: black, position: "0" }] },
        st: { $type: "strokeStyle", $value: "wavy" },
        st2: {
          $type: "strokeStyle",
          $value: { dashArray: [px(1), "2px"], lineCap: "flat" },
        },
      }),
    ).toEqual([
      `s: shadow $value.color: color $value must be an object { colorSpace, components } (DTCG 2025.10); got a string.`,
      `s: shadow $value.offsetX: dimension $value must be an object { value, unit } (DTCG 2025.10); got a string.`,
      `s: shadow $value is missing offsetY, blur, spread (DTCG 2025.10).`,
      `b: border $value must be an object { color, width, style } (DTCG 2025.10); got a number.`,
      `ty: typography $value must be an object { fontFamily, fontSize, fontWeight, letterSpacing, lineHeight } (DTCG 2025.10); got a string.`,
      `tr: transition $value.duration: duration unit must be "ms" or "s" (DTCG 2025.10); got "px".`,
      `tr: transition $value has a member the spec does not define: ease (DTCG 2025.10).`,
      `gr: gradient $value[0].position: number $value must be a number (DTCG 2025.10); got a string.`,
      `st: strokeStyle $value must be one of solid, dashed, dotted, double, groove, ridge, outset, inset, or an object { dashArray, lineCap } (DTCG 2025.10); got "wavy".`,
      `st2: strokeStyle $value.dashArray[1]: dimension $value must be an object { value, unit } (DTCG 2025.10); got a string.`,
      `st2: strokeStyle $value.lineCap must be "round", "butt" or "square" (DTCG 2025.10); got "flat".`,
    ])
  })

  it("accepts well-formed composites, references in sub-values and a shadow array", () => {
    const shadow = {
      color: black,
      offsetX: px(0),
      offsetY: px(1),
      blur: px(2),
      spread: px(0),
    }
    expect(
      at({
        c: { $type: "color", $value: black },
        w: { $type: "dimension", $value: px(1) },
        s1: { $type: "shadow", $value: { ...shadow, inset: true } },
        s2: { $type: "shadow", $value: ["{s1}", { ...shadow, color: "{c}" }] },
        b: {
          $type: "border",
          $value: { color: "{c}", width: "{w}", style: "solid" },
        },
        b2: {
          $type: "border",
          $value: {
            color: black,
            width: px(1),
            style: { dashArray: ["{w}", px(2)], lineCap: "round" },
          },
        },
        ty: {
          $type: "typography",
          $value: {
            fontFamily: ["Inter", "sans-serif"],
            fontSize: px(16),
            fontWeight: "bold",
            letterSpacing: px(0),
            lineHeight: 1.5,
          },
        },
        tr: {
          $type: "transition",
          $value: {
            duration: { value: 200, unit: "ms" },
            delay: { value: 0, unit: "ms" },
            timingFunction: [0.5, 0, 1, 1],
          },
        },
        gr: {
          $type: "gradient",
          $value: [
            { color: black, position: 0 },
            { color: "{c}", position: 42 },
          ],
        },
        p: { $type: "dimension", $value: { $ref: "#/w/$value" } },
      }),
    ).toEqual([])
  })

  it("reports a cycle through composite values on each token in it", () => {
    expect(
      at({
        s1: { $type: "shadow", $value: ["{s2}"] },
        s2: { $type: "shadow", $value: ["{s1}"] },
      }),
    ).toEqual([
      "s1: Reference cycle detected through {s2}",
      "s2: Reference cycle detected through {s1}",
    ])
  })

  it("says a dangling chain does not resolve, naming the missing token, instead of a cycle", () => {
    expect(
      at({
        a: { $type: "number", $value: "{b}" },
        b: { $type: "number", $value: "{missing}" },
      }),
    ).toEqual([
      "a: Unresolved reference: {b} leads to {missing}, which does not exist.",
      "b: Unresolved reference: {missing}",
    ])
  })
})
