/**
 * Hard-coded stylesheet values that already exist as tokens: `color: #2563eb`
 * where `color.base.blue-600` is `#2563eb`. Scans CSS/SCSS/Sass/Less text for
 * colour and px/rem literals, matches each against the active token set, and
 * names the replacement in the stylesheet's own variable syntax.
 *
 * Pure TS — no vscode, no DOM. The host wiring is src/host/hardcodedValues.ts.
 */
import { toColor } from "./color";
import { blankComments, exportName } from "./exportNames";
import type { TokenNode } from "./types";

export interface Literal {
  text: string;
  start: number;
  end: number;
  kind: "color" | "dimension";
}

// `url(#id)` points at an SVG element, so a hex right after `url(` is no color.
const COLOR =
  /(?<!url\(\s*["']?)#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)/gi;
const DIMENSION = /(?<![\w.#$@-])-?(?:\d+\.?\d*|\.\d+)(?:px|rem)(?![\w-])/gi;

const indentOf = (line: string) => /^[ \t]*/.exec(line)![0].length;

/**
 * Sass's indented syntax has no braces: a line followed by a more-indented
 * line opens a block, so it is a selector.
 */
function opensIndentedBlock(text: string, at: number): boolean {
  const lineStart = text.lastIndexOf("\n", at) + 1;
  const lineEnd = text.indexOf("\n", at);
  if (lineEnd === -1) return false;
  const indent = indentOf(text.slice(lineStart, lineEnd));
  const next = text
    .slice(lineEnd + 1)
    .split("\n")
    .find((l) => l.trim() !== "");
  return next !== undefined && indentOf(next) > indent;
}

/**
 * Colour and px/rem literals in declaration values. Skipped: comments,
 * selectors (`#abc { … }` is an id, not a colour), and the declaration that
 * defines a custom property or Sass/Less variable — an exported token file is
 * nothing but those, and each one *is* the token. `languageId` `sass` reads
 * the indented syntax, where a newline ends a statement and indentation opens
 * a block.
 */
export function findLiterals(source: string, languageId?: string): Literal[] {
  const text = blankComments(source, languageId);
  const indented = languageId === "sass";
  const out: Literal[] = [];
  const scan = (re: RegExp, kind: Literal["kind"]) => {
    for (const m of text.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      const before = indented
        ? text.lastIndexOf("\n", start - 1)
        : Math.max(
            text.lastIndexOf(";", start),
            text.lastIndexOf("{", start),
            text.lastIndexOf("}", start),
          );
      const statement = text.slice(before + 1, start);
      if (!statement.includes(":")) continue; // not a declaration value
      if (/^\s*(?:--|\$|@)[\w-]+\s*:/.test(statement)) continue; // a definition
      if (indented) {
        if (opensIndentedBlock(text, start)) continue; // a selector
      } else {
        const after = text.slice(end).search(/[;{}]/);
        if (after !== -1 && text[end + after] === "{") continue; // a selector
      }
      out.push({ text: m[0], start, end, kind });
    }
  };
  scan(COLOR, "color");
  scan(DIMENSION, "dimension");
  return out.sort((a, b) => a.start - b.start);
}

/** The values literals are compared against, computed once per token set. */
export interface TokenValueIndex {
  colors: Array<{ key: string; srgb: number[]; alpha: number }>;
  dimensions: Array<{ key: string; px: number }>;
  rootPx: number;
}

// Unclamped sRGB: a display-p3 red sits outside sRGB and must not equal #ff0000.
function srgbOf(value: unknown): { srgb: number[]; alpha: number } | undefined {
  try {
    const c = toColor(value)?.to("srgb");
    if (!c) return undefined;
    // A parsed CSS string can carry boxed Numbers (`alpha` is `[Number: 0.5]`).
    const srgb = c.coords.map((n) => (Number.isFinite(Number(n)) ? Number(n) : 0));
    const alpha = Number(c.alpha ?? 1);
    return { srgb, alpha: Number.isFinite(alpha) ? alpha : 1 };
  } catch {
    return undefined;
  }
}

function toPx(value: unknown, rootPx: number): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { value: n, unit } = value as { value?: unknown; unit?: unknown };
  if (typeof n !== "number") return undefined;
  if (unit === "px") return n;
  if (unit === "rem") return n * rootPx;
  return undefined;
}

export function indexTokenValues(
  tokens: Iterable<[string, TokenNode]>,
  rootPx = 16,
): TokenValueIndex {
  const index: TokenValueIndex = { colors: [], dimensions: [], rootPx };
  for (const [key, token] of tokens) {
    const type = token.resolvedType ?? token.type;
    const value = token.resolvedValue ?? token.value;
    if (type === "color") {
      const c = srgbOf(value);
      if (c) index.colors.push({ key, ...c });
    } else if (type === "dimension") {
      const px = toPx(value, rootPx);
      if (px !== undefined && px !== 0) index.dimensions.push({ key, px });
    }
  }
  return index;
}

const CHANNEL = 0.5 / 255;

/** Keys of every token whose value equals the literal, sorted. */
export function matchingTokens(literal: Literal, index: TokenValueIndex): string[] {
  const keys: string[] = [];
  if (literal.kind === "color") {
    const lit = srgbOf(literal.text);
    if (!lit) return [];
    for (const t of index.colors) {
      if (
        Math.abs(t.alpha - lit.alpha) <= 0.01 &&
        t.srgb.every((v, i) => Math.abs(v - lit.srgb[i]) <= CHANNEL)
      ) {
        keys.push(t.key);
      }
    }
  } else {
    const m = /^(-?[\d.]+)(px|rem)$/i.exec(literal.text);
    if (!m) return [];
    const px = Number(m[1]) * (m[2].toLowerCase() === "rem" ? index.rootPx : 1);
    if (px === 0) return [];
    for (const t of index.dimensions) if (Math.abs(t.px - px) < 1e-6) keys.push(t.key);
  }
  return keys.sort();
}

/** The sigil a stylesheet language names its variables with. */
export function sigilFor(languageId: string): string {
  if (languageId === "scss" || languageId === "sass") return "$";
  if (languageId === "less") return "@";
  return "--";
}

/**
 * The token's name in the stylesheet's own variable syntax, behind the
 * export prefix the file already uses (`learnPrefix`):
 * `color.base.blue-600` → `var(--ds-color-base-blue-600)` in CSS,
 * `$color-base-blue-600` in SCSS/Sass, `@color-base-blue-600` in Less.
 */
export function replacementFor(key: string, languageId: string, prefix = ""): string {
  const sigil = sigilFor(languageId);
  const name = exportName(key, sigil, prefix);
  return sigil === "--" ? `var(${name})` : name;
}
