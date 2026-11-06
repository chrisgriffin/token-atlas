import { describe, it, expect } from "vitest"
import {
  cssVarUsages,
  tokenUsages,
  findTokenForIdentifier,
  isGeneratedCode,
  normalizeName,
  renameInIdentifier,
  scanIdentifiers,
  tokenMatcher,
} from "../../src/core/exportNames"

const KEYS = [
  "color.brand.primary",
  "space.md",
  "font.size.base",
  "type.heading",
]

describe("normalizeName", () => {
  it("keeps only letters and digits, lowercased", () => {
    expect(normalizeName("--Color-Brand_primary.1")).toBe("colorbrandprimary1")
  })
})

describe("findTokenForIdentifier — exported spellings", () => {
  it.each([
    ["--color-brand-primary", "CSS custom property"],
    ["$color-brand-primary", "Sass variable"],
    ["colorBrandPrimary", "camelCase JS"],
    ["ColorBrandPrimary", "PascalCase JS"],
    ["color_brand_primary", "snake_case"],
    ["COLOR_BRAND_PRIMARY", "SCREAMING_SNAKE"],
    ["tokens.color.brand.primary", "dotted JS access"],
    ["color.brand.primary", "quoted token path"],
  ])("matches %s (%s)", identifier => {
    expect(findTokenForIdentifier(identifier, KEYS)).toBe("color.brand.primary")
  })

  it("drops leading segments so an export prefix still matches", () => {
    expect(findTokenForIdentifier("--ds-color-brand-primary", KEYS)).toBe(
      "color.brand.primary",
    )
    expect(findTokenForIdentifier("dsColorBrandPrimary", KEYS)).toBe(
      "color.brand.primary",
    )
    expect(findTokenForIdentifier("DSColorBrandPrimary", KEYS)).toBe(
      "color.brand.primary",
    )
    expect(findTokenForIdentifier("$tokens-space-md", KEYS)).toBe("space.md")
    expect(findTokenForIdentifier("theme.tokens.fontSizeBase", KEYS)).toBe(
      "font.size.base",
    )
  })

  it("returns undefined for an identifier naming no token", () => {
    expect(
      findTokenForIdentifier("--color-brand-secondary", KEYS),
    ).toBeUndefined()
    expect(findTokenForIdentifier("display", KEYS)).toBeUndefined()
    expect(findTokenForIdentifier("", KEYS)).toBeUndefined()
  })

  it("prefers an exact match over a prefix-stripped one", () => {
    const keys = ["ds.color.primary", "color.primary"]
    expect(findTokenForIdentifier("--ds-color-primary", keys)).toBe(
      "ds.color.primary",
    )
  })
})

describe("tokenMatcher", () => {
  it("answers exactly as findTokenForIdentifier does", () => {
    const match = tokenMatcher(KEYS)
    for (const id of [
      "--color-brand-primary",
      "$tokens-space-md",
      "display",
      "",
    ]) {
      expect(match(id)).toBe(findTokenForIdentifier(id, KEYS))
    }
  })
})

describe("scanIdentifiers", () => {
  const css = [
    ":root {",
    "  --color-brand-primary: #fff;",
    "}",
    ".a { color: var(--color-brand-primary); margin: 16px; }",
  ].join("\n")

  it("finds every spelling with its line and character", () => {
    const hits = scanIdentifiers(css).get("--color-brand-primary")
    expect(hits?.map(h => [h.line, h.character, h.length])).toEqual([
      [1, 2, 21],
      [3, 16, 21],
    ])
  })

  it("marks where a name is defined rather than used", () => {
    const hits = scanIdentifiers(css).get("--color-brand-primary")!
    expect(hits.map(h => h.declaration)).toEqual([true, false])
    const js = scanIdentifiers(
      "export const colorBrandPrimary = 1;\nif (colorBrandPrimary == 1) f(colorBrandPrimary);",
    )
    expect(js.get("colorBrandPrimary")!.map(h => h.declaration)).toEqual([
      true,
      false,
      false,
    ])
    const sass = scanIdentifiers(
      "$space-md: 4px;\n.a { margin: $space-md; }\na::before {}",
    )
    expect(sass.get("$space-md")!.map(h => h.declaration)).toEqual([
      true,
      false,
    ])
    expect(sass.get("a")![0].declaration).toBe(false) // `::` is a pseudo-element
  })

  it("in a stylesheet, keeps only the names a variable can have: a bare word is a property or keyword", () => {
    const keys = ["border.width", "white"]
    const text =
      ".a { border-width: var(--border-width); color: white; b: $white; c: @white; }"
    const names = (languageId: string) =>
      [...scanIdentifiers(text, languageId).keys()].filter(n =>
        tokenMatcher(keys)(n),
      )
    expect(names("css")).toEqual(["--border-width"])
    expect(names("scss")).toEqual(["--border-width", "$white"])
    expect(names("sass")).toEqual(["--border-width", "$white"])
    expect(names("less")).toEqual(["--border-width", "white"])
    expect(
      scanIdentifiers(text, "less")
        .get("white")!
        .map(o => o.character),
    ).toEqual([text.indexOf("@white") + 1])
    expect(names("javascript")).toEqual([
      "border-width",
      "--border-width",
      "white",
      "$white",
    ])
    expect([
      ...scanIdentifiers("a { b: tokens.$white; }", "scss").keys(),
    ]).toEqual(["tokens.$white"])
  })

  it("skips numbers and keeps dotted paths whole", () => {
    const scan = scanIdentifiers("x = tokens.color.brand.primary + 16 - 0.5;")
    expect(scan.has("16")).toBe(false)
    expect(scan.has("0.5")).toBe(false)
    expect(scan.get("tokens.color.brand.primary")?.[0].character).toBe(4)
  })
})

describe("tokenUsages", () => {
  const colors: Record<string, string> = { "color.brand.primary": "#ff0000" }
  const colorOf = (key: string) => colors[key]

  it("finds each usage of a color token with its color, in CSS, Sass and JS", () => {
    const text = [
      ":root { --color-brand-primary: #f00; }",
      ".a { color: var(--color-brand-primary); margin: var(--space-md); }",
      ".b { color: $color-brand-primary; border: var(--not-a-token); }",
      "const c = tokens.color.brand.primary;",
    ].join("\n")
    expect(tokenUsages(text, KEYS, colorOf)).toEqual([
      { line: 1, character: 16, length: 21, value: "#ff0000" },
      { line: 2, character: 12, length: 20, value: "#ff0000" },
      { line: 3, character: 10, length: 26, value: "#ff0000" },
    ])
  })

  it("matches against every token, so a non-color token is not stolen by a shorter color one", () => {
    // `--ds-color-brand-primary` is the dimension `ds.color.brand.primary`, not the color.
    const keys = [...KEYS, "ds.color.brand.primary"]
    expect(
      tokenUsages("a { b: var(--ds-color-brand-primary); }", keys, colorOf),
    ).toEqual([])
  })

  it("skips a usage inside a /* */ or // comment", () => {
    const text = [
      "/* .a { color: var(--color-brand-primary); } */",
      "// const c = tokens.color.brand.primary;",
      ".b { color: $color-brand-primary; } // trailing",
    ].join("\n")
    expect(tokenUsages(text, KEYS, colorOf)).toEqual([
      { line: 2, character: 12, length: 20, value: "#ff0000" },
    ])
  })

  it("in plain CSS, finds a usage after a protocol-relative url(//…), as on a line with no URL", () => {
    const withUrl =
      "a { background: url(//cdn.example.com/a.png) var(--color-brand-primary); }"
    const plain =
      "a { background: none                         var(--color-brand-primary); }"
    expect(tokenUsages(withUrl, KEYS, colorOf, "css")).toEqual([
      { line: 0, character: 49, length: 21, value: "#ff0000" },
    ])
    expect(tokenUsages(withUrl, KEYS, colorOf, "css")).toEqual(
      tokenUsages(plain, KEYS, colorOf, "css"),
    )
  })

  it.each(["scss", "sass", "less"])(
    "in %s, finds a usage after a protocol-relative url(//…), as in plain CSS",
    languageId => {
      const withUrl =
        "a { background: url(//cdn.example.com/a.png) var(--color-brand-primary); }"
      expect(tokenUsages(withUrl, KEYS, colorOf, languageId)).toEqual(
        tokenUsages(withUrl, KEYS, colorOf, "css"),
      )
      expect(tokenUsages(withUrl, KEYS, colorOf, languageId)).toHaveLength(1)
    },
  )

  it.each(["scss", "sass", "less"])(
    "in %s, a // comment after a url(//…) still hides the token names after it",
    languageId => {
      const text =
        "a { b: url( //cdn.example.com/a.png); } // var(--color-brand-primary)"
      expect(tokenUsages(text, KEYS, colorOf, languageId)).toEqual([])
    },
  )

  it("in a stylesheet, gives no color to a property or keyword that spells a token", () => {
    const keys = ["white"]
    const text = ".a { color: white; background: var(--white); }"
    expect(tokenUsages(text, keys, () => "#ffffff", "css")).toEqual([
      { line: 0, character: 35, length: 7, value: "#ffffff" },
    ])
  })

  it.each(["scss", "less"])(
    'in %s, a quoted url("//…") is a string, so the line after it is still read',
    languageId => {
      const text =
        'a { background: url("//cdn.example.com/a.png") var(--color-brand-primary); }'
      expect(tokenUsages(text, KEYS, colorOf, languageId)).toEqual([
        { line: 0, character: 51, length: 21, value: "#ff0000" },
      ])
    },
  )

  it("in JavaScript, a url(// outside a string is still a comment", () => {
    const text = "url(//cdn.example.com/a.png) tokens.color.brand.primary"
    expect(tokenUsages(text, KEYS, colorOf, "javascript")).toEqual([])
  })

  it.each(["scss", "sass", "less", "javascript", "typescript"])(
    "in %s, a // line comment still hides every token name inside it",
    languageId => {
      const text = [
        "// a { color: var(--color-brand-primary); } $color-brand-primary tokens.color.brand.primary",
        "x { y: z; } // var(--color-brand-primary)",
      ].join("\n")
      expect(tokenUsages(text, KEYS, colorOf, languageId)).toEqual([])
    },
  )
})

describe("renameInIdentifier — the new spelling in the identifier's own convention", () => {
  const apply = (id: string, key: string, depth: number, newName: string) => {
    const r = renameInIdentifier(id, key, depth, newName)
    return r && id.slice(0, r.start) + r.text + id.slice(r.end)
  }

  it.each([
    [
      "--color-brand-primary",
      "mainAccent",
      "--color-brand-main-accent",
      "CSS custom property",
    ],
    [
      "--ds-color-brand-primary",
      "main",
      "--ds-color-brand-main",
      "prefixed CSS",
    ],
    ["$color-brand-primary", "main", "$color-brand-main", "Sass"],
    ["@color-brand-primary", "main", "@color-brand-main", "Less"],
    ["colorBrandPrimary", "main-accent", "colorBrandMainAccent", "camelCase"],
    ["ColorBrandPrimary", "main", "ColorBrandMain", "PascalCase"],
    ["color_brand_primary", "mainAccent", "color_brand_main_accent", "snake"],
    ["COLOR_BRAND_PRIMARY", "main", "COLOR_BRAND_MAIN", "upper snake"],
    [
      "tokens.color.brand.primary",
      "main",
      "tokens.color.brand.main",
      "dotted path",
    ],
    [
      "tokens.color.brand.primary",
      "main-accent",
      "tokens.color.brand.mainAccent",
      "dotted, not a JS name",
    ],
  ])("%s → %s gives %s (%s)", (id, newName, expected) => {
    expect(apply(id, "color.brand.primary", 2, newName)).toBe(expected)
  })

  it("rewrites a group segment in the middle and keeps the rest verbatim", () => {
    expect(
      apply("--color-brand-primary", "color.brand.primary", 1, "accent"),
    ).toBe("--color-accent-primary")
    expect(apply("tokens.color.blue500", "color.blue-500", 0, "colour")).toBe(
      "tokens.colour.blue500",
    )
    expect(apply("colorBlue500", "color.blue-500", 1, "blue-600")).toBe(
      "colorBlue600",
    )
  })

  it("returns only the span that changes", () => {
    expect(
      renameInIdentifier(
        "--ds-color-brand-primary",
        "color.brand.primary",
        2,
        "main",
      ),
    ).toEqual({ start: 17, end: 24, text: "main" })
  })

  it("finds the key behind a capitalized acronym prefix", () => {
    expect(apply("DSColorBrandPrimary", "color.brand.primary", 2, "main")).toBe(
      "DSColorBrandMain",
    )
  })

  it("is undefined for an identifier that does not end in the key", () => {
    expect(
      renameInIdentifier(
        "--color-brand-primary-hover",
        "color.brand.primary",
        2,
        "x",
      ),
    ).toBe(undefined)
  })
})

describe("isGeneratedCode", () => {
  it.each([
    "/**\n * Do not edit directly, this file was generated automatically.\n */\n:root {}",
    "// @generated by Terrazzo\nexport const a = 1;",
    "/* Auto-generated file */",
  ])("spots a generated-file notice: %s", text => {
    expect(isGeneratedCode(text)).toBe(true)
  })

  it("leaves hand-written code, and a notice far below the header, alone", () => {
    expect(
      isGeneratedCode(".card { color: var(--color-brand-primary); }"),
    ).toBe(false)
    expect(isGeneratedCode("x".repeat(600) + "/* generated by hand */")).toBe(
      false,
    )
  })
})

describe("cssVarUsages", () => {
  const usages = (text: string) =>
    cssVarUsages(text).map(u => [u.name, text.slice(u.start, u.end)])

  it("finds each var(--name), ending after its closing parenthesis", () => {
    const css =
      ".a { color: var(--color-brand-primary); margin: var( --space-md ); }"
    expect(usages(css)).toEqual([
      ["--color-brand-primary", "--color-brand-primary)"],
      ["--space-md", "--space-md )"],
    ])
  })

  it("ends after the whole fallback, nested parentheses included", () => {
    const css =
      "width: var(--space-md, calc(1px + var(--space-sm))) !important;"
    expect(usages(css)).toEqual([
      ["--space-md", "--space-md, calc(1px + var(--space-sm)))"],
      ["--space-sm", "--space-sm)"],
    ])
  })

  it("ends after the name when the parenthesis is never closed", () => {
    expect(usages("color: var(--color-brand-primary")).toEqual([
      ["--color-brand-primary", "--color-brand-primary"],
    ])
    expect(usages("a { color: var(--space-md; } b { c: (1) }")).toEqual([
      ["--space-md", "--space-md"],
    ])
  })

  it("ignores a definition and a bare custom property", () => {
    expect(
      usages(":root { --color-brand-primary: #fff; } a { x: --space-md; }"),
    ).toEqual([])
  })

  it("skips a var(--name) inside a /* */ comment, and a comment inside a fallback", () => {
    const css =
      "/* color: var(--color-brand-primary); */\na { margin: var(--space-md /* ) */, 1px); }\n/* var(--space-sm)"
    expect(usages(css)).toEqual([["--space-md", "--space-md /* ) */, 1px)"]])
  })

  it("skips a var(--name) after a // line comment, but not a URL's //", () => {
    const scss =
      "// color: var(--color-brand-primary);\na { b: url(https://x.test/a.png); margin: var(--space-md); }"
    expect(usages(scss)).toEqual([["--space-md", "--space-md)"]])
  })

  it.each(["css", "scss", "sass", "less"])(
    "in %s, finds a var(--name) after a protocol-relative url(//…)",
    languageId => {
      const css =
        "a { background: url(//cdn.example.com/a.png) var(--space-md); }"
      expect(cssVarUsages(css, languageId)).toEqual(cssVarUsages(css, "css"))
      expect(cssVarUsages(css, languageId).map(u => u.name)).toEqual([
        "--space-md",
      ])
    },
  )
})
