/**
 * Which tokens may be referenced from a given spot, shared by the JSON
 * completion list and the visual editor's alias picker.
 */
import { getLocation } from "jsonc-parser";
import type { TokenNode, TokenType } from "./types";
import { isDtcgColor, toHex } from "./color";

/** True if aliasing `fromKey` -> `toKey` would create a reference cycle. */
export function wouldCycle(map: Map<string, TokenNode>, fromKey: string, toKey: string): boolean {
  let cursor: string | undefined = toKey;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === fromKey) return true;
    if (seen.has(cursor)) break; // pre-existing cycle not involving `from`
    seen.add(cursor);
    const node = map.get(cursor);
    cursor = node && node.isAlias && node.reference ? node.reference : undefined;
  }
  return false;
}

/** DTCG type expected for each composite sub-value key. */
const SUBVALUE_TYPES: Record<string, TokenType> = {
  color: "color",
  width: "dimension",
  style: "strokeStyle",
  offsetX: "dimension",
  offsetY: "dimension",
  blur: "dimension",
  spread: "dimension",
  dashArray: "dimension",
  fontFamily: "fontFamily",
  fontSize: "dimension",
  fontWeight: "fontWeight",
  letterSpacing: "dimension",
  lineHeight: "number",
  duration: "duration",
  delay: "duration",
  timingFunction: "cubicBezier",
  position: "number",
};

/**
 * Type a reference must have at `subPath` inside a token's `$value`
 * (the jsonc path segments after `$value`). An empty path is the whole
 * value; array items of a fontFamily stack are fontFamily. Undefined means
 * "no constraint".
 */
export function expectedTypeAt(
  tokenType: TokenType | undefined,
  subPath: ReadonlyArray<string | number>,
): TokenType | undefined {
  const keys = subPath.filter((s): s is string => typeof s === "string");
  if (keys.length === 0) return tokenType;
  return SUBVALUE_TYPES[keys[keys.length - 1]];
}

/** Tokens `selfKey` may reference: never itself, same type when `type` is
 *  set, and never one that already leads back to `selfKey`. */
export function aliasCandidates(
  tokens: Iterable<TokenNode>,
  selfKey: string,
  type: TokenType | undefined,
  map: Map<string, TokenNode>,
): TokenNode[] {
  const out: TokenNode[] = [];
  for (const t of tokens) {
    const key = t.path.join(".");
    if (key === selfKey) continue;
    if (type && (t.resolvedType ?? t.type) !== type) continue;
    if (wouldCycle(map, selfKey, key)) continue;
    out.push(t);
  }
  return out;
}

/** One-line description of a value for completion details. */
export function describeValue(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "object") return String(v);
  if (isDtcgColor(v)) return toHex(v) ?? "color";
  if (Array.isArray(v)) {
    if (v.length === 4 && v.every((n) => typeof n === "number")) {
      return `cubic-bezier(${v.join(", ")})`;
    }
    if (v.every((s) => typeof s === "string")) return v.join(", ");
  } else {
    const o = v as Record<string, unknown>;
    if (typeof o.value === "number" && typeof o.unit === "string") return `${o.value}${o.unit}`;
  }
  const json = JSON.stringify(v);
  return json.length > 60 ? `${json.slice(0, 57)}…` : json;
}

/**
 * Where an alias completion at `offset` should go. Inside a string it
 * replaces the interior; a string still missing its closing quote ends at the
 * cursor, because jsonc treats its last character as the quote. Outside a
 * string there is no range and the insert needs its own quotes.
 */
export function aliasEditSpan(
  text: string,
  offset: number,
): { inString: boolean; start?: number; end?: number } {
  const node = getLocation(text, offset).previousNode;
  if (!node || node.type !== "string") return { inString: false };
  const closed = node.length > 1 && text[node.offset + node.length - 1] === '"';
  const end = closed ? node.offset + node.length - 1 : Math.max(node.offset + node.length, offset);
  return { inString: true, start: node.offset + 1, end };
}

/** Where an alias may be completed: the token, the spot inside its value,
 *  and the text span a completion should replace. */
export interface AliasContext {
  /** Path of the token whose `$value` holds the cursor. */
  tokenPath: string[];
  /** jsonc path segments after `$value` (empty for the whole value). */
  subPath: Array<string | number>;
  inString: boolean;
  start?: number;
  end?: number;
}

/**
 * Whether an alias completion belongs at `offset`, and where it goes.
 * Only value positions under a token's `$value` qualify: never a property
 * key (typing `"col` inside a composite, or an empty key slot), and never
 * right after a number or keyword literal, where a quoted insert would
 * leave broken JSON.
 */
export function aliasCompletionContext(text: string, offset: number): AliasContext | undefined {
  const loc = getLocation(text, offset);
  const at = loc.path.indexOf("$value");
  if (at < 0 || loc.isAtPropertyKey) return undefined;
  const prev = loc.previousNode;
  if (prev && prev.type !== "string") return undefined;
  const tokenPath = loc.path.slice(0, at).filter((s): s is string => typeof s === "string");
  return { tokenPath, subPath: loc.path.slice(at + 1), ...aliasEditSpan(text, offset) };
}
