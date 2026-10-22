import { describe, it, expect } from "vitest";
import { ALL_TYPES, type TokenType } from "../../src/core/types";
import { getEditor } from "../../src/webview/editors/registry";

/**
 * Token types the registry deliberately leaves without an editor. `REGISTRY` is
 * a `Partial<Record<TokenType, …>>`, so a type added to `src/core/types.ts`
 * without one compiles fine and only fails when a user opens that token. Adding
 * the type here is the deliberate act; otherwise the first test below fails.
 *
 * Empty today — every DTCG 2025.10 type has an editor.
 */
const WITHOUT_EDITOR: TokenType[] = [];

describe("getEditor", () => {
  it("has an editor for every token type", () => {
    for (const type of ALL_TYPES) {
      if (WITHOUT_EDITOR.includes(type)) continue;
      expect(getEditor(type), type).toBeTypeOf("function");
    }
  });

  it("has none for the types deliberately left out", () => {
    for (const type of WITHOUT_EDITOR) {
      expect(getEditor(type), type).toBeUndefined();
    }
  });

  it("returns undefined for a token with no type", () => {
    expect(getEditor(undefined)).toBeUndefined();
  });
});
