/**
 * Token lint: is a token system well-kept, not just well-formed (that is
 * validate.ts). Five rules, each silent until `token-atlas.lint.json` gives it
 * something to check, and none naming any real project's tiers or words.
 *
 * The rules take a resolved model and a parsed config and return plain
 * issues, importing nothing Token Atlas-specific beyond the token model, so they
 * can move into a shared package unchanged.
 */
import { toColor, isDtcgColor, COLOR_SPACES, CONTRAST_TARGETS, wcagContrast } from "../color";
import { collectReferences, indexTokens, resolveValue } from "../resolve";
import type { GroupNode, TokenDocumentModel, TokenNode, ValidationIssue } from "../types";
import type { ContrastPair, LintConfig, LintRuleId, NameCase } from "./config";

export * from "./config";

/**
 * `external` is the rest of the workspace (the host's index, which follows the
 * active token set), for a rule that looks up a token this document does not
 * define. This document's own tokens win, as everywhere (invariant 4), except
 * those `localScope` rejects: a set the active theme disables defines nothing
 * — see `resolveAliases`.
 */
export function lintTokens(
  model: TokenDocumentModel,
  config: LintConfig,
  external?: Map<string, TokenNode>,
  localScope?: (key: string) => boolean,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const local = indexTokens(model);
  const tokens = [...local.values()];
  const emit = (code: LintRuleId) => {
    const level = config.rules[code] ?? "warn";
    if (level === "off" || config.silenced.has(code)) return undefined;
    return (path: string[], message: string) =>
      issues.push({ severity: level === "error" ? "error" : "warning", path, message, code });
  };

  const tier = emit("token-atlas/tier-alias-inverted");
  if (tier && config.tiers && config.tiers.length >= 2) tierRule(tokens, config.tiers, tier);
  const vocab = emit("token-atlas/vocabulary-invalid");
  if (vocab && config.vocabularies?.length) vocabularyRule(tokens, config, vocab);
  const ramp = emit("token-atlas/ramp-not-monotonic");
  if (ramp && config.rampPaths?.length) rampRule(tokens, config.rampPaths, ramp);
  const name = emit("token-atlas/name-case");
  if (name && config.naming) nameRule(model.root, config, name);
  const contrast = emit("token-atlas/contrast-insufficient");
  if (contrast && config.contrastPairs?.length) {
    const own = (key: string) => (localScope && !localScope(key) ? undefined : local.get(key));
    const lookup = (key: string) => own(key) ?? external?.get(key);
    contrastRule(own, lookup, config.contrastPairs, contrast);
  }
  return issues;
}

type Emit = (path: string[], message: string) => void;

/** A tier is a path's first segment; a mode suffix (`system/dark`) is not part of it. */
function tierIndex(key: string, tiers: string[]): number {
  return tiers.indexOf(key.split(".")[0].split("/")[0]);
}

/**
 * Aliases point down the tiers. Judged on each **direct** reference: the
 * resolved end of a chain is nearly always a primitive, so judging that would
 * hide every inversion.
 */
function tierRule(tokens: TokenNode[], tiers: string[], emit: Emit): void {
  for (const token of tokens) {
    const key = token.path.join(".");
    const from = tierIndex(key, tiers);
    if (from < 0) continue;
    const refs =
      token.isAlias && token.reference ? [token.reference] : collectReferences(token.value);
    for (const ref of refs) {
      const to = tierIndex(ref, tiers);
      if (to > from) {
        emit(
          token.path,
          `"${key}" (tier "${tiers[from]}") aliases "${ref}" in the higher tier "${tiers[to]}"; aliases should point down the tiers, toward the primitives.`,
        );
      }
    }
  }
}

/** `*` is exactly one segment; no other wildcard. */
function pathMatches(pattern: string, path: string[]): boolean {
  const segments = pattern.split(".");
  return segments.length === path.length && segments.every((s, i) => s === "*" || s === path[i]);
}

function vocabularyRule(tokens: TokenNode[], config: LintConfig, emit: Emit): void {
  for (const token of tokens) {
    const parent = token.path.slice(0, -1);
    const entry = config.vocabularies!.find((v) => v.paths.some((p) => pathMatches(p, parent)));
    if (!entry || entry.values.includes(token.name)) continue;
    emit(
      token.path,
      `"${token.name}" is not in the vocabulary for ${parent.join(".")} (${entry.values.join(", ")}).`,
    );
  }
}

/** Perceived lightness (OKLab L), computed from the color's own space. */
function lightness(value: unknown): number | undefined {
  if (!isDtcgColor(value) || !(COLOR_SPACES as readonly string[]).includes(value.colorSpace)) {
    return undefined;
  }
  try {
    const l = toColor(value)?.to("oklab").coords[0];
    return typeof l === "number" && Number.isFinite(l) ? l : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Within a ramp, ordered by numeric step, lightness moves one way. The
 * direction is the one most steps take (ties go to the first change), so a
 * single bad first step is one finding, not a flag on every step after it.
 * Equal neighbours are a plateau, never a reversal.
 */
function rampRule(tokens: TokenNode[], rampPaths: string[], emit: Emit): void {
  const ramps = new Map<string, Array<{ token: TokenNode; step: number; l: number }>>();
  for (const token of tokens) {
    if ((token.resolvedType ?? token.type) !== "color" || !/^\d+(\.\d+)?$/.test(token.name)) {
      continue;
    }
    const parent = token.path.slice(0, -1);
    if (!rampPaths.some((p) => pathMatches(p, parent))) continue;
    const l = lightness(token.resolvedValue ?? token.value);
    if (l === undefined) continue;
    const key = parent.join(".");
    ramps.set(key, [...(ramps.get(key) ?? []), { token, step: Number(token.name), l }]);
  }

  for (const steps of ramps.values()) {
    steps.sort((a, b) => a.step - b.step);
    const signs = steps.slice(1).map((s, i) => Math.sign(s.l - steps[i].l));
    const total = signs.reduce((a, b) => a + b, 0);
    const direction = Math.sign(total) || signs.find((s) => s !== 0);
    if (!direction) continue;
    signs.forEach((sign, i) => {
      if (sign !== -direction) return;
      const { token } = steps[i + 1];
      emit(
        token.path,
        `"${token.path.join(".")}" is ${direction > 0 ? "darker" : "lighter"} than the step before it, "${steps[i].token.path.join(".")}", reversing the ramp.`,
      );
    });
  }
}

// A leading digit fits every case: t-shirt steps like `2xl` are not a defect.
const CASES: Record<NameCase, RegExp> = {
  "kebab-case": /^[a-z0-9]+(-[a-z0-9]+)*$/,
  camelCase: /^[a-z0-9][a-zA-Z0-9]*$/,
  snake_case: /^[a-z0-9]+(_[a-z0-9]+)*$/,
  PascalCase: /^[A-Z0-9][a-zA-Z0-9]*$/,
};

/** Every group and token name, each reported once, where it is written. */
function nameRule(root: GroupNode, config: LintConfig, emit: Emit): void {
  const { case: nameCase } = config.naming!;
  const allowed = new Set(config.vocabularies?.flatMap((v) => v.values));
  const walk = (group: GroupNode) => {
    for (const child of group.children) {
      if (child.inheritedFrom) continue; // its origin's name, checked there
      // A mode suffix (`system/dark`) is two names, as in the tier rule.
      const bad = child.name
        .split("/")
        .some((part) => !/^\d+$/.test(part) && !allowed.has(part) && !CASES[nameCase].test(part));
      if (bad) {
        emit(child.path, `"${child.name}" is not ${nameCase}.`);
      }
      if (child.kind === "group") walk(child);
    }
  };
  walk(root);
}

/**
 * Each declared pair is judged where its foreground is defined, on resolved
 * values, so an alias or a background in another file counts as what it is.
 * A side that is not a color is reported rather than skipped: a typo in the
 * config would otherwise silence its pair for good. A foreground no file
 * defines has nowhere to be judged, so it is reported on the background.
 */
function contrastRule(
  own: (key: string) => TokenNode | undefined,
  lookup: (key: string) => TokenNode | undefined,
  pairs: ContrastPair[],
  emit: Emit,
): void {
  const colorOf = (key: string) => {
    const token = lookup(key);
    const value = token && resolveValue(token.value, lookup);
    return toColor(value) ? value : undefined;
  };
  for (const { foreground, background, target } of pairs) {
    const token = own(foreground) ?? (lookup(foreground) ? undefined : own(background));
    if (!token) continue;
    const fg = colorOf(foreground);
    const bg = colorOf(background);
    const missing = !fg ? foreground : !bg ? background : undefined;
    const ratio = missing ? null : wcagContrast(fg, bg);
    if (ratio === null) {
      const why = missing
        ? `"${missing}" does not resolve to a color`
        : "both resolve to colors, but their contrast could not be computed";
      emit(
        token.path,
        `Contrast of "${foreground}" on "${background}" could not be checked: ${why}.`,
      );
      continue;
    }
    const named = typeof target === "number" ? undefined : CONTRAST_TARGETS[target];
    const min = named ? named.min : (target as number);
    if (ratio >= min) continue;
    const wanted = named ? `WCAG ${named.label} (${min}:1)` : `the target ${min}:1`;
    emit(
      token.path,
      `"${foreground}" on "${background}" has contrast ${ratio}:1, below ${wanted}.`,
    );
  }
}
