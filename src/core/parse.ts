/**
 * Parse DTCG JSON text into the in-memory {@link TokenDocumentModel}.
 *
 * A node is a *token* if it carries `$value`, otherwise a *group*. `$type`
 * cascades from groups to descendants unless overridden. References — curly
 * `{group.token}` and JSON Pointer `{ "$ref": "#/group/token/$value" }` — and
 * a group's `$extends` are detected here but followed later (resolve.ts,
 * extends.ts).
 */
import { getLocation } from "jsonc-parser";
import { pointerSegments } from "./resolver";
import type { GroupNode, TokenDocumentModel, TokenNode, TokenType } from "./types";

const REFERENCE_RE = /^\{([^{}]+)\}$/;

/** Tokens in `group` and every group under it. */
export function countTokens(group: GroupNode): number {
  let n = 0;
  for (const c of group.children) n += c.kind === "token" ? 1 : countTokens(c);
  return n;
}

export function isReference(value: unknown): value is string {
  return typeof value === "string" && REFERENCE_RE.test(value.trim());
}

export function referenceTarget(value: string): string | undefined {
  const match = value.trim().match(REFERENCE_RE);
  return match ? match[1] : undefined;
}

/**
 * A same-document JSON Pointer (`#/a/b/$value/components/0`, DTCG §7.1.2),
 * split at its first `$`-segment: `key` is the token (or group) path, `a.b`,
 * and `sub` the rest, `["$value", "components", "0"]`. Token names never
 * start with `$`, so the split is unambiguous. Undefined for anything that is
 * not `#/` plus at least one name, a pointer into another file included.
 */
export function parsePointer(pointer: string): { key: string; sub: string[] } | undefined {
  if (!pointer.startsWith("#/")) return undefined;
  const segments = pointerSegments(pointer.slice(1));
  const at = segments.findIndex((s) => s.startsWith("$"));
  const path = at === -1 ? segments : segments.slice(0, at);
  if (!path.length || path.includes("")) return undefined;
  return { key: path.join("."), sub: at === -1 ? [] : segments.slice(at) };
}

/** The pointer of a `{ "$ref": "…" }` reference object, or undefined. */
export function refPointer(value: unknown): string | undefined {
  return isPlainObject(value) && typeof value["$ref"] === "string" ? value["$ref"] : undefined;
}

/** The path a curly reference or a `#/…` pointer names. */
export function referenceKey(value: string): string | undefined {
  return referenceTarget(value) ?? parsePointer(value)?.key;
}

/**
 * If the cursor `offset` in `text` lands inside a reference string, returns
 * the path it names: a curly reference within a `$value` — whole-value
 * (`"$value": "{group.token}"`) or embedded in a composite value
 * (`"$value": { "color": "{group.token}" }`) — or any `$ref` pointer or
 * `$extends` value (which names a group). Otherwise returns `undefined`.
 */
export function tokenReferenceAtOffset(text: string, offset: number): string | undefined {
  const loc = getLocation(text, offset);
  const node = loc.previousNode;
  if (!node || node.type !== "string" || typeof node.value !== "string") return undefined;
  const path = loc.path as ReadonlyArray<string | number>;
  const last = path[path.length - 1];
  if (last === "$ref" || last === "$extends") return referenceKey(node.value);
  if (!path.includes("$value")) return undefined;
  const m = node.value.trim().match(REFERENCE_RE);
  return m ? m[1] : undefined;
}

export function parseTokens(text: string): TokenDocumentModel {
  let data: unknown;
  try {
    data = text.trim().length ? JSON.parse(text) : {};
  } catch {
    // Malformed JSON yields an empty document; validation/host surface the error.
    data = {};
  }
  const obj = isPlainObject(data) ? data : {};
  return { root: buildGroup("", [], obj, undefined, undefined, obj) };
}

function buildGroup(
  name: string,
  path: string[],
  obj: Record<string, unknown>,
  inheritedType: TokenType | undefined,
  inheritedDeprecated: boolean | string | undefined,
  doc: Record<string, unknown>,
): GroupNode {
  const ownType = obj["$type"] as TokenType | undefined;
  const effectiveType = ownType ?? inheritedType;
  const deprecated = obj["$deprecated"] as boolean | string | undefined;
  // `$deprecated` cascades like `$type`: the nearest declaration wins, `false` included.
  const effectiveDeprecated = deprecated ?? inheritedDeprecated;

  const group: GroupNode = {
    kind: "group",
    name,
    path,
    type: ownType,
    inheritedType: ownType ? undefined : inheritedType,
    description: obj["$description"] as string | undefined,
    deprecated,
    extensions: obj["$extensions"] as Record<string, unknown> | undefined,
    children: [],
  };
  // §6.4.1: a group-level `$ref` is `$extends` spelled the JSON Schema way.
  const ext = "$extends" in obj ? obj["$extends"] : obj["$ref"];
  if (ext !== undefined) {
    group.extends = {
      via: "$extends" in obj ? "$extends" : "$ref",
      target: typeof ext === "string" ? groupReference(ext) : undefined,
    };
  }

  for (const key of Object.keys(obj)) {
    if (key.startsWith("$")) continue;
    const childPath = [...path, key];
    const val = obj[key];
    if (!isPlainObject(val)) continue; // tokens & groups are always objects
    if ("$value" in val || isRefToken(val, doc)) {
      group.children.push(buildToken(key, childPath, val, effectiveType, effectiveDeprecated));
    } else {
      group.children.push(buildGroup(key, childPath, val, effectiveType, effectiveDeprecated, doc));
    }
  }

  return group;
}

/** `{a.b}` or `#/a/b`: what `$extends` may name (§6.4.5). */
function groupReference(value: string): string | undefined {
  const pointer = parsePointer(value);
  return referenceTarget(value) ?? (pointer && !pointer.sub.length ? pointer.key : undefined);
}

/**
 * An object with `$ref` and no `$value` is a token whose value the pointer
 * supplies (§6.6.2 Example 21, §7.1.2 Example 32) — unless it holds tokens or
 * groups of its own, or points at a group in this document, which makes it a
 * group extending that one (§6.4.1). A pointer that does not parse stays a
 * token, so validation reports it.
 */
function isRefToken(obj: Record<string, unknown>, doc: Record<string, unknown>): boolean {
  if (typeof obj["$ref"] !== "string") return false;
  if (Object.keys(obj).some((k) => !k.startsWith("$") && isPlainObject(obj[k]))) return false;
  const pointer = parsePointer(obj["$ref"]);
  if (!pointer || pointer.sub.length) return true;
  let target: unknown = doc;
  for (const k of pointer.key.split(".")) target = isPlainObject(target) ? target[k] : undefined;
  return !(isPlainObject(target) && !("$value" in target) && !("$ref" in target));
}

function buildToken(
  name: string,
  path: string[],
  obj: Record<string, unknown>,
  inheritedType: TokenType | undefined,
  inheritedDeprecated: boolean | string | undefined,
): TokenNode {
  const rawValue = "$value" in obj ? obj["$value"] : { $ref: obj["$ref"] };
  const ownType = obj["$type"] as TokenType | undefined;
  // A pointer to the whole token or its `$value` is an alias like `{a.b}`;
  // one reaching into the value is a property reference, resolved in place.
  const pointer = refPointer(rawValue);
  const target = pointer === undefined ? undefined : parsePointer(pointer);
  const ref = isReference(rawValue)
    ? referenceTarget(rawValue as string)
    : target && (!target.sub.length || (target.sub.length === 1 && target.sub[0] === "$value"))
      ? target.key
      : undefined;

  return {
    kind: "token",
    name,
    path,
    type: ownType ?? inheritedType,
    typeIsInherited: ownType === undefined && inheritedType !== undefined,
    value: rawValue,
    description: obj["$description"] as string | undefined,
    deprecated: obj["$deprecated"] as boolean | string | undefined,
    inheritedDeprecated,
    extensions: obj["$extensions"] as Record<string, unknown> | undefined,
    ...("$value" in obj ? {} : { valueFromRef: true as const }),
    isAlias: ref !== undefined,
    reference: ref,
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
