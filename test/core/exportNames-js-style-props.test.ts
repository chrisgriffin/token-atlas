import { describe, it, expect } from "vitest";
import { renameInIdentifier, scanIdentifiers, tokenMatcher } from "../../src/core/exportNames";

const KEYS = ["border.width", "color.brand.primary"];

/**
 * Rename `key`'s segment at `depth` to `newName` in `text`, the way
 * src/host/rename.ts does: scan, match each spelling to a token, re-spell it.
 */
function rename(text: string, languageId: string, key: string, depth: number, newName: string) {
  const match = tokenMatcher(KEYS);
  const lines = text.split("\n");
  const edits: { line: number; start: number; end: number; text: string }[] = [];
  for (const [name, occurrences] of scanIdentifiers(text, languageId)) {
    if (match(name) !== key) continue;
    const r = renameInIdentifier(name, key, depth, newName);
    if (!r) continue;
    for (const o of occurrences) {
      edits.push({
        line: o.line,
        start: o.character + r.start,
        end: o.character + r.end,
        text: r.text,
      });
    }
  }
  for (const e of edits.sort((a, b) => b.line - a.line || b.start - a.start)) {
    const l = lines[e.line];
    lines[e.line] = l.slice(0, e.start) + e.text + l.slice(e.end);
  }
  return lines.join("\n");
}

describe("renaming a token whose camelCase name is a DOM style property", () => {
  it.each(["javascript", "typescript", "javascriptreact", "typescriptreact", "ts", "mjs"])(
    "leaves el.style.borderWidth and a style object's borderWidth key alone (%s)",
    (languageId) => {
      const text = [
        "el.style.borderWidth = '2px';",
        "const style = { borderWidth: 1, color: 'red' };",
        "div.style.borderWidth;",
        "const w = borderWidth;",
      ].join("\n");
      expect(rename(text, languageId, "border.width", 1, "size")).toBe(text);
    },
  );

  it("still renames a dotted token path and an imported camelCase export", () => {
    const text = [
      "import tokens from './tokens';",
      "import { borderWidth, colorBrandPrimary } from './tokens.js';",
      "const a = tokens.border.width;",
      "const b = borderWidth;",
      "const c = tokens.borderWidth;",
      "el.style.borderWidth = borderWidth;",
    ].join("\n");
    expect(rename(text, "typescript", "border.width", 1, "size")).toBe(
      [
        "import tokens from './tokens';",
        "import { borderSize, colorBrandPrimary } from './tokens.js';",
        "const a = tokens.border.size;",
        "const b = borderSize;",
        "const c = tokens.borderSize;",
        "el.style.borderWidth = borderSize;",
      ].join("\n"),
    );
  });

  it("reads every import and require shape for the names a file brings in", () => {
    const text = [
      "import * as t from './tokens';",
      "import def, { borderWidth as bw } from './tokens';",
      "const { borderWidth } = require('./tokens');",
      "const theme = require('./theme');",
      "t.borderWidth; theme.borderWidth; borderWidth; def.borderWidth; props.borderWidth;",
    ].join("\n");
    const names = [...scanIdentifiers(text, "javascript").keys()];
    expect(names).toEqual(
      expect.arrayContaining([
        "t.borderWidth",
        "theme.borderWidth",
        "borderWidth",
        "def.borderWidth",
      ]),
    );
    expect(names).not.toContain("props.borderWidth");
  });

  it("keeps the declaration a tokens module exports", () => {
    const text = "export const borderWidth = '1px';\nexport let colorBrandPrimary = '#fff';";
    const scan = scanIdentifiers(text, "typescript");
    expect(scan.get("borderWidth")?.[0].declaration).toBe(true);
    expect(rename(text, "typescript", "border.width", 1, "size")).toBe(
      "export const borderSize = '1px';\nexport let colorBrandPrimary = '#fff';",
    );
  });

  it("leaves a style object's key alone even when the file imports that name", () => {
    const text = [
      "import { borderWidth } from './tokens';",
      "const s = { borderWidth: borderWidth };",
      "const el = <div style={{ borderWidth: borderWidth }} />;",
      "const t = { color: 'red', borderWidth };",
    ].join("\n");
    expect(rename(text, "typescriptreact", "border.width", 1, "size")).toBe(
      [
        "import { borderSize } from './tokens';",
        "const s = { borderWidth: borderSize };",
        "const el = <div style={{ borderWidth: borderSize }} />;",
        "const t = { color: 'red', borderSize };",
      ].join("\n"),
    );
  });

  it("keeps a declared export in a .d.ts tokens module", () => {
    const text = "export declare const borderWidth: string;";
    expect(scanIdentifiers(text, "typescript").get("borderWidth")?.[0].declaration).toBe(true);
    expect(rename(text, "typescript", "border.width", 1, "size")).toBe(
      "export declare const borderSize: string;",
    );
  });

  it("keeps a name that is not a style property, and a non-JS file as before", () => {
    const text = "const x = colorBrandPrimary; el.style.colorBrandPrimary;";
    expect([...scanIdentifiers(text, "typescript").keys()]).toEqual(
      expect.arrayContaining(["colorBrandPrimary", "el.style.colorBrandPrimary"]),
    );
    expect(scanIdentifiers("el.style.borderWidth", undefined).has("el.style.borderWidth")).toBe(
      true,
    );
  });
});
