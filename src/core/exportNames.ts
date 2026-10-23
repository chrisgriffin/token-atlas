/**
 * Map an identifier found in exported code back to the token it was built
 * from. Export tools (Style Dictionary, Terrazzo, …) turn `color.brand.primary`
 * into `--color-brand-primary`, `$color-brand-primary`, `colorBrandPrimary`,
 * `tokens.color.brand.primary`, often behind a prefix. Rather than model every
 * transform, compare on letters+digits only, and let a prefix fall away by
 * dropping the identifier's leading segments one at a time.
 *
 * Pure TS — no vscode, no DOM. See docs/adr/ADR-001-exported-identifier-matching.md.
 */

/** Comparison key: letters and digits only, lowercased. */
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Split on separators, camelCase boundaries and the end of a capitalized
 * acronym: `DSColor-brand.primary` → [DS, Color, brand, primary].
 */
function segments(identifier: string): string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

/**
 * The token path an exported identifier stands for, or undefined.
 * Exact normalized match wins; otherwise leading segments are dropped one at
 * a time so `--ds-color-brand-primary` still finds `color.brand.primary`.
 */
export function findTokenForIdentifier(
  identifier: string,
  keys: Iterable<string>,
): string | undefined {
  return tokenMatcher(keys)(identifier);
}

/** `findTokenForIdentifier` with the key lookup built once, for matching many identifiers. */
export function tokenMatcher(keys: Iterable<string>): (identifier: string) => string | undefined {
  const byNorm = new Map<string, string>();
  for (const key of keys) {
    const n = normalizeName(key);
    if (n && !byNorm.has(n)) byNorm.set(n, key);
  }
  return (identifier) => {
    const segs = segments(identifier);
    for (let i = 0; i < segs.length; i++) {
      const hit = byNorm.get(segs.slice(i).join("").toLowerCase());
      if (hit) return hit;
    }
    return undefined;
  };
}

/** `--a-b`, `$a-b`, `aB`, `a_b`, `a.b.c`: one run of identifier chars, dots allowed between. */
export const EXPORT_IDENTIFIER = /[$\w-]+(?:\.[$\w-]+)*/;

/** The variable spellings a stylesheet has; any other word there is a property, keyword or selector. */
const STYLESHEET_VARIABLE: Record<string, RegExp> = {
  css: /^--/,
  scss: /^--|(?:^|\.)\$/, // `$x`, or `tokens.$x` from a Sass module
  sass: /^--|(?:^|\.)\$/,
  less: /^--/, // `@x` too: the `@` sits before the scanned name, see `before`
};

/**
 * Whether `name`, scanned with `EXPORT_IDENTIFIER` from a file in
 * `languageId`, can name a token at all. In a stylesheet only a variable
 * can: `--x`, Sass's `$x`, Less's `@x` (`before` is the character ahead of
 * the name). Elsewhere, and with no language, every identifier can.
 */
export function canNameToken(name: string, languageId?: string, before = ""): boolean {
  const variable = languageId ? STYLESHEET_VARIABLE[languageId] : undefined;
  return !variable || variable.test(name) || (languageId === "less" && before === "@");
}

/** Where an identifier appears in a file: zero-based line and character, like an editor position. */
export interface IdentifierOccurrence {
  line: number;
  character: number;
  length: number;
  /**
   * The name is being defined here (`--x:`, `$x:`, `x =`, `x:`), as an export
   * tool's output does, rather than used.
   */
  declaration: boolean;
}

/**
 * Every identifier in exported code, grouped by spelling. Matching to tokens
 * happens later, per spelling, so a file is read once however the tokens change.
 * With a stylesheet `languageId`, only the names `canNameToken` allows.
 */
export function scanIdentifiers(
  text: string,
  languageId?: string,
): Map<string, IdentifierOccurrence[]> {
  const out = new Map<string, IdentifierOccurrence[]>();
  const re = new RegExp(EXPORT_IDENTIFIER.source, "g");
  let line = 0;
  let lineStart = 0;
  let scanned = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const name = m[0];
    if (!/[A-Za-z]/.test(name)) continue; // 16px, -1, 0.5
    if (!canNameToken(name, languageId, text[m.index - 1])) continue;
    for (
      let i = text.indexOf("\n", scanned);
      i !== -1 && i < m.index;
      i = text.indexOf("\n", i + 1)
    ) {
      line++;
      lineStart = i + 1;
    }
    scanned = m.index;
    // ponytail: the char after the name decides; a ternary's `a ? x : y` reads as
    // a declaration of x. Only the unused-token hint is affected, and it is opt-in.
    const after = /^\s*([:=])(.)/.exec(
      text.slice(m.index + name.length, m.index + name.length + 40),
    );
    const declaration =
      !!after &&
      !(after[1] === ":" && after[2] === ":") &&
      !(after[1] === "=" && /[=>]/.test(after[2]));
    const occurrence = { line, character: m.index - lineStart, length: name.length, declaration };
    const list = out.get(name);
    if (list) list.push(occurrence);
    else out.set(name, [occurrence]);
  }
  return out;
}

/**
 * `/* … *\/` and `// …` blanked to spaces, so offsets still line up. `//` after `:` is a URL.
 * Plain CSS (`languageId` `css`) has no `//` comments, so there only `/* *\/` is
 * blanked and a protocol-relative `url(//…)` keeps the rest of its line.
 * SCSS, Sass and Less read an unquoted `url(//…)` as a URL too, so there it is
 * kept up to its `)`, and a `//` inside a quoted string is no comment either;
 * a `//` after them still starts one.
 * ponytail: strings are not parsed, so a `//` or `/*` inside a JS string blanks
 * what follows it; a scanner then misses a usage there, never invents one.
 */
export function blankComments(text: string, languageId?: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  const blocks = text.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, blank);
  if (languageId === "css") return blocks;
  const lineComment = ["scss", "sass", "less"].includes(languageId ?? "")
    ? /(url\(\s*\/\/[^)\n]*|"[^"\n]*"|'[^'\n]*')|(^|[^:])(\/\/[^\n]*)/gim
    : /()(^|[^:])(\/\/[^\n]*)/gm;
  return blocks.replace(lineComment, (_, url: string, pre: string, c: string) =>
    url ? url : pre + blank(c),
  );
}

/** A use of a token in code, and what `pick` said about it. */
export interface TokenUsage<T> {
  line: number;
  character: number;
  length: number;
  value: T;
}

/**
 * Every place `text` uses a token that `pick` has something for, in document
 * order: a color swatch's color, a deprecation's reason. Identifiers match
 * against all `keys`, as hover does, so a use is reported exactly where a
 * hover would name that token. Declarations are skipped: an export file's
 * `--x: #fff;` defines the name rather than using it, and so are comments.
 */
export function tokenUsages<T>(
  text: string,
  keys: Iterable<string>,
  pick: (key: string) => T | null | undefined,
  languageId?: string,
): Array<TokenUsage<T>> {
  const match = tokenMatcher(keys);
  const out: Array<TokenUsage<T>> = [];
  for (const [name, occurrences] of scanIdentifiers(blankComments(text, languageId), languageId)) {
    const key = match(name);
    const value = key ? pick(key) : undefined;
    if (value === undefined || value === null || value === "") continue;
    for (const { line, character, length, declaration } of occurrences) {
      if (!declaration) out.push({ line, character, length, value });
    }
  }
  return out.sort((a, b) => a.line - b.line || a.character - b.character);
}

/** A `var(--name …)` in a stylesheet, as offsets into its text. */
export interface CssVarUsage {
  name: string;
  /** Where `--name` begins. */
  start: number;
  /** Just past the `)` that closes the `var(`, or past the name when the declaration ends first. */
  end: number;
}

/**
 * Every `var(--name …)` in `text`, in order; a fallback's own `var(…)` is listed too.
 * Comments are blanked first (offsets kept), so a commented-out
 * declaration is skipped and a comment's `)` or `;` never ends a fallback.
 */
export function cssVarUsages(source: string, languageId?: string): CssVarUsage[] {
  const text = blankComments(source, languageId);
  const out: CssVarUsage[] = [];
  const re = /\bvar\(\s*(--[\w-]+)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index + m[0].length - m[1].length;
    let end = start + m[1].length;
    for (let i = end, depth = 1; i < text.length; i++) {
      if (";{}".includes(text[i])) break; // the declaration ended unclosed
      if (text[i] === "(") depth++;
      else if (text[i] === ")" && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    out.push({ name: m[1], start, end });
    re.lastIndex = start + m[1].length;
  }
  return out;
}

/** Where a completion in exported code starts, and what kind of name it wants. */
export type ExportCompletionContext =
  | { kind: "sigil"; sigil: "--" | "$" | "@"; start: number }
  | { kind: "member"; chain: string[]; start: number };

const MEMBER_LANGUAGES = new Set([
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact",
]);

/**
 * What is being typed at the end of `linePrefix` (the line up to the cursor),
 * or undefined. `start` is the column the completion replaces from.
 *
 * - `--name` anywhere: a CSS custom property, in a stylesheet or in a JS string.
 * - `$name` in Sass, `@name` in Less.
 * - `a.b.` in JS/TS: an object path whose tail may be a token group.
 *
 * ponytail: a bare camelCase identifier (`colorBrand…`) is not offered — it
 * would put tokens in every JS completion list. Add it behind a setting if asked.
 */
export function exportCompletionContext(
  linePrefix: string,
  languageId: string,
): ExportCompletionContext | undefined {
  const sigil = (re: RegExp, s: "--" | "$" | "@"): ExportCompletionContext | undefined => {
    const m = re.exec(linePrefix);
    return m ? { kind: "sigil", sigil: s, start: m.index } : undefined;
  };
  const css = sigil(/(?<![\w$@-])--[\w-]*$/, "--");
  if (css) return css;
  if (languageId === "scss" || languageId === "sass") return sigil(/(?<![\w$-])\$[\w-]*$/, "$");
  if (languageId === "less") return sigil(/(?<![\w@-])@[\w-]*$/, "@");
  if (MEMBER_LANGUAGES.has(languageId)) {
    const m = /(?<![\w$.])([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\.([\w$]*)$/.exec(linePrefix);
    if (m)
      return { kind: "member", chain: m[1].split("."), start: linePrefix.length - m[2].length };
  }
  return undefined;
}

/**
 * `font.sizeBase` → `font-size-base`: the kebab spelling export tools default
 * to. Any other run of non-alphanumerics (a space, a slash) becomes one `-`,
 * so `color.Brand Primary` → `color-brand-primary`, never an invalid name.
 */
function kebab(key: string): string {
  return key
    .split(".")
    .map((seg) =>
      seg
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    )
    .filter(Boolean)
    .join("-");
}

/** The exported name for a token: `--` / `$` / `@`, then a prefix, then the kebab path. */
export function exportName(key: string, sigil: string, prefix = ""): string {
  return sigil + prefix + kebab(key);
}

/**
 * The export prefix a file already uses (`ds-` in `--ds-color-brand`), learnt
 * from the first `sigil` name in `text` that matches a token, or `""`.
 */
export function learnPrefix(text: string, sigil: string, keys: Iterable<string>): string {
  const list = [...keys];
  const esc = sigil.replace(/[$]/g, "\\$");
  const re = new RegExp(`(?<![\\w$@-])${esc}([\\w-]+)`, "g");
  let seen = 0;
  for (const m of text.matchAll(re)) {
    if (++seen > 200) break; // ponytail: first 200 names only; a prefix shows up early
    const key = findTokenForIdentifier(m[1], list);
    if (!key) continue;
    const body = kebab(key);
    if (m[1].endsWith(body)) return m[1].slice(0, m[1].length - body.length);
  }
  return "";
}

/**
 * Token paths that continue an object path typed in JS/TS: `tokens.color.` →
 * `base.white`, `brand.primary`, …. Leading segments drop away like
 * `findTokenForIdentifier`'s prefix, so the root object's name is free; the
 * remaining segments must match a token group exactly (letters and digits).
 */
export function memberCompletions(
  chain: string[],
  keys: Iterable<string>,
): { key: string; insert: string }[] {
  const list = [...keys].map((key) => ({ key, segs: key.split(".") }));
  const norm = chain.map(normalizeName);
  for (let i = 0; i < norm.length; i++) {
    const base = norm.slice(i);
    const hits = list.filter(
      ({ segs }) => segs.length > base.length && base.every((b, j) => normalizeName(segs[j]) === b),
    );
    if (hits.length) {
      return hits.map(({ key, segs }) => ({ key, insert: segs.slice(base.length).join(".") }));
    }
  }
  return [];
}

const ALNUM = /[A-Za-z0-9]/;

/**
 * Renaming the segment at `depth` of `key` to `newName`, as an edit inside
 * `identifier` (an exported spelling of `key`, prefix allowed): the span that
 * spells that segment and its new spelling in the identifier's own
 * convention, or undefined when the identifier does not end in `key`.
 *
 * Only the renamed segment moves, so a prefix and every other segment keep
 * the identifier's exact spelling. The span is found on the same boundaries
 * `tokenMatcher` drops a prefix at; the new name's words come from `kebab`.
 * Convention: snake next to a `_` (upper-case kept), kebab after a sigil or
 * next to a `-`, a dotted path keeps the name verbatim when it is a valid JS
 * name, and anything else is a camelCase run (PascalCase if it was).
 */
export function renameInIdentifier(
  identifier: string,
  key: string,
  depth: number,
  newName: string,
): { start: number; end: number; text: string } | undefined {
  const id = identifier;
  const norm = normalizeName(key);
  let i = -1;
  for (let p = 0; p < id.length && i < 0; p++) {
    if (!ALNUM.test(id[p])) continue;
    const boundary =
      p === 0 ||
      !ALNUM.test(id[p - 1]) ||
      (/[a-z0-9]/.test(id[p - 1]) && /[A-Z]/.test(id[p])) ||
      (/[A-Z]/.test(id[p - 1]) && /[A-Z]/.test(id[p]) && /[a-z]/.test(id[p + 1] ?? ""));
    if (boundary && normalizeName(id.slice(p)) === norm) i = p;
  }
  if (i < 0) return undefined;

  const segs = key.split(".");
  let start = -1;
  let end = -1;
  for (let j = 0; j < segs.length; j++) {
    let need = normalizeName(segs[j]).length;
    if (!need) continue;
    while (!ALNUM.test(id[i])) i++;
    const s = i;
    for (; need; i++) if (ALNUM.test(id[i])) need--;
    if (j === depth) [start, end] = [s, i];
  }
  if (start < 0) return undefined;

  const span = id.slice(start, end);
  const near = id[start - 1] ?? "";
  const next = id[end] ?? "";
  const words = kebab(newName).split("-").filter(Boolean);
  if (!words.length) return undefined;
  const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
  let text: string;
  if (near === "_" || next === "_" || span.includes("_")) {
    text = words.join("_");
    if (/[A-Z]/.test(span) && span === span.toUpperCase()) text = text.toUpperCase();
  } else if (/^(--|\$|@)/.test(id) || near === "-" || next === "-" || span.includes("-")) {
    text = words.join("-");
  } else if (near === "." || next === ".") {
    text =
      span === segs[depth] && /^[A-Za-z_$][\w$]*$/.test(newName)
        ? newName
        : words[0] + words.slice(1).map(cap).join("");
  } else {
    text = /[A-Z]/.test(span[0])
      ? words.map(cap).join("")
      : words[0] + words.slice(1).map(cap).join("");
  }
  return { start, end, text };
}

/**
 * Whether a code file says it was generated: a "do not edit" / "generated"
 * notice in its first 512 characters, as Style Dictionary and Terrazzo write.
 * Rename leaves such a file to the export tool's next build.
 */
export function isGeneratedCode(text: string): boolean {
  return /do not edit|auto-?generated|@generated|generated (automatically|by)/i.test(
    text.slice(0, 512),
  );
}
