import { describe, it, expect, vi } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseTokens } from "../../src/core/parse"
import { resolveAliases } from "../../src/core/resolve"
import { indexTokens } from "../../src/core/resolve"
import { lintTokens, parseLintConfig, LINT_RULE_IDS } from "../../src/core/lint"
import type { TokenNode } from "../../src/core/types"

// No real color makes colorjs throw, so the uncomputable case is a stub.
const contrast = vi.hoisted(() => ({ fails: false }))
vi.mock("../../src/core/color", async importOriginal => {
  const color = await importOriginal<typeof import("../../src/core/color")>()
  return {
    ...color,
    wcagContrast: (a: unknown, b: unknown) =>
      contrast.fails ? null : color.wcagContrast(a, b),
  }
})

function lint(
  doc: Record<string, unknown>,
  config: Record<string, unknown>,
  external?: Map<string, TokenNode>,
  localScope?: (key: string) => boolean,
) {
  const model = parseTokens(JSON.stringify(doc))
  resolveAliases(model, external, localScope)
  const parsed = parseLintConfig(JSON.stringify(config))
  expect(parsed.issues).toEqual([])
  return lintTokens(model, parsed.config, external, localScope)
}
const codes = (issues: ReturnType<typeof lint>) => issues.map(i => i.code)

const color = (space: string, components: number[]) => ({
  $type: "color",
  $value: { colorSpace: space, components },
})
const srgb = (v: number) => color("srgb", [v, v, v])

describe("lint — the rule ids", () => {
  it("are the five token-atlas/* rules", () => {
    expect([...LINT_RULE_IDS]).toEqual([
      "token-atlas/tier-alias-inverted",
      "token-atlas/vocabulary-invalid",
      "token-atlas/ramp-not-monotonic",
      "token-atlas/name-case",
      "token-atlas/contrast-insufficient",
    ])
  })
})

describe("lint — absent config is silence (FR-3)", () => {
  const doc = {
    a: { x: { ...srgb(0.5), $value: "{b.y}" } },
    b: { y: srgb(0.2), "Bad Name": srgb(0.1) },
  }

  it("emits nothing for an empty config", () => {
    expect(lint(doc, {})).toEqual([])
  })

  it("emits nothing when only rules are set", () => {
    expect(
      lint(doc, {
        rules: Object.fromEntries(LINT_RULE_IDS.map(id => [id, "error"])),
      }),
    ).toEqual([])
  })

  it("emits nothing for any example token set", () => {
    const root = join(__dirname, "../../examples")
    for (const dir of readdirSync(root, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue
      for (const file of readdirSync(join(root, dir.name))) {
        if (!file.endsWith(".json")) continue
        const model = parseTokens(
          readFileSync(join(root, dir.name, file), "utf8"),
        )
        resolveAliases(model)
        expect(lintTokens(model, parseLintConfig("").config), file).toEqual([])
      }
    }
  })
})

describe("lint — token-atlas/tier-alias-inverted", () => {
  const tiers = ["a", "b", "c"]

  it("flags an alias up the tiers, naming both tokens and both tiers", () => {
    const issues = lint(
      { a: { x: { $type: "number", $value: "{b.y}" } }, b: { y: n(1) } },
      { tiers },
    )
    expect(codes(issues)).toEqual(["token-atlas/tier-alias-inverted"])
    expect(issues[0].path).toEqual(["a", "x"])
    expect(issues[0].severity).toBe("warning")
    for (const word of ["a.x", "b.y", '"a"', '"b"'])
      expect(issues[0].message).toContain(word)
  })

  it("is silent for a downward or same-tier alias", () => {
    const doc = {
      a: { y: n(1) },
      b: { x: { $value: "{a.y}" }, z: n(2), w: { $value: "{b.z}" } },
    }
    expect(lint(doc, { tiers })).toEqual([])
  })

  it("judges the direct target, not the resolved one", () => {
    // a.x -> b.y -> a.z resolves to a.z (same tier) but its direct edge is upward.
    const doc = {
      a: { x: { $value: "{b.y}" }, z: n(1) },
      b: { y: { $value: "{a.z}" } },
    }
    const issues = lint(doc, { tiers })
    expect(issues.map(i => i.path.join("."))).toEqual(["a.x"])
  })

  it("knows the tier of a target in another file", () => {
    // b.y is not in this document; its tier comes from its path alone.
    const issues = lint(
      { a: { x: { $type: "number", $value: "{b.y}" } } },
      { tiers },
    )
    expect(codes(issues)).toEqual(["token-atlas/tier-alias-inverted"])
  })

  it("flags an upward reference inside a composite value", () => {
    const doc = {
      a: {
        s: {
          $type: "shadow",
          $value: {
            color: "{c.k}",
            offsetX: d(0),
            offsetY: d(1),
            blur: d(2),
            spread: d(0),
          },
        },
      },
    }
    expect(codes(lint(doc, { tiers }))).toEqual([
      "token-atlas/tier-alias-inverted",
    ])
  })

  it("matches a mode-scoped tier on the part before the slash", () => {
    const doc = { "a/dark": { x: { $type: "number", $value: "{b.y}" } } }
    expect(codes(lint(doc, { tiers }))).toEqual([
      "token-atlas/tier-alias-inverted",
    ])
  })

  it("skips a token or a target outside the configured tiers", () => {
    const doc = {
      other: { x: { $type: "number", $value: "{c.y}" } },
      a: { x: { $type: "number", $value: "{other.y}" } },
    }
    expect(lint(doc, { tiers })).toEqual([])
  })

  it("emits nothing with fewer than two tiers", () => {
    const doc = { a: { x: { $type: "number", $value: "{b.y}" } } }
    expect(lint(doc, { tiers: ["b"] })).toEqual([])
  })
})

describe("lint — token-atlas/vocabulary-invalid", () => {
  const vocabularies = [
    { paths: ["system.radius"], values: ["none", "sm", "md", "lg", "full"] },
    { paths: ["*.state"], values: ["hover", "active", "disabled"] },
  ]

  it("flags a leaf outside its set and lists the allowed values", () => {
    const issues = lint(
      { system: { radius: { sm: d(2), huge: d(99) } } },
      { vocabularies },
    )
    expect(codes(issues)).toEqual(["token-atlas/vocabulary-invalid"])
    expect(issues[0].path).toEqual(["system", "radius", "huge"])
    expect(issues[0].message).toContain("none, sm, md, lg, full")
  })

  it("is silent for an ungoverned token", () => {
    expect(
      lint({ system: { space: { huge: d(99) } } }, { vocabularies }),
    ).toEqual([])
  })

  it("matches * against exactly one segment of the parent path", () => {
    const doc = {
      button: { state: { hover: n(1), pressed: n(2) } },
      deep: { button: { state: { pressed: n(3) } } },
    }
    const issues = lint(doc, { vocabularies })
    expect(issues.map(i => i.path.join("."))).toEqual(["button.state.pressed"])
  })

  it("governs by the first matching entry and reports once", () => {
    const issues = lint(
      { system: { radius: { xl: d(1) } } },
      {
        vocabularies: [
          { paths: ["system.radius"], values: ["sm"] },
          { paths: ["*.radius"], values: ["md"] },
        ],
      },
    )
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain("(sm)")
  })

  it("flags a legacy numeric leaf by its absence from the set", () => {
    const issues = lint({ system: { radius: { "4": d(4) } } }, { vocabularies })
    expect(codes(issues)).toEqual(["token-atlas/vocabulary-invalid"])
  })
})

describe("lint — token-atlas/ramp-not-monotonic", () => {
  const rampPaths = ["color.neutral", "color.*.ramp"]

  it("flags the step that reverses the ramp, naming the previous step", () => {
    const doc = {
      color: {
        neutral: {
          "100": srgb(0.1),
          "200": srgb(0.3),
          "300": srgb(0.2),
          "400": srgb(0.6),
        },
      },
    }
    const issues = lint(doc, { rampPaths })
    expect(codes(issues)).toEqual(["token-atlas/ramp-not-monotonic"])
    expect(issues[0].path).toEqual(["color", "neutral", "300"])
    expect(issues[0].message).toContain("color.neutral.200")
  })

  it("orders steps numerically, not by key order or as strings", () => {
    const doc = {
      color: {
        neutral: { "900": srgb(0.9), "50": srgb(0.05), "100": srgb(0.1) },
      },
    }
    expect(lint(doc, { rampPaths })).toEqual([])
  })

  it("takes the direction most steps agree on, so one bad first step is one finding", () => {
    const doc = {
      color: {
        neutral: {
          "1": srgb(0.5),
          "2": srgb(0.4),
          "3": srgb(0.6),
          "4": srgb(0.7),
        },
      },
    }
    const issues = lint(doc, { rampPaths })
    expect(issues.map(i => i.path.join("."))).toEqual(["color.neutral.2"])
  })

  it("is silent for a plateau or an all-equal ramp", () => {
    const plateau = {
      color: { neutral: { "1": srgb(0.1), "2": srgb(0.1), "3": srgb(0.5) } },
    }
    const flat = { color: { neutral: { "1": srgb(0.4), "2": srgb(0.4) } } }
    expect(lint(plateau, { rampPaths })).toEqual([])
    expect(lint(flat, { rampPaths })).toEqual([])
  })

  it("skips a non-numeric leaf, a non-color token and an unconvertible value", () => {
    const doc = {
      color: {
        neutral: {
          "1": srgb(0.1),
          base: srgb(0.9),
          "2": { $type: "number", $value: 0 },
          "3": color("no-such-space", [0.95, 0.95, 0.95]),
          "4": srgb(0.5),
        },
      },
    }
    expect(lint(doc, { rampPaths })).toEqual([])
  })

  it("reads lightness in the token's own color space (oklch)", () => {
    // oklch is [L, C, H]: read as RGB, the hue would decide the order.
    const step = (l: number, h: number) => color("oklch", [l, 0.1, h])
    const monotonic = {
      color: {
        blue: {
          ramp: {
            "1": step(0.3, 300),
            "2": step(0.5, 10),
            "3": step(0.7, 200),
          },
        },
      },
    }
    const reversed = {
      color: {
        blue: {
          ramp: {
            "1": step(0.3, 10),
            "2": step(0.5, 300),
            "3": step(0.4, 20),
            "4": step(0.7, 30),
          },
        },
      },
    }
    expect(lint(monotonic, { rampPaths })).toEqual([])
    expect(lint(reversed, { rampPaths }).map(i => i.path.join("."))).toEqual([
      "color.blue.ramp.3",
    ])
  })

  it("follows an alias to its color", () => {
    const doc = {
      base: { "1": srgb(0.1), "2": srgb(0.9) },
      color: {
        neutral: {
          "1": { $value: "{base.1}" },
          "2": srgb(0.5),
          "3": { $value: "{base.2}" },
          "4": srgb(0.3),
        },
      },
    }
    expect(codes(lint(doc, { rampPaths }))).toEqual([
      "token-atlas/ramp-not-monotonic",
    ])
  })
})

describe("lint — token-atlas/name-case", () => {
  it("flags a name outside the configured case, on that name only", () => {
    const doc = {
      color: {
        brandPrimary: srgb(0.1),
        "brand-primary": srgb(0.2),
        "Bad-Group": { ok: srgb(0.3) },
      },
    }
    const issues = lint(doc, { naming: { case: "camelCase" } })
    expect(issues.map(i => i.path.join("."))).toEqual([
      "color.brand-primary",
      "color.Bad-Group",
    ])
    expect(codes(issues)).toEqual([
      "token-atlas/name-case",
      "token-atlas/name-case",
    ])
  })

  it("checks each supported case", () => {
    const cases: Record<string, [string, string]> = {
      "kebab-case": ["brand-primary", "brand_primary"],
      camelCase: ["brandPrimary", "BrandPrimary"],
      snake_case: ["brand_primary", "brand-primary"],
      PascalCase: ["BrandPrimary", "brandPrimary"],
    }
    for (const [c, [good, bad]] of Object.entries(cases)) {
      const issues = lint(
        { [good]: n(1), [bad]: n(2) },
        { naming: { case: c } },
      )
      expect(
        issues.map(i => i.path.join(".")),
        c,
      ).toEqual([bad])
    }
  })

  it("lets a camelCase name start with a digit, as t-shirt steps do", () => {
    const issues = lint(
      { space: { "2xl": n(1), "2Xl": n(2) } },
      { naming: { case: "camelCase" } },
    )
    expect(issues).toEqual([])
  })

  it("lets a PascalCase name start with a digit too", () => {
    const issues = lint(
      { Space: { "2xl": n(1), "2Xl": n(2) } },
      { naming: { case: "PascalCase" } },
    )
    expect(issues).toEqual([])
  })

  it("checks each part of a mode-scoped name on its own", () => {
    const doc = { "system/dark": { a: n(1) }, "system/Dark": { b: n(2) } }
    const issues = lint(doc, { naming: { case: "camelCase" } })
    expect(issues.map(i => i.path.join("."))).toEqual(["system/Dark"])
  })

  it("never flags a numeric segment or a vocabulary value", () => {
    const doc = {
      space: { "0": n(0), "05": n(1), "50": n(2) },
      size: { "2XL": n(3) },
    }
    const config = {
      naming: { case: "PascalCase" },
      vocabularies: [{ paths: ["size"], values: ["2XL"] }],
    }
    expect(lint(doc, config).map(i => i.path.join("."))).toEqual([
      "space",
      "size",
    ])
  })
})

describe("lint — token-atlas/contrast-insufficient", () => {
  // sRGB 0.6 gray on white is 2.84:1; black on white is 21:1.
  const pair = (target?: unknown) => ({
    contrastPairs: [
      {
        foreground: "color.text.default",
        background: "color.surface.default",
        ...(target === undefined ? {} : { target }),
      },
    ],
  })
  const doc = (text: number) => ({
    color: { text: { default: srgb(text) }, surface: { default: srgb(1) } },
  })

  it("flags a pair below AA on the foreground, naming ratio, target and background", () => {
    const issues = lint(doc(0.6), pair("AA"))
    expect(codes(issues)).toEqual(["token-atlas/contrast-insufficient"])
    expect(issues[0].path).toEqual(["color", "text", "default"])
    expect(issues[0].severity).toBe("warning")
    expect(issues[0].message).toContain("2.84:1")
    expect(issues[0].message).toContain("WCAG AA (4.5:1)")
    expect(issues[0].message).toContain('"color.surface.default"')
  })

  it("passes a pair that meets its target, and defaults the target to AA", () => {
    expect(lint(doc(0), pair("AAA"))).toEqual([])
    expect(codes(lint(doc(0.6), pair()))).toEqual([
      "token-atlas/contrast-insufficient",
    ])
    expect(lint(doc(0.6), pair("AA-large")).map(i => i.message)).toEqual([
      expect.stringContaining("WCAG AA large text (3:1)"),
    ])
  })

  it("takes a numeric target", () => {
    expect(lint(doc(0.6), pair(2.5))).toEqual([])
    expect(lint(doc(0.6), pair(3))[0].message).toContain("the target 3:1")
  })

  it("judges resolved values: an aliased foreground and a background in another file", () => {
    const external = indexTokens(
      parseTokens(
        JSON.stringify({
          color: {
            surface: { default: { $type: "color", $value: "{base.white}" } },
          },
          base: { white: srgb(1) },
        }),
      ),
    )
    const issues = lint(
      {
        base: { gray: srgb(0.6) },
        color: { text: { default: { $type: "color", $value: "{base.gray}" } } },
      },
      pair("AA"),
      external,
    )
    expect(codes(issues)).toEqual(["token-atlas/contrast-insufficient"])
    expect(issues[0].path).toEqual(["color", "text", "default"])
  })

  it("is silent where the foreground is defined elsewhere", () => {
    const external = indexTokens(parseTokens(JSON.stringify(doc(0.6))))
    expect(
      lint({ color: { surface: { default: srgb(1) } } }, pair("AA"), external),
    ).toEqual([])
  })

  it("reports a foreground no file defines on the background, as a missing background is reported on the foreground", () => {
    const issues = lint(doc(0.6), {
      contrastPairs: [
        {
          foreground: "color.txt.default",
          background: "color.surface.default",
        },
      ],
    })
    expect(codes(issues)).toEqual(["token-atlas/contrast-insufficient"])
    expect(issues[0].path).toEqual(["color", "surface", "default"])
    expect(issues[0].message).toBe(
      'Contrast of "color.txt.default" on "color.surface.default" could not be checked: "color.txt.default" does not resolve to a color.',
    )
  })

  it("judges a translucent foreground by what shows through it", () => {
    // Black at 10% over white is #e6e6e6: 1.25:1, far below AA.
    const faint = {
      $type: "color",
      $value: { colorSpace: "srgb", components: [0, 0, 0], alpha: 0.1 },
    }
    const issues = lint(
      { color: { text: { default: faint }, surface: { default: srgb(1) } } },
      pair("AA"),
    )
    expect(codes(issues)).toEqual(["token-atlas/contrast-insufficient"])
    expect(issues[0].message).toContain("1.25:1")
  })

  it("says so, once, when a side does not resolve to a color", () => {
    const issues = lint({ color: { text: { default: srgb(0.6) } } }, pair("AA"))
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toMatch(/could not be checked/)
    expect(issues[0].message).toContain('"color.surface.default"')
  })

  it("says contrast could not be computed, blaming neither side, when both resolve", () => {
    contrast.fails = true
    try {
      const issues = lint(doc(0.6), pair("AA"))
      expect(issues).toHaveLength(1)
      expect(issues[0].message).toMatch(/could not be computed/)
      expect(issues[0].message).not.toMatch(/does not resolve/)
    } finally {
      contrast.fails = false
    }
  })

  describe("in a Tokens Studio file, only the sets the active theme enables", () => {
    // Two sets, as Tokens Studio writes them: top-level groups the theme turns on or off.
    const sets = {
      light: { text: srgb(0.6), surface: srgb(1) },
      dark: { text: srgb(0.6), surface: srgb(1) },
    }
    const onlyLight = (key: string) => key.split(".")[0] === "light"
    const setPair = (foreground: string, background: string) => ({
      contrastPairs: [{ foreground, background, target: "AA" }],
    })

    it("raises nothing from a foreground in a disabled set", () => {
      expect(
        lint(sets, setPair("dark.text", "dark.surface"), undefined, onlyLight),
      ).toEqual([])
    })

    it("still judges the same pair in an enabled set", () => {
      const issues = lint(
        sets,
        setPair("light.text", "light.surface"),
        undefined,
        onlyLight,
      )
      expect(codes(issues)).toEqual(["token-atlas/contrast-insufficient"])
      expect(issues[0].message).toContain("2.84:1")
    })

    it("resolves nothing against a disabled set: the workspace answers for its key", () => {
      // The workspace's `dark.surface` is black, so the 0.6 gray passes at 7.37:1;
      // judged against this file's disabled white it would fail at 2.84:1.
      const external = indexTokens(
        parseTokens(JSON.stringify({ dark: { surface: srgb(0) } })),
      )
      expect(
        lint(sets, setPair("light.text", "dark.surface"), external, onlyLight),
      ).toEqual([])
    })

    it("reports a side only a disabled set defines as not resolving", () => {
      const issues = lint(
        sets,
        setPair("light.text", "dark.surface"),
        undefined,
        onlyLight,
      )
      expect(issues).toHaveLength(1)
      expect(issues[0].message).toContain(
        '"dark.surface" does not resolve to a color',
      )
    })
  })

  it("follows its severity", () => {
    const config = {
      ...pair("AA"),
      rules: { "token-atlas/contrast-insufficient": "error" },
    }
    expect(lint(doc(0.6), config)[0].severity).toBe("error")
    config.rules["token-atlas/contrast-insufficient"] = "off"
    expect(lint(doc(0.6), config)).toEqual([])
  })
})

describe("lint — severity", () => {
  const doc = { a: { x: { $type: "number", $value: "{b.y}" } } }

  it("maps error to an error and off to nothing", () => {
    const errorIssues = lint(doc, {
      tiers: ["a", "b"],
      rules: { "token-atlas/tier-alias-inverted": "error" },
    })
    expect(errorIssues[0].severity).toBe("error")
    expect(
      lint(doc, {
        tiers: ["a", "b"],
        rules: { "token-atlas/tier-alias-inverted": "off" },
      }),
    ).toEqual([])
  })
})

function n(value: number) {
  return { $type: "number", $value: value }
}
function d(value: number) {
  return { $type: "dimension", $value: { value, unit: "px" } }
}
