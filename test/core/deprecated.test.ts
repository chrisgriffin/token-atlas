import { describe, expect, it } from "vitest"
import {
  deprecatedReferences,
  indexTokens,
  parseTokens,
  resolveAliases,
  type TokenNode,
} from "../../src/core"

const color = { colorSpace: "srgb", components: [0, 0, 0] }
const refs = (
  doc: object,
  external?: Map<string, TokenNode>,
  scope?: (k: string) => boolean,
) => deprecatedReferences(parseTokens(JSON.stringify(doc)), external, scope)

describe("deprecatedReferences", () => {
  it("flags an alias to a deprecated token, with its reason, on the $value string", () => {
    expect(
      refs({
        color: {
          $type: "color",
          old: { $value: color, $deprecated: "use color.new" },
          flag: { $value: color, $deprecated: true },
          a: { $value: "{color.old}" },
          b: { $value: "{color.flag}" },
          new: { $value: color },
          c: { $value: "{color.new}" },
        },
      }),
    ).toEqual([
      {
        path: ["color", "a", "$value"],
        reference: "color.old",
        message: "{color.old} is deprecated: use color.new",
      },
      {
        path: ["color", "b", "$value"],
        reference: "color.flag",
        message: "{color.flag} is deprecated.",
      },
    ])
  })

  it("inherits a group's deprecation, unless the token says false", () => {
    const found = refs({
      legacy: {
        $deprecated: "the legacy palette is going away",
        $type: "color",
        red: { $value: color },
        kept: { $value: color, $deprecated: false },
        inner: { blue: { $value: color } },
      },
      use: {
        $type: "color",
        red: { $value: "{legacy.red}" },
        kept: { $value: "{legacy.kept}" },
        blue: { $value: "{legacy.inner.blue}" },
      },
    })
    expect(found.map(f => [f.reference, f.message])).toEqual([
      [
        "legacy.red",
        "{legacy.red} is deprecated: the legacy palette is going away",
      ],
      [
        "legacy.inner.blue",
        "{legacy.inner.blue} is deprecated: the legacy palette is going away",
      ],
    ])
  })

  it("flags only the direct hop of an alias chain", () => {
    const found = refs({
      $type: "color",
      old: { $value: color, $deprecated: true },
      mid: { $value: "{old}" },
      top: { $value: "{mid}" },
    })
    expect(found.map(f => f.path)).toEqual([["mid", "$value"]])
  })

  it("flags a reference nested in a composite value, at its sub-path", () => {
    const found = refs({
      old: { $type: "color", $value: color, $deprecated: true },
      shadow: {
        $type: "shadow",
        $value: [{ color: "{old}", offsetX: { value: 0, unit: "px" } }],
      },
    })
    expect(found.map(f => f.path)).toEqual([["shadow", "$value", 0, "color"]])
  })

  it("flags a $ref pointer to a deprecated token like a {reference} to it", () => {
    const found = refs({
      color: {
        $type: "color",
        old: { $value: color, $deprecated: "use color.new" },
        new: { $value: color },
        a: { $ref: "#/color/old" },
        b: { $value: { $ref: "#/color/old/$value" } },
        c: { $ref: "#/color/new" },
        d: { $value: { $ref: "#/color/new/$value" } },
      },
      shadow: {
        $type: "shadow",
        $value: [
          {
            color: { $ref: "#/color/old/$value" },
            offsetX: { value: 0, unit: "px" },
          },
        ],
      },
    })
    expect(found).toEqual([
      {
        path: ["color", "a", "$ref"],
        reference: "color.old",
        message: "{color.old} is deprecated: use color.new",
      },
      {
        path: ["color", "b", "$value", "$ref"],
        reference: "color.old",
        message: "{color.old} is deprecated: use color.new",
      },
      {
        path: ["shadow", "$value", 0, "color", "$ref"],
        reference: "color.old",
        message: "{color.old} is deprecated: use color.new",
      },
    ])
  })

  it("looks in the document first, then the external index", () => {
    const external = indexTokens(
      parseTokens(
        JSON.stringify({
          $type: "color",
          shared: { $value: color, $deprecated: true },
          remote: { $value: color, $deprecated: "gone" },
        }),
      ),
    )
    const doc = {
      $type: "color",
      shared: { $value: color },
      a: { $value: "{shared}" },
      b: { $value: "{remote}" },
    }
    expect(refs(doc, external).map(f => f.reference)).toEqual(["remote"])
    // A local key the active set turns off defines nothing, so the external one counts.
    expect(
      refs(doc, external, k => k !== "shared").map(f => f.reference),
    ).toEqual(["shared", "remote"])
  })

  it("reports a use once, on the group that wrote it, not on a copy $extends made", () => {
    const model = parseTokens(
      JSON.stringify({
        $type: "color",
        old: { $value: color, $deprecated: true },
        base: { a: { $value: "{old}" } },
        variant: { $extends: "{base}" },
      }),
    )
    resolveAliases(model) // expands `variant.a` into the model, as diagnostics does
    expect(deprecatedReferences(model).map(f => f.path)).toEqual([
      ["base", "a", "$value"],
    ])
  })
})
