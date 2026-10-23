/**
 * Values written before DTCG 2025.10 — a color as a CSS string, a dimension
 * or duration as `"16px"` / `"200ms"` — rewritten to the object shapes the
 * spec now requires. `validate.ts` reports them; this is the fix.
 *
 * Each fix replaces only the legacy value's bytes — the whole `$value`, or one
 * sub-value of a composite, such as a shadow's `color` — with a one-line
 * object, so the diff is that value and nothing else (invariant 1).
 */
import { findNodeAtLocation, parseTree } from "jsonc-parser";
import { inline, type Edit } from "./serialize";
import { UNITS, type TokenType } from "./types";
import { isReference, parseTokens } from "./parse";
import { indexTokens } from "./resolve";
import { fromCssColor } from "./color";
import { expectedTypeAt } from "./aliases";

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

/**
 * One fix per legacy string this can convert: a token's whole `$value`, or
 * each sub-value of a composite, typed by its member (`expectedTypeAt`).
 */
export function computeLegacyFixes(text: string): LegacyFix[] {
  const root = parseTree(text);
  if (!root) return [];
  const fixes: LegacyFix[] = [];
  for (const token of indexTokens(parseTokens(text)).values()) {
    if (token.isAlias) continue;
    const property = findNodeAtLocation(root, token.path)?.parent;
    const visit = (value: unknown, sub: Array<string | number>): void => {
      if (Array.isArray(value)) return value.forEach((v, i) => visit(v, [...sub, i]));
      if (value && typeof value === "object") {
        return Object.entries(value).forEach(([k, v]) => visit(v, [...sub, k]));
      }
      const upgraded = upgradeLegacyValue(expectedTypeAt(token.type, sub), value);
      const node =
        upgraded !== undefined && findNodeAtLocation(root, [...token.path, "$value", ...sub]);
      if (!node || !property) return;
      fixes.push({
        path: token.path,
        edit: { offset: node.offset, length: node.length, content: inline(upgraded) },
        span: { offset: property.offset, length: property.length },
      });
    };
    visit(token.value, []);
  }
  return fixes;
}
