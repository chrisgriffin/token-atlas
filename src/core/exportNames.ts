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

const JS_LANGUAGES = new Set([
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact",
  ...["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts"], // a closed file's extension
]);

/**
 * CSS properties as a DOM style object spells them (`borderWidth`). In JS/TS
 * nothing tells `el.style.borderWidth` from a `border.width` token export, so
 * these names count only when the file imports them (see `isStyleProperty`).
 * ponytail: the standard properties tokens style; a missing one only means
 * rename may rewrite that property, as it did for every name before.
 */
const STYLE_PROPERTIES = new Set(
  `accent-color align-content align-items align-self all animation animation-delay
  animation-duration animation-name animation-timing-function appearance aspect-ratio
  backdrop-filter background background-attachment background-blend-mode background-clip
  background-color background-image background-origin background-position background-repeat
  background-size block-size border border-block border-block-color border-block-end
  border-block-start border-block-style border-block-width border-bottom border-bottom-color
  border-bottom-left-radius border-bottom-right-radius border-bottom-style border-bottom-width
  border-collapse border-color border-end-end-radius border-end-start-radius border-image
  border-inline border-inline-color border-inline-end border-inline-start border-inline-style
  border-inline-width border-left border-left-color border-left-style border-left-width
  border-radius border-right border-right-color border-right-style border-right-width
  border-spacing border-start-end-radius border-start-start-radius border-style border-top
  border-top-color border-top-left-radius border-top-right-radius border-top-style
  border-top-width border-width bottom box-shadow box-sizing caret-color clip-path color
  column-gap column-rule column-rule-color column-rule-width columns column-width content
  cursor display fill filter flex flex-basis flex-direction flex-flow flex-grow flex-shrink
  flex-wrap float font font-family font-feature-settings font-size font-stretch font-style
  font-variant font-variation-settings font-weight gap grid grid-area grid-auto-columns
  grid-auto-flow grid-auto-rows grid-column grid-column-gap grid-gap grid-row grid-row-gap
  grid-template grid-template-areas grid-template-columns grid-template-rows height hyphens
  inline-size inset inset-block inset-inline isolation justify-content justify-items
  justify-self left letter-spacing line-height list-style margin margin-block margin-block-end
  margin-block-start margin-bottom margin-inline margin-inline-end margin-inline-start
  margin-left margin-right margin-top mask max-block-size max-height max-inline-size max-width
  min-block-size min-height min-inline-size min-width mix-blend-mode object-fit
  object-position opacity order outline outline-color outline-offset outline-style
  outline-width overflow overflow-wrap overflow-x overflow-y padding padding-block
  padding-block-end padding-block-start padding-bottom padding-inline padding-inline-end
  padding-inline-start padding-left padding-right padding-top perspective place-content
  place-items place-self pointer-events position resize right rotate row-gap scale
  scroll-behavior scroll-margin scroll-padding stroke stroke-width tab-size table-layout
  text-align text-decoration text-decoration-color text-decoration-thickness text-indent
  text-overflow text-shadow text-transform text-underline-offset top touch-action transform
  transform-origin transition transition-delay transition-duration transition-property
  transition-timing-function translate user-select vertical-align visibility white-space
  width will-change word-break word-spacing writing-mode z-index`
    .split(/\s+/)
    .map((p) => p.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())),
);

/**
 * The names a JS/TS file brings in: `import a, { b, c as d } from`,
 * `import * as e from`, `const f = require(` and `const { g, h: i } = require(`.
 */
function importedNames(text: string): Set<string> {
  const out = new Set<string>();
  const add = (list: string, alias: RegExp) => {
    for (const part of list.replace(/[{}]/g, ",").split(",")) {
      const name = alias.exec(part.trim())?.[1];
      if (name) out.add(name);
    }
  };
  for (const m of text.matchAll(/\bimport\s+(?:type\s+)?([^'";]*?)\s+from\s*['"]/g)) {
    add(m[1], /(?:^|\s)([A-Za-z_$][\w$]*)$/); // `b`, `c as d` → d, `* as e` → e
  }
  for (const m of text.matchAll(
    /\b(?:const|let|var)\s+(\{[^}]*\}|[A-Za-z_$][\w$]*)\s*=\s*require\s*\(/g,
  )) {
    add(m[1], /([A-Za-z_$][\w$]*)$/); // `g`, `h: i` → i
  }
  return out;
}

/**
 * Whether `name`, scanned from JS/TS, is a DOM style property rather than a
 * token export (docs/adr/ADR-002-js-style-property-names.md): it ends in a style property
 * name, and it is a bare object key (`{ borderWidth: … }`, imported or not), or
 * its root is not imported into the file and it is not that file's own
 * `export const`. A one-word property at the end of a path other than
 * `.style.` stays a path segment (`tokens.border.width`).
 * ponytail: a style-shaped name read off an object that was not imported
 * (`props.borderWidth`) is skipped too, and so is a tokens module's own object
 * key (`export const tokens = { borderWidth: … }`); references and rename miss both.
 */
function isStyleProperty(
  name: string,
  imported: Set<string>,
  exported: boolean,
  objectKey: boolean,
): boolean {
  const segs = name.split(".");
  const last = segs[segs.length - 1];
  if (!STYLE_PROPERTIES.has(last)) return false;
  if (objectKey && segs.length === 1) return true;
  if (imported.has(segs[0]) || exported) return false;
  return segs.length === 1 || segs[segs.length - 2] === "style" || /[A-Z]/.test(last);
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
 * With a stylesheet `languageId`, only the names `canNameToken` allows; with
 * a JS/TS one, no DOM style property (`isStyleProperty`).
 */
export function scanIdentifiers(
  text: string,
  languageId?: string,
): Map<string, IdentifierOccurrence[]> {
  const out = new Map<string, IdentifierOccurrence[]>();
  const re = new RegExp(EXPORT_IDENTIFIER.source, "g");
  const imported = JS_LANGUAGES.has(languageId ?? "") ? importedNames(text) : undefined;
  let line = 0;
  let lineStart = 0;
  let scanned = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const name = m[0];
    if (!/[A-Za-z]/.test(name)) continue; // 16px, -1, 0.5
    if (!canNameToken(name, languageId, text[m.index - 1])) continue;
    if (
      imported &&
      isStyleProperty(
        name,
        imported,
        /\bexport\s+(?:declare\s+)?(?:const|let|var)\s+$/.test(
          text.slice(Math.max(0, m.index - 40), m.index),
        ),
        /[{,]\s*$/.test(text.slice(Math.max(0, m.index - 40), m.index)) &&
          /^\s*:(?!:)/.test(text.slice(m.index + name.length, m.index + name.length + 40)),
      )
    )
      continue;
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
