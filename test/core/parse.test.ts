import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseTokens } from "../../src/core/parse";
import { indexTokens } from "../../src/core/resolve";

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
