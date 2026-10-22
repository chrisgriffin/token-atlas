import { describe, it, expect } from "vitest";
import { parseTokens } from "../../src/core/parse";
import { resolveAliases, indexTokens } from "../../src/core/resolve";
import { validate } from "../../src/core/validate";

describe("cross-file (multi-file theming) resolution", () => {
  // A "primitives" file that other theme files reference.
  const primitives = parseTokens(
    JSON.stringify({
      color: { $type: "color", base: { blue: { $value: "#3b82f6" } } },
    }),
  );
  const external = indexTokens(primitives);

  it("resolves a reference to a token defined in another file", () => {
    const theme = parseTokens(
      JSON.stringify({
        color: { $type: "color", primary: { $value: "{color.base.blue}" } },
      }),
    );
    const index = resolveAliases(theme, external);
    const primary = index.get("color.primary")!;
    expect(primary.resolvedValue).toBe("#3b82f6");
  });

  it("does not flag cross-file references as unresolved", () => {
    const theme = parseTokens(
      JSON.stringify({
        color: { $type: "color", primary: { $value: "{color.base.blue}" } },
      }),
    );
    resolveAliases(theme, external);
    const result = validate(theme, external);
    expect(result.issues.some((i) => /Unresolved reference/.test(i.message))).toBe(false);
  });

  it("still flags references missing from both local and external", () => {
    const theme = parseTokens(
      JSON.stringify({ color: { $type: "color", x: { $value: "{color.base.green}" } } }),
    );
    resolveAliases(theme, external);
    const result = validate(theme, external);
    expect(result.issues.some((i) => /Unresolved reference/.test(i.message))).toBe(true);
  });
});
