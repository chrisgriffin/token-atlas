/**
 * Values written before DTCG 2025.10 — a color as a CSS string, a dimension
 * or duration as `"16px"` / `"200ms"` — rewritten to the object shapes the
 * spec now requires. `validate.ts` reports them; this is the fix.
 *
 * Each fix replaces only the `$value` node's bytes with a one-line object, so
 * the diff is that value and nothing else (invariant 1).
 * ponytail: whole-token values only, like the validation that flags them;
 * colors inside composites (a shadow's `color`) are left for when that check
 * reaches sub-values.
 */
import { findNodeAtLocation, parseTree } from "jsonc-parser";
import type { Edit } from "./serialize";
import type { TokenType } from "./types";
import { isReference, parseTokens } from "./parse";
import { indexTokens } from "./resolve";
import { fromCssColor } from "./color";

const UNITS: Partial<Record<TokenType, readonly string[]>> = {
  dimension: ["px", "rem"],
  duration: ["ms", "s"],
};

/** The 2025.10 shape of a legacy `value`, or undefined if it is not one this can read. */
export function upgradeLegacyValue(type: TokenType | undefined, value: unknown): unknown {
  if (typeof value !== "string" || isReference(value)) return undefined;
  if (type === "color") return fromCssColor(value) ?? undefined;
  const units = type && UNITS[type];
  const m = units && /^\s*(-?(?:\d+\.?\d*|\.\d+))\s*([a-z]+)\s*$/.exec(value);
  return m && units.includes(m[2]) ? { value: Number(m[1]), unit: m[2] } : undefined;
}

export interface LegacyFix {
  path: string[];
  /** Replaces the token's `$value` node. */
  edit: Edit;
  /** The token's whole property (key to closing brace), for matching a cursor. */
  span: { offset: number; length: number };
}

/** One fix per token in `text` whose `$value` is a legacy string this can convert. */
export function computeLegacyFixes(text: string): LegacyFix[] {
  const root = parseTree(text);
  if (!root) return [];
  const fixes: LegacyFix[] = [];
  for (const token of indexTokens(parseTokens(text)).values()) {
    if (token.isAlias) continue;
    const upgraded = upgradeLegacyValue(token.type, token.value);
    const node = upgraded !== undefined && findNodeAtLocation(root, [...token.path, "$value"]);
    const property = node && findNodeAtLocation(root, token.path)?.parent;
    if (!node || !property) continue;
    fixes.push({
      path: token.path,
      edit: { offset: node.offset, length: node.length, content: inline(upgraded) },
      span: { offset: property.offset, length: property.length },
    });
  }
  return fixes;
}

/** JSON on one line, spaced the way a person writes an inline object. */
function inline(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
  if (v && typeof v === "object") {
    const members = Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`);
    return `{ ${members.join(", ")} }`;
  }
  return JSON.stringify(v);
}
