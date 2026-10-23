import { describe, it, expect } from "vitest";
import { parseTokens } from "../../src/core/parse";
import { resolveAliases } from "../../src/core/resolve";
import {
  aliasCandidates,
  aliasCompletionContext,
  aliasEditSpan,
  describeValue,
  expectedTypeAt,
  wouldCycle,
} from "../../src/core/aliases";

const model = parseTokens(
  JSON.stringify({
    color: {
      $type: "color",
      blue: { $value: "#3b82f6" },
      brand: { $value: "{color.blue}" },
      link: { $value: "{color.brand}" },
    },
    space: { $type: "dimension", md: { $value: { value: 16, unit: "px" } } },
    loose: { $value: "{color.blue}" },
  }),
);
const index = resolveAliases(model);
const keys = (ts: { path: string[] }[]) => ts.map((t) => t.path.join("."));

describe("aliasCandidates", () => {
  it("keeps only the wanted type, never itself, never a cycle", () => {
    const got = keys(aliasCandidates(index.values(), "color.brand", "color", index));
    expect(got).toContain("color.blue");
    expect(got).not.toContain("color.brand"); // itself
    expect(got).not.toContain("color.link"); // link → brand would loop
    expect(got).not.toContain("space.md"); // wrong type
    expect(got).toContain("loose"); // untyped alias, resolved type is color
  });

  it("offers every type when there is no constraint", () => {
    const got = keys(aliasCandidates(index.values(), "nothing", undefined, index));
    expect(got).toEqual(expect.arrayContaining(["color.blue", "space.md"]));
  });
});

describe("expectedTypeAt", () => {
  it("is the token's type for the whole value", () => {
    expect(expectedTypeAt("color", [])).toBe("color");
  });
  it("maps composite sub-values to their DTCG types", () => {
    expect(expectedTypeAt("shadow", ["color"])).toBe("color");
    expect(expectedTypeAt("shadow", [1, "offsetX"])).toBe("dimension");
    expect(expectedTypeAt("gradient", [0, "position"])).toBe("number");
    expect(expectedTypeAt("typography", ["fontWeight"])).toBe("fontWeight");
    expect(expectedTypeAt("transition", ["timingFunction"])).toBe("cubicBezier");
  });
  it("keeps the stack type for fontFamily array items and has no opinion on unknown keys", () => {
    expect(expectedTypeAt("fontFamily", [0])).toBe("fontFamily");
    expect(expectedTypeAt("border", ["mystery"])).toBeUndefined();
  });
});

describe("wouldCycle", () => {
  it("detects a loop through an existing chain", () => {
    expect(wouldCycle(index, "color.brand", "color.link")).toBe(true);
    expect(wouldCycle(index, "color.brand", "color.blue")).toBe(false);
  });
});

describe("describeValue", () => {
  it("summarises the common value shapes", () => {
    expect(describeValue({ value: 16, unit: "px" })).toBe("16px");
    expect(describeValue({ colorSpace: "srgb", components: [1, 0, 0] })).toBe("#ff0000");
    expect(describeValue([0.4, 0, 0.2, 1])).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
    expect(describeValue(["Inter", "sans-serif"])).toBe("Inter, sans-serif");
    expect(describeValue(700)).toBe("700");
    expect(describeValue(undefined)).toBe("");
  });
});

describe("aliasEditSpan", () => {
  const at = (text: string, needle: string) => text.indexOf(needle) + needle.length;
  const interior = (text: string, s: { start?: number; end?: number }) =>
    text.slice(s.start, s.end);

  it("replaces the whole interior of a closed string, including text after the cursor", () => {
    const text = '{ "a": { "$value": "{colors.srgb}" } }';
    const span = aliasEditSpan(text, at(text, "{colors.s"));
    expect(span.inString).toBe(true);
    expect(interior(text, span)).toBe("{colors.srgb}");
  });

  it("keeps the last typed character when the closing quote is missing", () => {
    const text = '{ "a": { "$value": "{col\n } }';
    const span = aliasEditSpan(text, at(text, "{col"));
    expect(interior(text, span)).toBe("{col");
  });

  it("works inside a composite sub-value", () => {
    const text = '{ "a": { "$value": { "color": "{col" } } }';
    expect(interior(text, aliasEditSpan(text, at(text, "{col")))).toBe("{col");
  });

  it("has no range outside a string", () => {
    const text = '{ "a": { "$value": 1 } }';
    expect(aliasEditSpan(text, at(text, '"$value": ')).inString).toBe(false);
  });
});

describe("aliasCompletionContext", () => {
  const at = (text: string, needle: string) => text.indexOf(needle) + needle.length;

  it("bails while typing a property key inside a composite value", () => {
    const open = '{ "a": { "$type": "shadow", "$value": { "col';
    expect(aliasCompletionContext(open, open.length)).toBeUndefined();
    const closed = '{ "a": { "$type": "shadow", "$value": { "col" } } }';
    expect(aliasCompletionContext(closed, at(closed, '"col'))).toBeUndefined();
  });

  it("bails in an empty key slot and right after a literal", () => {
    const slot = '{ "a": { "$value": { "color": "#fff",  } } }';
    expect(aliasCompletionContext(slot, at(slot, '"#fff", '))).toBeUndefined();
    const num = '{ "a": { "$value": 12 } }';
    expect(aliasCompletionContext(num, at(num, "12"))).toBeUndefined();
  });

  it("bails outside $value", () => {
    const text = '{ "a": { "$description": "{col" } }';
    expect(aliasCompletionContext(text, at(text, "{col"))).toBeUndefined();
  });

  it("offers a replace span inside a value string, with the token and sub-path", () => {
    const text = '{ "a": { "b": { "$value": { "color": "{col" } } } }';
    const ctx = aliasCompletionContext(text, at(text, "{col"));
    expect(ctx?.tokenPath).toEqual(["a", "b"]);
    expect(ctx?.subPath).toEqual(["color"]);
    expect(ctx?.inString).toBe(true);
    expect(text.slice(ctx?.start, ctx?.end)).toBe("{col");
  });

  it("offers a quoted insert in an empty value slot", () => {
    const top = '{ "a": { "$value":  } }';
    expect(aliasCompletionContext(top, at(top, '"$value": '))).toMatchObject({
      tokenPath: ["a"],
      subPath: [],
      inString: false,
    });
    const sub = '{ "a": { "$value": { "color":  } } }';
    expect(aliasCompletionContext(sub, at(sub, '"color": '))?.subPath).toEqual(["color"]);
  });

  it("covers fontFamily stack items", () => {
    const text = '{ "a": { "$type": "fontFamily", "$value": [ "{fo" ] } }';
    expect(aliasCompletionContext(text, at(text, "{fo"))?.subPath).toEqual([0]);
  });
});

describe("core model fixes — the alias picker and $ref pointers", () => {
  it("does not offer a token whose $ref pointer reaches back into the token being edited", () => {
    const m = parseTokens(
      JSON.stringify({
        bd: {
          $type: "border",
          $value: { color: "{c}", width: { value: 1, unit: "px" }, style: "solid" },
        },
        c: { $type: "color", $value: { $ref: "#/bd/$value/color" } },
        d: { $type: "color", $value: { colorSpace: "srgb", components: [0, 0, 0] } },
      }),
    );
    const idx = resolveAliases(m);
    expect(wouldCycle(idx, "bd", "c")).toBe(true);
    expect(aliasCandidates(idx.values(), "bd", "color", idx).map((t) => t.path.join("."))).toEqual([
      "d",
    ]);
  });
});
