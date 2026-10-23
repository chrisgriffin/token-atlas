import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseTokens } from "../../src/core/parse";
import { indexTokens, resolveAliases } from "../../src/core/resolve";
import { validate } from "../../src/core/validate";

const here = dirname(fileURLToPath(import.meta.url));
const sample = readFileSync(join(here, "../../fixtures/sample.tokens.json"), "utf8");

describe("parseTokens", () => {
  it("builds a group/token tree and inherits $type from groups", () => {
    const model = parseTokens(sample);
    const index = indexTokens(model);

    expect(index.has("color.base.blue-500")).toBe(true);
    expect(index.get("color.base.blue-500")!.type).toBe("color"); // inherited
    expect(index.get("color.base.blue-500")!.typeIsInherited).toBe(true);
    expect(index.get("space.md")!.type).toBe("dimension");
    expect(index.get("type.heading")!.type).toBe("typography");
  });

  it("detects alias references", () => {
    const model = parseTokens(sample);
    const index = indexTokens(model);
    const primary = index.get("color.brand.primary")!;
    expect(primary.isAlias).toBe(true);
    expect(primary.reference).toBe("color.base.blue-500");
  });

  it("treats empty / malformed input as an empty document", () => {
    expect(parseTokens("").root.children).toHaveLength(0);
    expect(parseTokens("{ not json").root.children).toHaveLength(0);
  });
});

describe("$deprecated", () => {
  it("is read on tokens and groups, as a boolean or a reason string", () => {
    const model = parseTokens(
      JSON.stringify({
        old: {
          $deprecated: true,
          a: { $type: "number", $value: 1, $deprecated: "use new.a" },
          b: { $type: "number", $value: 2 },
        },
      }),
    );
    const old = model.root.children[0];
    expect(old.kind).toBe("group");
    if (old.kind !== "group") return;
    expect(old.deprecated).toBe(true);
    const [a, b] = old.children;
    expect(a.kind === "token" && a.deprecated).toBe("use new.a");
    expect(b.kind === "token" && b.deprecated).toBeUndefined();
  });
});

describe("group inheritedType", () => {
  it("records the ancestor type a group passes on when it declares none", () => {
    const model = parseTokens(
      JSON.stringify({
        color: { $type: "color", brand: { a: { $value: "#000" } }, own: { $type: "number" } },
      }),
    );
    const color = model.root.children[0];
    if (color.kind !== "group") throw new Error("expected group");
    expect(color.type).toBe("color");
    expect(color.inheritedType).toBeUndefined();
    const [brand, own] = color.children;
    expect(brand.kind === "group" && brand.inheritedType).toBe("color");
    expect(own.kind === "group" && own.type).toBe("number");
    expect(own.kind === "group" && own.inheritedType).toBeUndefined();
  });
});

describe("core model fixes — reading spec-valid files", () => {
  const red = { colorSpace: "srgb", components: [1, 0, 0] };

  it("reads a $root token and resolves {group.$root} and a pointer through it (§6.2)", () => {
    const model = parseTokens(
      JSON.stringify({
        color: {
          $type: "color",
          accent: { $root: { $value: red }, light: { $value: red } },
          button: { $value: "{color.accent.$root}" },
          ring: { $value: { $ref: "#/color/accent/$root/$value" } },
        },
      }),
    );
    const index = resolveAliases(model);
    expect([...index.keys()]).toEqual([
      "color.accent.$root",
      "color.accent.light",
      "color.button",
      "color.ring",
    ]);
    expect(index.get("color.button")!.resolvedValue).toEqual(red);
    expect(index.get("color.ring")!.resolvedValue).toEqual(red);
    expect(validate(model).issues).toEqual([]);
  });

  it("keeps every token in a file with comments and trailing commas", () => {
    const text = `{
  // brand colors
  "a": { "$type": "number", "$value": 1 }, /* base */
  "b": { "$type": "number", "$value": 2, },
}`;
    const model = parseTokens(text);
    expect([...indexTokens(model).keys()]).toEqual(["a", "b"]);
    resolveAliases(model);
    expect(validate(model).issues).toEqual([]);
  });

  it("reports a real syntax error at its offset, and reads no tokens from that text", () => {
    const text = `{ "a": { "$type": "number", "$value": 1 }, "b": { "$value" 2 } }`;
    const model = parseTokens(text);
    expect(indexTokens(model).size).toBe(0);
    resolveAliases(model);
    const syntax = validate(model).issues.filter((i) => /JSON syntax error/.test(i.message));
    expect(syntax).toHaveLength(1);
    expect(syntax[0].severity).toBe("error");
    expect(syntax[0].offset).toBe(text.indexOf("2 }"));
  });

  it("warns on an unknown $ key and not on a known one", () => {
    const model = parseTokens(
      JSON.stringify({
        $schema: "https://example.com/schema.json",
        $themes: [],
        $metadata: {},
        a: { $type: "color", $valeu: red },
        b: { $type: "number", $value: 1, $description: "x", $colour: "red" },
        $colour: { $value: 1 },
      }),
    );
    resolveAliases(model);
    const unknown = validate(model).issues.filter((i) => /Unknown property/.test(i.message));
    expect(unknown.map((i) => [i.severity, i.path.join(".")])).toEqual([
      ["warning", "$colour"],
      ["warning", "a.$valeu"],
      ["warning", "b.$colour"],
    ]);
  });
});
