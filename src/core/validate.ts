/**
 * Structural + semantic validation against the DTCG spec.
 *
 * Current checks:
 *  - what parsing found: JSON syntax errors, unknown `$` keys (warnings)
 *  - illegal characters in names (`{`, `}`, `.`)
 *  - a `$type` the spec does not define, on a token or a group
 *  - non-alias tokens with no resolvable `$type`
 *  - dangling references (target does not exist), including those nested
 *    inside composite sub-values (e.g. a shadow's `color`), and an alias
 *    chain that ends at one
 *  - reference cycles, through whole-value aliases or composite sub-values
 *  - `$ref` JSON Pointers that are malformed, point into another file, or
 *    name a property the target token does not have
 *  - `$extends` that is malformed, names nothing, names a token, or is part
 *    of a cycle (on the group's `$extends` key)
 *  - a `$deprecated` reason whose replacement `{reference}` names nothing
 *  - `$value` shape (DTCG 2025.10): a `color` must be `{ colorSpace,
 *    components }` in a defined space, with 3 numeric-or-`"none"` components,
 *    an alpha from 0 to 1 and a 6-digit hex; a `dimension` or `duration`
 *    `{ value, unit }` in `px`/`rem` or `ms`/`s` — legacy strings like
 *    "#ff0000" or "16px" are errors; a `number` must be a number, a
 *    `fontWeight` a number or a spec keyword, a `cubicBezier` exactly four
 *    numbers, a `fontFamily` a string or an array of strings; a composite
 *    (§9) must have exactly its members, each checked as its own type, and a
 *    reference may stand in for any sub-value
 */
import type {
  GroupNode,
  TokenDocumentModel,
  TokenNode,
  TokenType,
  ValidationIssue,
  ValidationResult,
} from "./types"
import { ALL_TYPES, FONT_WEIGHT_KEYWORDS, UNITS } from "./types"
import { COLOR_SPACES } from "./color"
import { isReference, parsePointer, referenceTarget, refPointer } from "./parse"
import {
  collectReferences,
  indexTokens,
  pointersIn,
  referencesReach,
  scopedLookup,
  type Lookup,
} from "./resolve"

/** Characters a token or group name may not hold (§5.1.1). */
export const ILLEGAL_NAME = /[{}.]/

export function validate(
  model: TokenDocumentModel,
  external?: Map<string, TokenNode>,
  /** Which of this document's own keys count as defined — see `resolveAliases`. */
  localScope?: (key: string) => boolean,
): ValidationResult {
  const issues: ValidationIssue[] = [...(model.issues ?? [])]
  const index = indexTokens(model)
  const lookup = scopedLookup(index, external, localScope)
  const has = (key: string): boolean => lookup(key) !== undefined

  checkNames(model.root, issues)
  checkGroupTypes(model.root, issues)
  checkExtends(model.root, issues)
  checkReplacements(model.root, has, issues)

  for (const token of index.values()) {
    // An inherited copy's findings are its origin's, reported there.
    if (token.inheritedFrom) continue
    if (token.type !== undefined && !token.typeIsInherited) {
      const unknown = unknownType(token.type)
      if (unknown)
        issues.push({
          severity: "error",
          path: [...token.path, "$type"],
          message: unknown,
        })
    }
    if (token.isAlias) {
      if (token.reference && !has(token.reference)) {
        issues.push({
          severity: "error",
          path: token.path,
          message: `Unresolved reference: {${token.reference}}`,
        })
      } else if (token.resolvedValue === undefined && token.reference) {
        issues.push({
          severity: "error",
          path: token.path,
          message: chainIssue(token.reference, lookup),
        })
      }
      continue
    }

    // A `$ref` left in the resolved value did not resolve. One whose token is
    // missing is the dangling reference below; the rest are reported here.
    const pending = pointersIn(token.resolvedValue ?? token.value).filter(p => {
      const target = parsePointer(p)
      return !target || has(target.key)
    })
    for (const p of pending) {
      issues.push({
        severity: "error",
        path: token.path,
        message: pointerIssue(p),
      })
    }

    if (!token.type) {
      issues.push({
        severity: "warning",
        path: token.path,
        message: "Token has no $type and inherits none from any group.",
      })
    } else {
      // The resolved value when a `$ref` supplies part of it (§7.3). One left
      // unresolved is reported already, and the value it stands for is unknown.
      const value = pointersIn(token.value).length
        ? token.resolvedValue
        : token.value
      if (!pointersIn(value).length) {
        for (const message of valueIssues(token.type, value)) {
          issues.push({ severity: "error", path: token.path, message })
        }
      }
    }

    // References can also live inside composite sub-values (shadow color,
    // gradient stops, …): each must exist, and must not lead back here.
    const key = token.path.join(".")
    const stuck = collectReferences(token.resolvedValue).length > 0
    for (const ref of new Set(collectReferences(token.value))) {
      if (!has(ref)) {
        issues.push({
          severity: "error",
          path: token.path,
          message: `Unresolved reference: {${ref}}`,
        })
      } else if (stuck && referencesReach(lookup, ref, key)) {
        issues.push({
          severity: "error",
          path: token.path,
          message: `Reference cycle detected through {${ref}}`,
        })
      }
    }
  }

  return { issues }
}

/**
 * Why the alias chain from `start` does not resolve: the token at its end
 * that does not exist, or else a cycle.
 */
function chainIssue(start: string, lookup: Lookup): string {
  const seen = new Set<string>()
  for (
    let key: string | undefined = start;
    key !== undefined && !seen.has(key);
  ) {
    seen.add(key)
    const target = lookup(key)
    if (!target)
      return `Unresolved reference: {${start}} leads to {${key}}, which does not exist.`
    key = target.isAlias ? target.reference : undefined
  }
  return `Reference cycle detected starting at {${start}}`
}

/** The error for a `$type` the spec does not define, or undefined. */
function unknownType(type: unknown): string | undefined {
  return (ALL_TYPES as unknown[]).includes(type)
    ? undefined
    : `Unknown $type "${String(type)}": use one of ${ALL_TYPES.join(", ")}.`
}

function checkGroupTypes(group: GroupNode, issues: ValidationIssue[]): void {
  const unknown = group.type === undefined ? undefined : unknownType(group.type)
  if (unknown)
    issues.push({
      severity: "error",
      path: [...group.path, "$type"],
      message: unknown,
    })
  for (const child of group.children) {
    if (child.kind === "group" && !child.inheritedFrom)
      checkGroupTypes(child, issues)
  }
}

function pointerIssue(pointer: string): string {
  if (/^[^#]+#/.test(pointer)) {
    return `Unsupported $ref "${pointer}": only same-document pointers ("#/…") are read.`
  }
  if (!parsePointer(pointer)) {
    return `Invalid $ref "${pointer}": write a JSON Pointer such as "#/group/token/$value".`
  }
  return `Unresolved reference: ${pointer} (no value at that path, or a reference cycle).`
}

function checkExtends(group: GroupNode, issues: ValidationIssue[]): void {
  if (group.extends?.error) {
    issues.push({
      severity: "error",
      path: [...group.path, group.extends.via],
      message: group.extends.error,
    })
  }
  for (const child of group.children) {
    if (child.kind === "group" && !child.inheritedFrom)
      checkExtends(child, issues)
  }
}

/**
 * A `$deprecated` reason, on a token or a group, whose replacement does not
 * resolve: reported on that `$deprecated`, naming the replacement.
 */
function checkReplacements(
  group: GroupNode,
  has: (key: string) => boolean,
  issues: ValidationIssue[],
): void {
  const check = (node: GroupNode | TokenNode) => {
    const key = replacementKey(node.deprecated)
    if (key !== undefined && !has(key)) {
      const name = node.path.length ? `"${node.path.join(".")}"` : "This file"
      issues.push({
        severity: "warning",
        path: [...node.path, "$deprecated"],
        message: `${name} is deprecated in favour of {${key}}, which does not resolve.`,
      })
    }
  }
  check(group)
  for (const child of group.children) {
    if (child.inheritedFrom) continue
    if (child.kind === "group") checkReplacements(child, has, issues)
    else check(child)
  }
}

function checkNames(group: GroupNode, issues: ValidationIssue[]): void {
  for (const child of group.children) {
    if (child.inheritedFrom) continue
    if (ILLEGAL_NAME.test(child.name)) {
      issues.push({
        severity: "error",
        path: child.path,
        message: `Invalid name "${child.name}": names may not contain "{", "}", or ".".`,
      })
    }
    if (child.kind === "group") {
      checkNames(child, issues)
    }
  }
}

/**
 * The expected `$value` shape per object-valued primitive type, as
 * `[required member, typeof]` pairs.
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
}

/** Scalar / array primitives: a predicate and the wording of what is expected. */
const SCALAR_SHAPES: Partial<
  Record<TokenType, [(v: unknown) => boolean, string]>
> = {
  number: [v => typeof v === "number" && Number.isFinite(v), "a number"],
  fontWeight: [
    v =>
      (typeof v === "number" && v >= 1 && v <= 1000) ||
      (typeof v === "string" &&
        (FONT_WEIGHT_KEYWORDS as readonly string[]).includes(v)),
    "a number from 1 to 1000 or a spec keyword (thin … ultra-black)",
  ],
  cubicBezier: [
    v =>
      Array.isArray(v) && v.length === 4 && v.every(n => typeof n === "number"),
    "an array of exactly four numbers [x1, y1, x2, y2]",
  ],
  fontFamily: [
    v =>
      typeof v === "string" ||
      (Array.isArray(v) && v.every(s => typeof s === "string")),
    "a string or an array of strings",
  ],
}

function describeValue(value: unknown): string {
  if (Array.isArray(value)) return `an array of ${value.length}`
  if (value === null) return "null"
  return `a ${typeof value}`
}

/** A string or number as written, anything else by its kind. */
const show = (v: unknown) =>
  typeof v === "string" || typeof v === "number"
    ? JSON.stringify(v)
    : describeValue(v)

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

/** A reference may stand in for any sub-value (§9). */
const isRef = (v: unknown) => isReference(v) || refPointer(v) !== undefined

/** The problems with one member of a composite, `at` naming it (`shadow $value.color`). */
type Check = (value: unknown, at: string) => string[]

const typed =
  (type: TokenType): Check =>
  (value, at) =>
    valueIssues(type, value).map(m => `${at}: ${m}`)

const oneOf =
  (allowed: readonly unknown[], wording: string): Check =>
  (value, at) =>
    isRef(value) || allowed.includes(value)
      ? []
      : [`${at} must be ${wording} (DTCG 2025.10); got ${show(value)}.`]

const STROKE_KEYWORDS = [
  "solid",
  "dashed",
  "dotted",
  "double",
  "groove",
  "ridge",
  "outset",
  "inset",
]

/** Each object-valued composite's members (§9.3–§9.8). */
const MEMBERS: Partial<Record<TokenType, Record<string, Check>>> = {
  strokeStyle: {
    dashArray: (value, at) =>
      isRef(value)
        ? []
        : Array.isArray(value)
          ? value.flatMap((d, i) => typed("dimension")(d, `${at}[${i}]`))
          : [
              `${at} must be an array of dimensions (DTCG 2025.10); got ${show(value)}.`,
            ],
    lineCap: oneOf(["round", "butt", "square"], `"round", "butt" or "square"`),
  },
  border: {
    color: typed("color"),
    width: typed("dimension"),
    style: typed("strokeStyle"),
  },
  transition: {
    duration: typed("duration"),
    delay: typed("duration"),
    timingFunction: typed("cubicBezier"),
  },
  shadow: {
    color: typed("color"),
    offsetX: typed("dimension"),
    offsetY: typed("dimension"),
    blur: typed("dimension"),
    spread: typed("dimension"),
    inset: oneOf([true, false], "true or false"),
  },
  gradient: { color: typed("color"), position: typed("number") },
  typography: {
    fontFamily: typed("fontFamily"),
    fontSize: typed("dimension"),
    fontWeight: typed("fontWeight"),
    letterSpacing: typed("dimension"),
    lineHeight: typed("number"),
  },
}

/** Members a composite may leave out. */
const OPTIONAL = new Set(["inset"])

/** Everything wrong with `value` as a `type` value; none for a reference or an unknown type. */
function valueIssues(type: TokenType, value: unknown): string[] {
  if (isRef(value)) return []
  if (type === "strokeStyle" && !isObject(value)) {
    return STROKE_KEYWORDS.includes(value as string)
      ? []
      : [
          `strokeStyle $value must be one of ${STROKE_KEYWORDS.join(", ")}, or an object { dashArray, lineCap } (DTCG 2025.10); got ${show(value)}.`,
        ]
  }
  // A shadow may be one shadow or several (§9.6); a gradient is always stops (§9.7).
  if ((type === "shadow" && Array.isArray(value)) || type === "gradient") {
    if (!Array.isArray(value)) {
      return [
        `gradient $value must be an array of { color, position } stops (DTCG 2025.10); got ${describeValue(value)}.`,
      ]
    }
    return value.flatMap((item, i) => objectIssues(type, `$value[${i}]`, item))
  }
  if (MEMBERS[type]) return objectIssues(type, "$value", value)
  const issue = primitiveIssue(type, value)
  return issue ? [issue] : []
}

/** A composite object's members: each checked, none missing, none extra. */
function objectIssues(
  type: TokenType,
  label: string,
  value: unknown,
): string[] {
  if (isRef(value)) return []
  const members = MEMBERS[type]!
  const at = `${type} ${label}`
  const required = Object.keys(members).filter(m => !OPTIONAL.has(m))
  if (!isObject(value)) {
    return [
      `${at} must be an object { ${required.join(", ")} } (DTCG 2025.10); got ${describeValue(value)}.`,
    ]
  }
  const out = Object.entries(members).flatMap(([name, check]) =>
    name in value ? check(value[name], `${at}.${name}`) : [],
  )
  const missing = required.filter(m => !(m in value))
  if (missing.length)
    out.push(`${at} is missing ${missing.join(", ")} (DTCG 2025.10).`)
  const extra = Object.keys(value).filter(k => !(k in members))
  if (extra.length) {
    out.push(
      `${at} has ${extra.length === 1 ? "a member" : "members"} the spec does not define: ${extra.join(", ")} (DTCG 2025.10).`,
    )
  }
  return out
}

function primitiveIssue(type: TokenType, value: unknown): string | undefined {
  const scalar = SCALAR_SHAPES[type]
  if (scalar) {
    const [ok, expected] = scalar
    return ok(value)
      ? undefined
      : `${type} $value must be ${expected} (DTCG 2025.10); got ${describeValue(value)}.`
  }
  const shape = VALUE_SHAPES[type]
  if (!shape) return undefined
  const expected = `{ ${shape.map(([k]) => k).join(", ")} }`
  const ok =
    isObject(value) &&
    shape.every(([k, t]) => {
      const v = value[k]
      return t === "array" ? Array.isArray(v) : typeof v === t
    })
  if (!ok) {
    const got = Array.isArray(value)
      ? "an array"
      : isObject(value)
        ? `an object with ${shape
            .flatMap(([k, t]) => {
              const v = value[k]
              if (v === undefined) return [`${k} missing`]
              const actual = Array.isArray(v) ? "array" : typeof v
              return actual === t ? [] : [`${k} a ${actual} (expected ${t})`]
            })
            .join(", ")}`
        : `a ${typeof value}`
    return `${type} $value must be an object ${expected} (DTCG 2025.10); got ${got}.`
  }
  const units = UNITS[type]
  if (units && !units.includes(value.unit as string)) {
    return `${type} unit must be ${units.map(u => `"${u}"`).join(" or ")} (DTCG 2025.10); got ${show(value.unit)}.`
  }
  return type === "color" ? colorIssue(value) : undefined
}

/** A color object's space, components, alpha and hex (Color Module §4). */
function colorIssue(color: Record<string, unknown>): string | undefined {
  if (!(COLOR_SPACES as readonly unknown[]).includes(color.colorSpace)) {
    return `color colorSpace ${show(color.colorSpace)} is not one the spec defines (${COLOR_SPACES.join(", ")}).`
  }
  const components = color.components as unknown[]
  const bad = components.find(
    c => !(typeof c === "number" && Number.isFinite(c)) && c !== "none",
  )
  if (components.length !== 3 || bad !== undefined) {
    const got =
      components.length !== 3 ? describeValue(components) : JSON.stringify(bad)
    return `color components must be 3 numbers or "none"; got ${got}.`
  }
  const { alpha, hex } = color
  if (
    alpha !== undefined &&
    !(typeof alpha === "number" && alpha >= 0 && alpha <= 1)
  ) {
    return `color alpha must be a number from 0 to 1; got ${show(alpha)}.`
  }
  if (
    hex !== undefined &&
    !(typeof hex === "string" && /^#[0-9a-fA-F]{6}$/.test(hex))
  ) {
    return `color hex must be a 6-digit CSS hex color such as "#ff0000"; got ${show(hex)}.`
  }
  return undefined
}

/**
 * A token's effective `$deprecated`: its own, else the nearest group's. `false`
 * at either level means not deprecated, so the answer is `true`, a reason, or
 * undefined.
 */
export function deprecation(token: TokenNode): true | string | undefined {
  const value = token.deprecated ?? token.inheritedDeprecated
  if (typeof value === "string") return value || true
  return value === true ? true : undefined
}

/** The hint for a use of the deprecated token `key`. */
export function deprecationMessage(key: string, value: true | string): string {
  return value === true
    ? `{${key}} is deprecated.`
    : `{${key}} is deprecated: ${value}`
}

/**
 * The token a `$deprecated` reason names as its replacement: the path in the
 * first `{reference}` the string holds (spec 015 — DTCG defines no successor
 * field, docs/adr/ADR-003-deprecation-replacement.md). `true`, `false` and a
 * reason with no reference name none.
 */
export function replacementKey(
  deprecated: boolean | string | undefined,
): string | undefined {
  if (typeof deprecated !== "string") return undefined
  const key = /\{([^{}]+)\}/.exec(deprecated)?.[1].trim()
  return key || undefined
}

/**
 * A deprecated token's replacement, looked up with `lookup` (document first,
 * then the workspace index, as every reference is): its key, and the token
 * when it resolves. Undefined when the token is not deprecated, its reason
 * names no replacement, or names the token itself.
 */
export function deprecationReplacement(
  token: TokenNode,
  lookup: (key: string) => TokenNode | undefined,
): { key: string; token: TokenNode | undefined } | undefined {
  const why = deprecation(token)
  const key = replacementKey(why === true ? undefined : why)
  if (key === undefined || key === token.path.join(".")) return undefined
  return { key, token: lookup(key) }
}

export interface DeprecatedReference {
  /** JSON path of the string holding the reference, from the document root. */
  path: Array<string | number>
  reference: string
  message: string
  /** The key the deprecated target names as its replacement, when it names one that resolves. */
  replacement?: string
}

/** One reference a token in a document makes, and the token it names. */
export interface TokenReference {
  /** JSON path of the string holding the reference, from the document root. */
  path: Array<string | number>
  reference: string
  /** The direct target, looked up as `resolveAliases` does; undefined when nothing defines it. */
  target: TokenNode | undefined
}

/**
 * Every reference a token in `model` makes: a whole-`$value` alias, or one
 * nested in a composite, spelled `{curly}` or as a `$ref` pointer (reported
 * at its `$ref` string), with its direct target looked up this document
 * first (within `localScope`), then `external`. The one walker the
 * deprecation readers and the delete prompt share (spec 019).
 */
export function tokenReferences(
  model: TokenDocumentModel,
  external?: Map<string, TokenNode>,
  localScope?: (key: string) => boolean,
): TokenReference[] {
  const lookup = scopedLookup(indexTokens(model), external, localScope)
  const out: TokenReference[] = []
  const report = (
    reference: string | undefined,
    path: Array<string | number>,
  ) => {
    if (reference !== undefined)
      out.push({ path, reference, target: lookup(reference) })
  }
  const walk = (value: unknown, path: Array<string | number>) => {
    const pointer = refPointer(value)
    if (isReference(value)) {
      report(referenceTarget(value), path)
    } else if (pointer !== undefined) {
      report(parsePointer(pointer)?.key, [...path, "$ref"])
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, [...path, i]))
    } else if (typeof value === "object" && value !== null) {
      for (const [k, v] of Object.entries(value)) walk(v, [...path, k])
    }
  }
  for (const token of indexTokens(model).values()) {
    // An inherited copy has no key in this document; its origin reports the use.
    if (!token.inheritedFrom)
      walk(
        token.value,
        token.valueFromRef ? token.path : [...token.path, "$value"],
      )
  }
  return out
}

/**
 * Every reference in `model` whose direct target is deprecated
 * (tokenReferences). Only the direct target counts, so an alias of an alias
 * of a deprecated token is not itself a use.
 */
export function deprecatedReferences(
  model: TokenDocumentModel,
  external?: Map<string, TokenNode>,
  localScope?: (key: string) => boolean,
): DeprecatedReference[] {
  const lookup = scopedLookup(indexTokens(model), external, localScope)
  const out: DeprecatedReference[] = []
  for (const { path, reference, target } of tokenReferences(
    model,
    external,
    localScope,
  )) {
    const why = target && deprecation(target)
    if (!why) continue
    const found: DeprecatedReference = {
      path,
      reference,
      message: deprecationMessage(reference, why),
    }
    const next = deprecationReplacement(target, lookup)
    if (next?.token) found.replacement = next.key
    out.push(found)
  }
  return out
}
