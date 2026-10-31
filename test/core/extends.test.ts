/**
 * Group `$extends`, DTCG Format Module 2025.10 §6.4. Each case is one of the
 * spec's own examples, cited by number.
 */
import { describe, it, expect } from "vitest"
import { parseTokens } from "../../src/core/parse"
import { indexTokens, resolveAliases } from "../../src/core/resolve"
import { validate } from "../../src/core/validate"
import {
  computeReferenceRenameEdits,
  computeRenameEdits,
} from "../../src/core/serialize"
import { applyEdits } from "jsonc-parser"
import type { TokenNode } from "../../src/core/types"

const color = (hex: string) => ({
  colorSpace: "srgb",
  components: [0, 0, 0],
  hex,
})

function resolve(doc: unknown, external?: Map<string, TokenNode>) {
  const model = parseTokens(JSON.stringify(doc))
  const index = resolveAliases(model, external)
  return { model, index, issues: validate(model, external).issues }
}

describe("$extends (§6.4)", () => {
  // Example 13
  const button = {
    button: {
      $type: "color",
      background: { $value: color("#0066cc") },
      text: { $value: color("#ffffff") },
    },
    "button-primary": {
      $extends: "{button}",
      background: { $value: color("#cc0066") },
    },
  }

  it("inherits the target's tokens and lets a local one override (Example 13)", () => {
    const { index, issues } = resolve(button)
    const text = index.get("button-primary.text")!
    expect(text.resolvedValue).toMatchObject({ hex: "#ffffff" })
    expect(text.type).toBe("color")
    expect(text.inheritedFrom).toBe("button.text")
    const bg = index.get("button-primary.background")!
    expect(bg.inheritedFrom).toBeUndefined()
    expect(bg.resolvedValue).toMatchObject({ hex: "#cc0066" })
    expect(issues).toEqual([])
  })

  it("treats a group-level $ref as the same thing (§6.4.1)", () => {
    const { index } = resolve({
      button: button.button,
      "button-primary": {
        $ref: "#/button",
        focus: { $value: color("#ff3399") },
      },
    })
    expect(index.get("button-primary.text")?.inheritedFrom).toBe("button.text")
    expect(index.get("button-primary.focus")?.resolvedValue).toMatchObject({
      hex: "#ff3399",
    })
  })

  it("accepts a JSON Pointer target (§6.4.5)", () => {
    const { index } = resolve({
      ...button,
      "button-primary": { $extends: "#/button" },
    })
    expect(index.get("button-primary.background")?.resolvedValue).toMatchObject(
      {
        hex: "#0066cc",
      },
    )
  })

  it("merges nested groups and replaces a token whole (Examples 14 and 25)", () => {
    const { index, issues } = resolve({
      input: {
        $type: "dimension",
        field: {
          width: { $value: { value: 100, unit: "rem" } },
          background: { $type: "color", $value: color("#ffffff") },
        },
      },
      "input-amount": {
        $extends: "{input}",
        field: { width: { $value: { value: 100, unit: "px" } } },
      },
    })
    expect(index.get("input-amount.field.width")!.resolvedValue).toEqual({
      value: 100,
      unit: "px",
    })
    // A typeless override keeps the type of the token it replaces (§6.7.3).
    expect(index.get("input-amount.field.width")!.type).toBe("dimension")
    expect(
      index.get("input-amount.field.background")!.resolvedValue,
    ).toMatchObject({
      hex: "#ffffff",
    })
    expect(issues).toEqual([])
  })

  it("gives a new typeless token the target group's $type (§6.7.3)", () => {
    const { index, issues } = resolve({
      input: {
        $type: "dimension",
        field: { width: { $value: { value: 100, unit: "rem" } } },
      },
      "input-amount": {
        $extends: "{input}",
        field: { height: { $value: { value: 40, unit: "px" } } },
      },
      button: { $type: "color", bg: { $value: color("#0066cc") } },
      primary: { $extends: "{button}", hover: { $value: color("#0055aa") } },
      // a chain: the middle group declares no $type, its own target does
      secondary: { $extends: "{primary}", focus: { $value: color("#0044bb") } },
    })
    expect(index.get("input-amount.field.height")!.type).toBe("dimension")
    expect(index.get("primary.hover")!.type).toBe("color")
    expect(index.get("secondary.focus")!.type).toBe("color")
    expect(issues).toEqual([])
  })

  it("adds new tokens beside inherited ones, which aliases can reach (Example 15)", () => {
    const { index } = resolve({
      base: {
        color: { $type: "color", $value: color("#0033cc") },
        spacing: { $type: "dimension", $value: { value: 16, unit: "px" } },
      },
      extended: {
        $extends: "{base}",
        color: { $type: "color", $value: color("#e60d00") },
        border: {
          $type: "border",
          $value: {
            width: { value: 1, unit: "px" },
            style: "solid",
            color: "{extended.color}",
          },
        },
      },
      use: { $value: "{extended.spacing}" },
    })
    expect(index.get("extended.spacing")!.resolvedValue).toEqual({
      value: 16,
      unit: "px",
    })
    expect(index.get("extended.border")!.resolvedValue).toMatchObject({
      color: { hex: "#e60d00" },
    })
    expect(index.get("use")!.resolvedValue).toEqual({ value: 16, unit: "px" })
  })

  it("lets siblings extend the same group (Example 18)", () => {
    const { index, issues } = resolve({
      button: {
        color: { $type: "color", $value: color("#00ffff") },
        border: {
          $type: "border",
          $value: {
            width: { value: 1, unit: "px" },
            style: "solid",
            color: "{button.color}",
          },
        },
      },
      "button-secondary": {
        $extends: "{button}",
        color: { $type: "color", $value: color("#666666") },
      },
      "button-large": {
        $extends: "{button}",
        padding: { $type: "dimension", $value: { value: 16, unit: "px" } },
      },
    })
    expect(index.get("button-secondary.border")).toBeDefined()
    expect(index.get("button-large.color")!.inheritedFrom).toBe("button.color")
    expect(issues).toEqual([])
  })

  it("follows a chain to its first origin", () => {
    const { index } = resolve({
      a: { x: { $type: "number", $value: 1 } },
      c: { $extends: "{b}" },
      b: { $extends: "{a}" },
    })
    expect(index.get("c.x")!.resolvedValue).toBe(1)
    expect(index.get("c.x")!.inheritedFrom).toBe("a.x")
  })

  it("extends a group defined in another file, local first", () => {
    const other = parseTokens(JSON.stringify(button))
    const external = indexTokens(other)
    const { index, issues } = resolve(
      { mine: { $extends: "{button}" } },
      external,
    )
    expect(index.get("mine.text")!.resolvedValue).toMatchObject({
      hex: "#ffffff",
    })
    expect(issues).toEqual([])
    // A group this document defines wins over the workspace's.
    const local = resolve(
      {
        button: { text: { $type: "number", $value: 7 } },
        mine: { $extends: "{button}" },
      },
      external,
    )
    expect(local.index.get("mine.text")!.resolvedValue).toBe(7)
    expect(local.index.has("mine.background")).toBe(false)
  })

  it("gives a new token the $type of a group in another file (§6.7.3)", () => {
    const external = indexTokens(
      parseTokens(
        JSON.stringify({
          button: {
            $type: "color",
            bg: { $value: color("#0066cc") },
            size: {
              $type: "dimension",
              pad: { $value: { value: 4, unit: "px" } },
            },
          },
        }),
      ),
    )
    const { index, issues } = resolve(
      {
        primary: {
          $extends: "{button}",
          hover: { $value: color("#0044bb") },
          size: { gap: { $value: { value: 8, unit: "px" } } },
          states: { focus: { $value: color("#0022aa") } },
        },
        // a local chain whose last link is in the other file
        secondary: {
          $extends: "{primary}",
          active: { $value: color("#001188") },
        },
      },
      external,
    )
    expect(index.get("primary.hover")!.type).toBe("color")
    expect(index.get("primary.size.gap")!.type).toBe("dimension")
    expect(index.get("primary.states.focus")!.type).toBe("color")
    expect(index.get("secondary.active")!.type).toBe("color")
    expect(issues).toEqual([])
  })

  it("reports a group extending its own parent as circular (Example 16)", () => {
    const { issues } = resolve({
      button: {
        color: { $type: "number", $value: 1 },
        secondary: { $extends: "{button}" },
      },
    })
    expect(issues).toEqual([
      expect.objectContaining({
        severity: "error",
        path: ["button", "secondary", "$extends"],
        message: expect.stringMatching(/^Circular \$extends/),
      }),
    ])
  })

  it("reports every group on a cycle (Examples 17 and 23)", () => {
    const { issues } = resolve({
      a: { $extends: "{b}" },
      b: { $extends: "{c}" },
      c: { $extends: "{a}" },
    })
    expect(issues.map(i => i.path.join("."))).toEqual([
      "a.$extends",
      "b.$extends",
      "c.$extends",
    ])
    expect(issues.every(i => /Circular/.test(i.message))).toBe(true)
  })

  it("reports a missing target, a token target and a malformed one (§6.4.6)", () => {
    const { issues } = resolve({
      t: { $type: "number", $value: 1 },
      missing: { $extends: "{nope}" },
      token: { $extends: "{t}" },
      bad: { $extends: "button" },
    })
    expect(issues.map(i => [i.path.join("."), i.message])).toEqual([
      ["missing.$extends", "Unresolved $extends: no group {nope}."],
      ["token.$extends", "$extends must name a group, but {t} is a token."],
      [
        "bad.$extends",
        'Invalid $extends: name a group, as "{group}" or "#/group".',
      ],
    ])
  })

  it("re-resolving the same model does not duplicate or keep stale copies", () => {
    const model = parseTokens(JSON.stringify(button))
    resolveAliases(model)
    resolveAliases(model)
    const primary = model.root.children.find(c => c.name === "button-primary")!
    expect(
      primary.kind === "group" && primary.children.map(c => c.name),
    ).toEqual(["background", "text"])
  })

  it("leaves inherited tokens out of a plain parse, so edits only see the text's keys", () => {
    expect(
      indexTokens(parseTokens(JSON.stringify(button))).has(
        "button-primary.text",
      ),
    ).toBe(false)
  })

  it("renames an extended group's $extends, in the file and in one that only uses it", () => {
    const text = JSON.stringify(button, null, 2)
    const renamed = applyEdits(
      text,
      computeRenameEdits(text, ["button"], "control"),
    )
    expect(JSON.parse(renamed)["button-primary"].$extends).toBe("{control}")
    const user = '{ "x": { "$extends": "#/button" } }'
    expect(
      applyEdits(user, computeReferenceRenameEdits(user, "button", "control")),
    ).toBe('{ "x": { "$extends": "#/control" } }')
  })
})

describe("core model fixes — a cached model re-resolved", () => {
  it("takes the type its $extends target has now, not the one it had last time", () => {
    const model = parseTokens(
      JSON.stringify({ theme: { $extends: "{base}", x: { $value: 4 } } }),
    )
    const base = (type: string) =>
      indexTokens(
        parseTokens(
          JSON.stringify({ base: { $type: type, x: { $value: 1 } } }),
        ),
      )
    expect(resolveAliases(model, base("number")).get("theme.x")!.type).toBe(
      "number",
    )
    expect(resolveAliases(model, base("fontWeight")).get("theme.x")!.type).toBe(
      "fontWeight",
    )
    const gone = resolveAliases(model, new Map()).get("theme.x")!
    expect(gone.type).toBeUndefined()
    expect(gone.typeIsInherited).toBe(false)
  })
})
