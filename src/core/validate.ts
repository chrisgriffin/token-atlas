/**
 * Structural + semantic validation against the DTCG spec (subset, expanding).
 *
 * Current checks:
 *  - illegal characters in names (`{`, `}`, `.`)
 *  - non-alias tokens with no resolvable `$type`
 *  - dangling references (target does not exist), including those nested
 *    inside composite sub-values (e.g. a shadow's `color`)
 *  - reference cycles
 *  - `$ref` JSON Pointers that are malformed, point into another file, or
 *    name a property the target token does not have
 *  - `$extends` that is malformed, names nothing, names a token, or is part
 *    of a cycle (on the group's `$extends` key)
 *  - composite tokens must declare one of the composite `$type`s
 *  - `$value` shape for the primitives (DTCG 2025.10): a `color` must be
 *    `{ colorSpace, components }`, a `dimension` or `duration` must be
 *    `{ value, unit }` — legacy strings like "#ff0000" or "16px" are errors;
 *    a `number` must be a number, a `fontWeight` a number or a spec keyword,
 *    a `cubicBezier` exactly four numbers, a `fontFamily` a string or an
 *    array of strings
 */
import type {
  GroupNode,
  TokenDocumentModel,
  TokenNode,
  TokenType,
  ValidationIssue,
  ValidationResult,
} from "./types";
import { FONT_WEIGHT_KEYWORDS } from "./types";
import { isReference, parsePointer, referenceTarget, refPointer } from "./parse";
import { collectReferences, indexTokens, pointersIn } from "./resolve";

const ILLEGAL_NAME = /[{}.]/;

export function validate(
  model: TokenDocumentModel,
  external?: Map<string, TokenNode>,
  /** Which of this document's own keys count as defined — see `resolveAliases`. */
  localScope?: (key: string) => boolean,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const index = indexTokens(model);
  const has = (key: string): boolean =>
    (index.has(key) && (!localScope || localScope(key))) || external?.has(key) === true;

  checkNames(model.root, issues);
  checkExtends(model.root, issues);

  for (const token of index.values()) {
    // An inherited copy's findings are its origin's, reported there.
    if (token.inheritedFrom) continue;
    if (token.isAlias) {
      if (token.reference && !has(token.reference)) {
        issues.push({
          severity: "error",
          path: token.path,
          message: `Unresolved reference: {${token.reference}}`,
        });
      } else if (token.resolvedValue === undefined) {
        issues.push({
          severity: "error",
          path: token.path,
          message: `Reference cycle detected starting at {${token.reference}}`,
        });
      }
      continue;
    }

    // A `$ref` left in the resolved value did not resolve. One whose token is
    // missing is the dangling reference below; the rest are reported here.
    const pending = pointersIn(token.resolvedValue ?? token.value).filter((p) => {
      const target = parsePointer(p);
      return !target || has(target.key);
    });
    for (const p of pending) {
      issues.push({ severity: "error", path: token.path, message: pointerIssue(p) });
    }

    if (!token.type) {
      issues.push({
        severity: "warning",
        path: token.path,
        message: "Token has no $type and inherits none from any group.",
      });
    } else if (!pending.length) {
      // The resolved value when a `$ref` supplies part of it (§7.3).
      const value = pointersIn(token.value).length ? token.resolvedValue : token.value;
      const shape = valueShapeIssue(token.type, value);
      if (shape) issues.push({ severity: "error", path: token.path, message: shape });
    }

    // References can also live inside composite sub-values (shadow color,
    // gradient stops, …). Flag any whose target does not exist.
    for (const ref of collectReferences(token.value)) {
      if (!has(ref)) {
        issues.push({
          severity: "error",
          path: token.path,
          message: `Unresolved reference: {${ref}}`,
        });
      }
    }
  }

  return { issues };
}

function pointerIssue(pointer: string): string {
  if (/^[^#]+#/.test(pointer)) {
    return `Unsupported $ref "${pointer}": only same-document pointers ("#/…") are read.`;
  }
  if (!parsePointer(pointer)) {
    return `Invalid $ref "${pointer}": write a JSON Pointer such as "#/group/token/$value".`;
  }
  return `Unresolved reference: ${pointer} (no value at that path, or a reference cycle).`;
}

function checkExtends(group: GroupNode, issues: ValidationIssue[]): void {
  if (group.extends?.error) {
    issues.push({
      severity: "error",
      path: [...group.path, group.extends.via],
      message: group.extends.error,
    });
  }
  for (const child of group.children) {
    if (child.kind === "group" && !child.inheritedFrom) checkExtends(child, issues);
  }
}

function checkNames(group: GroupNode, issues: ValidationIssue[]): void {
  for (const child of group.children) {
    if (child.inheritedFrom) continue;
    if (ILLEGAL_NAME.test(child.name)) {
      issues.push({
        severity: "error",
        path: child.path,
        message: `Invalid name "${child.name}": names may not contain "{", "}", or ".".`,
      });
    }
    if (child.kind === "group") {
      checkNames(child, issues);
    }
  }
}

/**
 * The expected `$value` shape per object-valued primitive type, as
 * `[required member, typeof]` pairs. Only whole-token values are checked;
 * sub-values inside composites are a later expansion.
 */
const VALUE_SHAPES: Partial<Record<TokenType, Array<[string, string]>>> = {
  color: [
    ["colorSpace", "string"],
    ["components", "array"],
  ],
  dimension: [
    ["value", "number"],
    ["unit", "string"],
  ],
  duration: [
    ["value", "number"],
    ["unit", "string"],
  ],
};

/** Scalar / array primitives: a predicate and the wording of what is expected. */
const SCALAR_SHAPES: Partial<Record<TokenType, [(v: unknown) => boolean, string]>> = {
  number: [(v) => typeof v === "number" && Number.isFinite(v), "a number"],
  fontWeight: [
    (v) =>
      (typeof v === "number" && v >= 1 && v <= 1000) ||
      (typeof v === "string" && (FONT_WEIGHT_KEYWORDS as readonly string[]).includes(v)),
    "a number from 1 to 1000 or a spec keyword (thin … ultra-black)",
  ],
  cubicBezier: [
    (v) => Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number"),
    "an array of exactly four numbers [x1, y1, x2, y2]",
  ],
  fontFamily: [
    (v) => typeof v === "string" || (Array.isArray(v) && v.every((s) => typeof s === "string")),
    "a string or an array of strings",
  ],
};

function describeValue(value: unknown): string {
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (value === null) return "null";
  return `a ${typeof value}`;
}

function valueShapeIssue(type: TokenType, value: unknown): string | undefined {
  const scalar = SCALAR_SHAPES[type];
  if (scalar) {
    const [ok, expected] = scalar;
    return ok(value)
      ? undefined
      : `${type} $value must be ${expected} (DTCG 2025.10); got ${describeValue(value)}.`;
  }
  const shape = VALUE_SHAPES[type];
  if (!shape) return undefined;
  const expected = `{ ${shape.map(([k]) => k).join(", ")} }`;
  const ok =
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    shape.every(([k, t]) => {
      const v = (value as Record<string, unknown>)[k];
      return t === "array" ? Array.isArray(v) : typeof v === t;
    });
  if (ok) return undefined;
  const isObject = typeof value === "object" && value !== null && !Array.isArray(value);
  const got = Array.isArray(value)
    ? "an array"
    : isObject
      ? `an object with ${shape
          .flatMap(([k, t]) => {
            const v = (value as Record<string, unknown>)[k];
            if (v === undefined) return [`${k} missing`];
            const actual = Array.isArray(v) ? "array" : typeof v;
            return actual === t ? [] : [`${k} a ${actual} (expected ${t})`];
          })
          .join(", ")}`
      : `a ${typeof value}`;
  return `${type} $value must be an object ${expected} (DTCG 2025.10); got ${got}.`;
}

/**
 * A token's effective `$deprecated`: its own, else the nearest group's. `false`
 * at either level means not deprecated, so the answer is `true`, a reason, or
 * undefined.
 */
export function deprecation(token: TokenNode): true | string | undefined {
  const value = token.deprecated ?? token.inheritedDeprecated;
  if (typeof value === "string") return value || true;
  return value === true ? true : undefined;
}

/** The hint for a use of the deprecated token `key`. */
export function deprecationMessage(key: string, value: true | string): string {
  return value === true ? `{${key}} is deprecated.` : `{${key}} is deprecated: ${value}`;
}

export interface DeprecatedReference {
  /** JSON path of the string holding the reference, from the document root. */
  path: Array<string | number>;
  reference: string;
  message: string;
}

/**
 * Every reference in `model` whose direct target is deprecated: a
 * whole-`$value` alias, or one nested in a composite, spelled `{curly}` or as
 * a `$ref` pointer (reported at its `$ref` string). Only the direct target
 * counts, so an alias of an alias of a deprecated token is not itself a use.
 * The target is looked up as `resolveAliases` does: this document first
 * (within `localScope`), then `external`.
 */
export function deprecatedReferences(
  model: TokenDocumentModel,
  external?: Map<string, TokenNode>,
  localScope?: (key: string) => boolean,
): DeprecatedReference[] {
  const index = indexTokens(model);
  const lookup = (key: string) =>
    (localScope && !localScope(key) ? undefined : index.get(key)) ?? external?.get(key);
  const out: DeprecatedReference[] = [];
  const report = (reference: string | undefined, path: Array<string | number>) => {
    if (reference === undefined) return;
    const target = lookup(reference);
    const why = target && deprecation(target);
    if (why) out.push({ path, reference, message: deprecationMessage(reference, why) });
  };
  const walk = (value: unknown, path: Array<string | number>) => {
    const pointer = refPointer(value);
    if (isReference(value)) {
      report(referenceTarget(value), path);
    } else if (pointer !== undefined) {
      report(parsePointer(pointer)?.key, [...path, "$ref"]);
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, [...path, i]));
    } else if (typeof value === "object" && value !== null) {
      for (const [k, v] of Object.entries(value)) walk(v, [...path, k]);
    }
  };
  for (const token of index.values()) {
    // An inherited copy has no key in this document; its origin reports the use.
    if (!token.inheritedFrom)
      walk(token.value, token.valueFromRef ? token.path : [...token.path, "$value"]);
  }
  return out;
}
