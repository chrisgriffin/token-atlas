/**
 * Alias resolution with cycle detection.
 *
 * Two flavours of reference are resolved:
 *  - **Whole-$value** aliases (`"$value": "{group.token}"`), followed hop by
 *    hop to a concrete value.
 *  - **References inside composite sub-values** (e.g. a shadow's
 *    `color: "{deep.a}"`, or a gradient stop's color) — the value object is
 *    walked recursively and every nested reference string is substituted.
 *
 * Both spellings count: curly `{group.token}`, and a JSON Pointer object
 * `{ "$ref": "#/group/token/$value/…" }`, which can also reach into a value
 * (DTCG §7.3). Group `$extends` is expanded first (extends.ts).
 *
 * If a cycle or a dangling reference is hit, a *whole-$value* alias leaves
 * `resolvedValue` `undefined` (validation reports it), while a *sub-value*
 * reference is preserved verbatim so the rest of the composite still resolves.
 */
import { expandExtends } from "./extends";
import { isReference, parsePointer, refPointer, referenceTarget } from "./parse";
import type { GroupNode, TokenDocumentModel, TokenNode, TokenType } from "./types";

/** Build a flat index from dotted path -> token. */
export function indexTokens(model: TokenDocumentModel): Map<string, TokenNode> {
  const index = new Map<string, TokenNode>();
  walk(model.root, index);
  return index;
}

function walk(group: GroupNode, out: Map<string, TokenNode>): void {
  for (const child of group.children) {
    if (child.kind === "token") {
      out.set(child.path.join("."), child);
    } else {
      walk(child, out);
    }
  }
}

export type Lookup = (key: string) => TokenNode | undefined;

/**
 * Where a reference finds its token: this document first (only the keys
 * `localScope` allows, when given), then `external` (invariant 4).
 */
export function scopedLookup(
  index: Map<string, TokenNode>,
  external?: Map<string, TokenNode>,
  localScope?: (key: string) => boolean,
): Lookup {
  return (key) =>
    (localScope && !localScope(key) ? undefined : index.get(key)) ?? external?.get(key);
}

/**
 * Whether following references from the token at `from` — a whole-value
 * alias, or any reference inside its value, `$ref` pointers included —
 * reaches `to`. A cycle that does not pass through `to` ends the walk.
 */
export function referencesReach(lookup: Lookup, from: string, to: string): boolean {
  const stack = [from];
  const seen = new Set<string>();
  while (stack.length) {
    const key = stack.pop()!;
    if (key === to) return true;
    if (seen.has(key)) continue;
    seen.add(key);
    const token = lookup(key);
    if (token) stack.push(...collectReferences(token.value));
  }
  return false;
}

/** The `$type` a token declares itself, not one its group gives it. */
const ownType = (token: TokenNode) => (token.typeIsInherited ? undefined : token.type);

/**
 * Resolve every token's alias chain in place.
 *
 * `external` lets references resolve against tokens defined in *other* files
 * (multi-file theming): the local index is consulted first, then external.
 */
export function resolveAliases(
  model: TokenDocumentModel,
  external?: Map<string, TokenNode>,
  /**
   * Which of this document's own keys may satisfy a reference. A Tokens
   * Studio theme turns whole sets off, and a set it disables defines nothing
   * — including for references written in the same file, which local-first
   * resolution would otherwise excuse. Omit it and every local key counts,
   * which is the ordinary single-set case.
   */
  localScope?: (key: string) => boolean,
): Map<string, TokenNode> {
  expandExtends(model.root, external);
  const index = indexTokens(model);
  const lookup = scopedLookup(index, external, localScope);

  for (const token of index.values()) {
    if (token.isAlias && token.reference) {
      // Whole-$value alias: follow the chain to a concrete (possibly
      // composite, possibly itself containing references) value. With no
      // `$type` of its own, its type is its target's before its group's (§5.2.2).
      const resolved = resolveReference(token.reference, lookup, new Set());
      token.resolvedValue = resolved?.value;
      token.resolvedType = ownType(token) ?? resolved?.type ?? token.type;
    } else {
      // Not an alias, but composite sub-values may still hold references.
      token.resolvedValue = deepResolveValue(token.value, lookup, new Set());
      token.resolvedType = token.type;
    }
  }

  return index;
}

/**
 * Resolve a single reference target to a concrete value + type, following any
 * whole-$value alias chain. `seen` carries the references already visited on
 * this path so cycles terminate. Returns `undefined` for a cycle or a dangling
 * target.
 */
function resolveReference(
  ref: string,
  lookup: Lookup,
  seen: Set<string>,
): { value: unknown; type?: TokenType } | undefined {
  if (seen.has(ref)) return undefined; // cycle
  const token = lookup(ref);
  if (!token) return undefined; // dangling
  const next = new Set(seen).add(ref);

  if (token.isAlias && token.reference) {
    const inner = resolveReference(token.reference, lookup, next);
    if (!inner) return undefined;
    // The nearest declared $type along the chain wins, then a group's.
    return { value: inner.value, type: ownType(token) ?? inner.type ?? token.type };
  }

  return { value: deepResolveValue(token.value, lookup, next), type: token.type };
}

/**
 * Walk a value, replacing every nested reference string with the value it
 * resolves to. Non-reference primitives pass through untouched; unresolvable
 * references (cycle or dangling) are preserved verbatim.
 */
function deepResolveValue(value: unknown, lookup: Lookup, seen: Set<string>): unknown {
  if (isReference(value)) {
    const ref = referenceTarget(value)!;
    const resolved = resolveReference(ref, lookup, seen);
    return resolved === undefined ? value : resolved.value;
  }
  const pointer = refPointer(value);
  if (pointer !== undefined) {
    const target = parsePointer(pointer);
    const resolved = target && resolveReference(target.key, lookup, seen);
    const found = resolved && pointerValue(resolved, target.sub);
    return found === undefined ? value : found;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepResolveValue(item, lookup, seen));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      out[key] = deepResolveValue(value[key], lookup, seen);
    }
    return out;
  }
  return value;
}

/**
 * What a pointer's `sub` path (after the token path) names in a resolved
 * token: nothing or `$value` is the value, deeper segments index into it,
 * `$type` is the type. Undefined when nothing is there.
 */
function pointerValue(token: { value: unknown; type?: TokenType }, sub: string[]): unknown {
  if (!sub.length) return token.value;
  if (sub[0] === "$type") return sub.length === 1 ? token.type : undefined;
  if (sub[0] !== "$value") return undefined;
  let at: unknown = token.value;
  for (const segment of sub.slice(1)) {
    if (Array.isArray(at)) at = /^\d+$/.test(segment) ? at[Number(segment)] : undefined;
    else at = isPlainObject(at) ? at[segment] : undefined;
  }
  return at;
}

/**
 * Resolve every reference nested inside a value against `lookup`, following
 * alias chains. Unresolvable references are preserved verbatim. Used by hovers
 * that have a token but not a whole document model to run `resolveAliases` on.
 */
export function resolveValue(value: unknown, lookup: Lookup): unknown {
  return deepResolveValue(value, lookup, new Set());
}

/**
 * Collect every reference target nested inside a value (composite sub-values).
 * The value itself, if a whole-$value reference string, is included too — so
 * callers that only want sub-references should pass a non-alias token's value.
 */
export function collectReferences(value: unknown, out: string[] = []): string[] {
  const pointer = refPointer(value);
  if (isReference(value)) {
    out.push(referenceTarget(value)!);
  } else if (pointer !== undefined) {
    const target = parsePointer(pointer);
    if (target) out.push(target.key);
  } else if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, out);
  } else if (isPlainObject(value)) {
    for (const key of Object.keys(value)) collectReferences(value[key], out);
  }
  return out;
}

/** Every `$ref` pointer in a value, as written; after resolution, the ones left unresolved. */
export function pointersIn(value: unknown, out: string[] = []): string[] {
  const pointer = refPointer(value);
  if (pointer !== undefined) out.push(pointer);
  else if (Array.isArray(value)) for (const item of value) pointersIn(item, out);
  else if (isPlainObject(value)) for (const key of Object.keys(value)) pointersIn(value[key], out);
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
