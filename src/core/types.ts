/**
 * Token Atlas core — DTCG (Design Tokens Format Module 2025.10) type model.
 *
 * This module is pure TypeScript: no `vscode`, no DOM. It is the single source
 * of truth for what a token *is*, and is unit-testable in isolation.
 */

/** All `$type` values defined by the stable DTCG spec. */
export type TokenType =
  // primitive
  | "color"
  | "dimension"
  | "fontFamily"
  | "fontWeight"
  | "duration"
  | "cubicBezier"
  | "number"
  // composite
  | "strokeStyle"
  | "border"
  | "transition"
  | "shadow"
  | "gradient"
  | "typography";

export const PRIMITIVE_TYPES: TokenType[] = [
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "duration",
  "cubicBezier",
  "number",
];

export const COMPOSITE_TYPES: TokenType[] = [
  "strokeStyle",
  "border",
  "transition",
  "shadow",
  "gradient",
  "typography",
];

export const ALL_TYPES: TokenType[] = [...PRIMITIVE_TYPES, ...COMPOSITE_TYPES];

/** Named `fontWeight` values the DTCG 2025.10 spec accepts alongside numbers 1–1000. */
export const FONT_WEIGHT_KEYWORDS = [
  "thin",
  "hairline",
  "extra-light",
  "ultra-light",
  "light",
  "normal",
  "regular",
  "book",
  "medium",
  "semi-bold",
  "demi-bold",
  "bold",
  "extra-bold",
  "ultra-bold",
  "black",
  "heavy",
  "extra-black",
  "ultra-black",
] as const;

/** A leaf token (any object carrying `$value`). */
export interface TokenNode {
  kind: "token";
  name: string;
  /** Full path from the document root, e.g. ["color", "brand", "primary"]. */
  path: string[];
  /** Declared `$type`, or the type inherited from an ancestor group. */
  type?: TokenType;
  /** Whether `type` was declared on this token vs. inherited. */
  typeIsInherited: boolean;
  /** Raw `$value` exactly as written (may be an alias string). */
  value: unknown;
  description?: string;
  deprecated?: boolean | string;
  /** The nearest ancestor group's `$deprecated`, which applies when the token sets none. */
  inheritedDeprecated?: boolean | string;
  extensions?: Record<string, unknown>;
  /** Set on tokens loaded from another file (multi-file theming). */
  sourceFile?: string;
  /**
   * Set on a token a group has only through `$extends` (`extends.ts`): the
   * dotted path of the token it was copied from. It has no key in the text.
   */
  inheritedFrom?: string;
  /**
   * Set on a token written with `$ref` and no `$value` (§6.6.2): `value` is
   * that `{ $ref }` object, which sits at the token's own key in the text.
   */
  valueFromRef?: true;

  // --- alias resolution (populated by resolveAliases) ---
  isAlias: boolean;
  /** The reference path inside the braces, e.g. "color.brand.primary". */
  reference?: string;
  /** Final resolved value after following the alias chain. */
  resolvedValue?: unknown;
  /** Final resolved type after following the alias chain. */
  resolvedType?: TokenType;
}

/** A group (any object without `$value`). Groups nest arbitrarily. */
export interface GroupNode {
  kind: "group";
  name: string;
  path: string[];
  /** `$type` declared on the group, applied to descendants. */
  type?: TokenType;
  /** Type descendants get from an ancestor when this group declares none. */
  inheritedType?: TokenType;
  description?: string;
  deprecated?: boolean | string;
  extensions?: Record<string, unknown>;
  /**
   * `$extends` (or a group-level `$ref`, its JSON Schema spelling): `target`
   * is the dotted path of the group it names, unset when the reference is
   * malformed; `error` is set by `expandExtends` when it cannot be followed.
   */
  extends?: { via: "$extends" | "$ref"; target?: string; error?: string };
  /** Set on a group that exists only to hold inherited tokens: the origin group's path. */
  inheritedFrom?: string;
  children: Array<GroupNode | TokenNode>;
}

export interface TokenDocumentModel {
  root: GroupNode;
}

export type Severity = "error" | "warning";

export interface ValidationIssue {
  severity: Severity;
  path: string[];
  message: string;
  /** Rule id, for lint findings (`token-atlas/name-case`); unset for validation. */
  code?: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
}
