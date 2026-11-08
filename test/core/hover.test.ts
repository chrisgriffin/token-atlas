import { describe, it, expect } from "vitest"
import { hoverMarkdown, escapeHover } from "../../src/core/hover"

const base = { rootPx: 16, isAlias: false as const }

describe("hoverMarkdown", () => {
  it("color: header pill, swatch image, format table, contrast line", () => {
    const md = hoverMarkdown({
      ...base,
      name: "primary",
      path: ["color", "brand", "primary"],
      type: "color",
      value: { colorSpace: "srgb", components: [0.231, 0.51, 0.965] },
    })
    expect(md).toContain("**primary**")
    expect(md).toMatch(
      /background-color:var\(--vscode-badge-background\);border-radius:4px;">&nbsp;color&nbsp;/,
    )
    expect(md).toContain("color.brand.primary")
    expect(md).toContain("data:image/svg+xml;base64,")
    expect(md).toContain("<code>#3b82f6</code>")
    expect(md).toContain("OKLCH")
    expect(md).not.toContain("HWB")
    expect(md).toMatch(/WCAG AA \(4\.5:1\)[\s\S]*[\d.]+:1 on white/)
  })

  it("alias: chain hops with file labels, then the resolved value", () => {
    const md = hoverMarkdown({
      ...base,
      isAlias: true,
      name: "text",
      path: ["color", "text"],
      type: "color",
      value: "{color.base.ink}",
      chain: [
        {
          key: "color.base.ink",
          label: "primitives.tokens.json",
          resolved: true,
        },
      ],
      final: "#0f172a",
    })
    expect(md).toContain("$(arrow-right) <code>color.base.ink</code>")
    expect(md).toContain("primitives.tokens.json")
    expect(md).toContain("<code>#0f172a</code>")
  })

  it("unresolved alias: warns and shows no value section", () => {
    const md = hoverMarkdown({
      ...base,
      isAlias: true,
      name: "dangling",
      path: ["broken", "dangling"],
      type: "number",
      value: "{nope}",
      chain: [{ key: "nope", resolved: false }],
    })
    expect(md).toContain("not found")
    expect(md).toContain("Unresolved")
    expect(md).not.toContain("```json")
  })

  it("dimension: px/rem/pt with the root note", () => {
    const md = hoverMarkdown({
      ...base,
      name: "md",
      path: ["space", "md"],
      type: "dimension",
      value: { value: 1, unit: "rem" },
    })
    expect(md).toContain("<code>16px</code>")
    expect(md).toContain("<code>1rem</code>")
    expect(md).toContain("rem at 16px root")
  })

  it("shadow: one row per layer with chip and CSS, ref noted", () => {
    const md = hoverMarkdown({
      ...base,
      name: "card",
      path: ["shadow", "card"],
      type: "shadow",
      value: [
        {
          color: "{color.ink}",
          offsetX: { value: 0, unit: "px" },
          offsetY: { value: 1, unit: "px" },
          blur: { value: 2, unit: "px" },
          spread: { value: 0, unit: "px" },
        },
        {
          color: "#0f172a1a",
          offsetX: { value: 0, unit: "px" },
          offsetY: { value: 4, unit: "px" },
          blur: { value: 12, unit: "px" },
          spread: { value: -2, unit: "px" },
        },
      ],
      resolvedComposite: [
        {
          color: "#000000",
          offsetX: { value: 0, unit: "px" },
          offsetY: { value: 1, unit: "px" },
          blur: { value: 2, unit: "px" },
          spread: { value: 0, unit: "px" },
        },
        {
          color: "#0f172a1a",
          offsetX: { value: 0, unit: "px" },
          offsetY: { value: 4, unit: "px" },
          blur: { value: 12, unit: "px" },
          spread: { value: -2, unit: "px" },
        },
      ],
    })
    expect(md).not.toContain("```")
    expect(md).toContain("Layer 1")
    expect(md).toContain("<code>0px 1px 2px 0px #000000</code>")
    expect(md).toContain("{color.ink}")
    expect(md).toContain("background-color:#0f172a1a;border-radius:3px;")
  })

  it("typography: a row per field, references shown as ref → value", () => {
    const md = hoverMarkdown({
      ...base,
      name: "heading",
      path: ["type", "heading"],
      type: "typography",
      value: {
        fontFamily: "{font.body}",
        fontSize: { value: 2, unit: "rem" },
        fontWeight: 700,
      },
      resolvedComposite: {
        fontFamily: "Inter",
        fontSize: { value: 2, unit: "rem" },
        fontWeight: 700,
      },
    })
    expect(md).toContain("<code>{font.body}</code> → <code>Inter</code>")
    expect(md).toContain("<code>2rem</code>")
    expect(md).toContain("<code>700</code>")
  })

  it("primitive object values collapse to one line", () => {
    const md = hoverMarkdown({
      ...base,
      name: "ease",
      path: ["ease"],
      type: "cubicBezier",
      value: [0.4, 0, 0.2, 1],
    })
    expect(md).toContain("<code>cubic-bezier(0.4, 0, 0.2, 1)</code>")
    expect(md).not.toContain("<table>")
  })

  it("deprecated reason, description, and defined-in link", () => {
    const md = hoverMarkdown({
      ...base,
      name: "old",
      path: ["old"],
      type: "number",
      value: 1,
      deprecated: "use new.one",
      description: "Legacy *value*",
      definedIn: { label: "a/b.tokens.json", href: "file:///a/b.tokens.json" },
    })
    expect(md).toContain("deprecated")
    expect(md).toContain("$(warning)")
    expect(md).toContain("use new.one")
    expect(md).toContain("Legacy \\*value\\*")
    expect(md).toContain("[a/b.tokens.json](file:///a/b.tokens.json)")
  })
})

describe("escapeHover", () => {
  it("neutralises markdown, HTML, and theme-icon syntax in user text", () => {
    expect(escapeHover("a_b <i> $(x)")).toBe("a\\_b &lt;i&gt; \\$(x)")
  })
})
