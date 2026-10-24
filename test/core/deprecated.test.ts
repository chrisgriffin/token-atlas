import { describe, expect, it } from "vitest";
import {
  computeDeprecateEdits,
  computeRetargetEdits,
  deprecatedReferences,
  deprecatedValue,
  deprecationReplacement,
  indexTokens,
  parseTokens,
  replacementKey,
  resolveAliases,
  retargetIdentifier,
  setTokenProperty,
  validate,
  type Edit,
  type TokenNode,
} from "../../src/core";
import { applyEdits } from "jsonc-parser";

const color = { colorSpace: "srgb", components: [0, 0, 0] };
const refs = (doc: object, external?: Map<string, TokenNode>, scope?: (k: string) => boolean) =>
  deprecatedReferences(parseTokens(JSON.stringify(doc)), external, scope);

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
    ]);
  });

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
    });
    expect(found.map((f) => [f.reference, f.message])).toEqual([
      ["legacy.red", "{legacy.red} is deprecated: the legacy palette is going away"],
      ["legacy.inner.blue", "{legacy.inner.blue} is deprecated: the legacy palette is going away"],
    ]);
  });

  it("flags only the direct hop of an alias chain", () => {
    const found = refs({
      $type: "color",
      old: { $value: color, $deprecated: true },
      mid: { $value: "{old}" },
      top: { $value: "{mid}" },
    });
    expect(found.map((f) => f.path)).toEqual([["mid", "$value"]]);
  });

  it("flags a reference nested in a composite value, at its sub-path", () => {
    const found = refs({
      old: { $type: "color", $value: color, $deprecated: true },
      shadow: {
        $type: "shadow",
        $value: [{ color: "{old}", offsetX: { value: 0, unit: "px" } }],
      },
    });
    expect(found.map((f) => f.path)).toEqual([["shadow", "$value", 0, "color"]]);
  });

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
        $value: [{ color: { $ref: "#/color/old/$value" }, offsetX: { value: 0, unit: "px" } }],
      },
    });
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
    ]);
  });

  it("looks in the document first, then the external index", () => {
    const external = indexTokens(
      parseTokens(
        JSON.stringify({
          $type: "color",
          shared: { $value: color, $deprecated: true },
          remote: { $value: color, $deprecated: "gone" },
        }),
      ),
    );
    const doc = {
      $type: "color",
      shared: { $value: color },
      a: { $value: "{shared}" },
      b: { $value: "{remote}" },
    };
    expect(refs(doc, external).map((f) => f.reference)).toEqual(["remote"]);
    // A local key the active set turns off defines nothing, so the external one counts.
    expect(refs(doc, external, (k) => k !== "shared").map((f) => f.reference)).toEqual([
      "shared",
      "remote",
    ]);
  });

  it("reports a use once, on the group that wrote it, not on a copy $extends made", () => {
    const model = parseTokens(
      JSON.stringify({
        $type: "color",
        old: { $value: color, $deprecated: true },
        base: { a: { $value: "{old}" } },
        variant: { $extends: "{base}" },
      }),
    );
    resolveAliases(model); // expands `variant.a` into the model, as diagnostics does
    expect(deprecatedReferences(model).map((f) => f.path)).toEqual([["base", "a", "$value"]]);
  });
});

describe("deprecation replacement", () => {
  const lookupIn = (doc: object, external?: Map<string, TokenNode>) => {
    const local = indexTokens(parseTokens(JSON.stringify(doc)));
    return {
      local,
      lookup: (key: string) => local.get(key) ?? external?.get(key),
    };
  };

  it("reads the replacement from the first {reference} in the reason", () => {
    expect(replacementKey("use {color.border.default} instead, not {color.x}")).toBe(
      "color.border.default",
    );
    const { local, lookup } = lookupIn({
      $type: "color",
      old: { $value: color, $deprecated: "use {new} instead" },
      new: { $value: color },
    });
    const found = deprecationReplacement(local.get("old")!, lookup);
    expect(found?.key).toBe("new");
    expect(found?.token?.path).toEqual(["new"]);
  });

  it("names no replacement for a reason without a reference, or true", () => {
    expect(replacementKey("use color.new")).toBeUndefined();
    expect(replacementKey(true)).toBeUndefined();
    const { local, lookup } = lookupIn({
      $type: "color",
      a: { $value: color, $deprecated: "going away" },
      b: { $value: color, $deprecated: true },
      c: { $value: color, $deprecated: "use {c}" },
      d: { $value: color },
    });
    for (const k of ["a", "b", "c", "d"]) {
      expect(deprecationReplacement(local.get(k)!, lookup)).toBeUndefined();
    }
  });

  it("keeps a replacement that does not resolve, and validate reports it by name", () => {
    const doc = {
      $type: "color",
      old: { $value: color, $deprecated: "use {gone} instead" },
      legacy: { $deprecated: "use {also.gone}", red: { $value: color } },
    };
    const { local, lookup } = lookupIn(doc);
    expect(deprecationReplacement(local.get("old")!, lookup)).toEqual({
      key: "gone",
      token: undefined,
    });
    const issues = validate(parseTokens(JSON.stringify(doc))).issues;
    expect(issues).toEqual([
      {
        severity: "warning",
        path: ["old", "$deprecated"],
        message: '"old" is deprecated in favour of {gone}, which does not resolve.',
      },
      {
        severity: "warning",
        path: ["legacy", "$deprecated"],
        message: '"legacy" is deprecated in favour of {also.gone}, which does not resolve.',
      },
    ]);
    // A use of `old` is still a deprecated use, but has no replacement to move to.
    const uses = refs({ ...doc, use: { $value: "{old}" } });
    expect(uses.map((u) => [u.reference, u.replacement])).toEqual([["old", undefined]]);
  });

  it("finds a replacement in another file, document first", () => {
    const external = indexTokens(
      parseTokens(JSON.stringify({ $type: "color", new: { $value: color } })),
    );
    const doc = {
      $type: "color",
      old: { $value: color, $deprecated: "use {new}" },
      use: { $value: "{old}" },
    };
    const model = parseTokens(JSON.stringify(doc));
    resolveAliases(model, external); // as diagnostics does before validating
    expect(validate(model, external).issues).toEqual([]);
    expect(refs(doc, external)).toEqual([
      {
        path: ["use", "$value"],
        reference: "old",
        message: "{old} is deprecated: use {new}",
        replacement: "new",
      },
    ]);
    expect(refs(doc).map((r) => r.replacement)).toEqual([undefined]);
  });

  it("reads a replacement from a group-inherited deprecation", () => {
    const found = refs({
      legacy: { $deprecated: "use {current.red}", $type: "color", red: { $value: color } },
      current: { $type: "color", red: { $value: color } },
      use: { $type: "color", a: { $value: "{legacy.red}" } },
    });
    expect(found.map((f) => [f.reference, f.replacement])).toEqual([["legacy.red", "current.red"]]);
  });
});

describe("writing a deprecation with a replacement", () => {
  const text = `// palette
{
  "color": {
    "$type":   "color",
    "subtle": {"$value": {"colorSpace": "srgb", "components": [0, 0, 0]}},
    "border": {
        "$value": { "colorSpace": "srgb", "components": [1, 1, 1] }, /* keep */
        "$description": "Outline"
    }
  }
}
`;
  const apply = (edits: Edit[]) => applyEdits(text, edits);
  /** Lines of `after` that are not in `text`, and the count of `text`'s lines gone. */
  const changed = (after: string) => {
    const before = text.split("\n");
    const lines = after.split("\n");
    return {
      added: lines.filter((l) => !before.includes(l)),
      removed: before.filter((l) => !lines.includes(l)).length,
    };
  };

  it("builds the reason with the replacement as its first reference", () => {
    expect(deprecatedValue("", "color.default")).toBe("use {color.default} instead");
    expect(deprecatedValue("too faint.", "color.default")).toBe(
      "too faint; use {color.default} instead",
    );
    // The first reference is the replacement, so picking another swaps it.
    expect(deprecatedValue("prefer {color.x}, see {docs.y}", "color.default")).toBe(
      "prefer {color.default}, see {docs.y}",
    );
    expect(deprecatedValue("prefer {color.default}", "color.default")).toBe(
      "prefer {color.default}",
    );
    expect(deprecatedValue("prefer {color.x}")).toBe("prefer {color.x}");
    // "" takes the replacement out again.
    expect(deprecatedValue("too faint; use {color.default} instead", "")).toBe("too faint");
    expect(deprecatedValue("use {color.default} instead", "")).toBe(true);
    expect(deprecatedValue("prefer {color.x}", "")).toBe("prefer color.x");
    expect(deprecatedValue("  ")).toBe(true);
    expect(deprecatedValue("going away")).toBe("going away");
  });

  it("changes the file by the $deprecated line alone, with comments and odd spacing", () => {
    const after = apply(computeDeprecateEdits(text, ["color", "border"], "", "color.subtle"));
    expect(changed(after)).toEqual({
      added: ['        "$deprecated": "use {color.subtle} instead",'],
      removed: 0,
    });
    expect(after.replace('        "$deprecated": "use {color.subtle} instead",\n', "")).toBe(text);
    const border = indexTokens(parseTokens(after)).get("color.border");
    expect(border?.deprecated).toBe("use {color.subtle} instead");
    // A tab-indented CRLF file gets its own indent and line ending.
    const crlf = '{\r\n\t"a": {\r\n\t\t"$value": 1\r\n\t}\r\n}\r\n';
    expect(applyEdits(crlf, computeDeprecateEdits(crlf, ["a"], "gone"))).toBe(
      '{\r\n\t"a": {\r\n\t\t"$deprecated": "gone",\r\n\t\t"$value": 1\r\n\t}\r\n}\r\n',
    );
  });

  it("keeps a one-line token on its line, and replacing a reason rewrites only the value", () => {
    const once = apply(computeDeprecateEdits(text, ["color", "subtle"], "faint", "color.border"));
    expect(once.split("\n")[4]).toBe(
      '    "subtle": {"$value": {"colorSpace": "srgb", "components": [0, 0, 0]}, "$deprecated": "faint; use {color.border} instead"},',
    );
    expect(once.split("\n").length).toBe(text.split("\n").length);
    const twice = applyEdits(
      once,
      computeDeprecateEdits(once, ["color", "subtle"], "", "color.other"),
    );
    expect(twice).toBe(
      once.replace("faint; use {color.border} instead", "use {color.other} instead"),
    );
    expect(setTokenProperty(twice, ["color", "subtle"], "$deprecated", undefined)).toBe(text);
  });
});

describe("moving a use to the replacement", () => {
  it("rewrites the one reference string, curly or $ref pointer, and nothing else", () => {
    const text = JSON.stringify(
      {
        $type: "color",
        old: { $value: color, $deprecated: "use {new}" },
        new: { $value: color },
        a: { $value: "{old}" },
        b: { $value: { $ref: "#/old/$value" } },
        c: { $value: "{old}" },
      },
      null,
      2,
    );
    const uses = deprecatedReferences(parseTokens(text));
    expect(uses.map((u) => u.replacement)).toEqual(["new", "new", "new"]);
    const a = applyEdits(text, computeRetargetEdits(text, uses[0].path, "old", "new"));
    expect(a).toBe(text.replace('"a": {\n    "$value": "{old}"', '"a": {\n    "$value": "{new}"'));
    const b = applyEdits(text, computeRetargetEdits(text, uses[1].path, "old", "new"));
    expect(b).toBe(text.replace('"#/old/$value"', '"#/new/$value"'));
    // A path that does not hold a use of `old` is left alone.
    expect(computeRetargetEdits(text, ["new", "$value"], "old", "new")).toEqual([]);
  });

  it("re-spells an exported name for the replacement in its own convention", () => {
    const to = (id: string) =>
      retargetIdentifier(id, "color.border.subtle", "color.border.default");
    expect(to("--ds-color-border-subtle")).toBe("--ds-color-border-default");
    expect(to("$color-border-subtle")).toBe("$color-border-default");
    expect(to("colorBorderSubtle")).toBe("colorBorderDefault");
    expect(to("dsColorBorderSubtle")).toBe("dsColorBorderDefault");
    expect(to("COLOR_BORDER_SUBTLE")).toBe("COLOR_BORDER_DEFAULT");
    expect(to("tokens.color.border.subtle")).toBe("tokens.color.border.default");
    expect(retargetIdentifier("--space-sm", "space.sm", "size.space.small")).toBe(
      "--size-space-small",
    );
    expect(to("--unrelated")).toBeUndefined();
  });
});
