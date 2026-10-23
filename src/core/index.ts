/** Public surface of the Token Atlas core. Pure TS — no vscode, no DOM. */
export * from "./types";
export {
  parseTokens,
  countTokens,
  isReference,
  referenceTarget,
  referenceKey,
  parsePointer,
  refPointer,
  tokenReferenceAtOffset,
} from "./parse";
export { expandExtends, hasExtends } from "./extends";
export { createParseCache } from "./parseCache";
export { tokenFileName } from "./fileName";
export { readThemes, type TokenTheme } from "./tokensStudio";
export {
  looksLikeResolver,
  inputIssues,
  parseResolver,
  resolutions,
  inlineSources,
  pointerTarget,
  resolutionCount,
  resolutionSources,
  type Fragment,
  type Resolver,
  type ResolverIssue,
  type Resolution,
} from "./resolver";
export { modeOf, modifierFiles, contextValues, type ModeCell } from "./modes";
export {
  resolveAliases,
  resolveValue,
  indexTokens,
  collectReferences,
  pointersIn,
} from "./resolve";
export {
  cssVarUsages,
  EXPORT_IDENTIFIER,
  exportCompletionContext,
  exportName,
  findTokenForIdentifier,
  isGeneratedCode,
  learnPrefix,
  memberCompletions,
  normalizeName,
  renameInIdentifier,
  scanIdentifiers,
  tokenMatcher,
  tokenUsages,
  type TokenUsage,
  type CssVarUsage,
  type ExportCompletionContext,
  type IdentifierOccurrence,
} from "./exportNames";
export { findPathCollisions, type PathCollision } from "./collisions";
export {
  findLiterals,
  indexTokenValues,
  matchingTokens,
  replacementFor,
  sigilFor,
  type Literal,
  type TokenValueIndex,
} from "./hardcoded";
export {
  validate,
  deprecation,
  deprecationMessage,
  deprecatedReferences,
  type DeprecatedReference,
} from "./validate";
export {
  lintTokens,
  parseLintConfig,
  LINT_RULE_IDS,
  type LintConfig,
  type LintConfigIssue,
} from "./lint";
export {
  aliasCandidates,
  aliasCompletionContext,
  aliasEditSpan,
  describeValue,
  expectedTypeAt,
  wouldCycle,
  type AliasContext,
} from "./aliases";
export { fuzzyMatches } from "./symbols";
export { dimensionConversions, type DimensionConversions } from "./units";
export { upgradeLegacyValue, computeLegacyFixes, type LegacyFix } from "./legacy";
export {
  computeSetEdits,
  setTokenProperty,
  computeAddEdits,
  computeDeleteEdits,
  computeRenameEdits,
  computeReferenceRenameEdits,
  computeSwapEdits,
  computeReorderEdits,
  InvalidNameError,
  NameTakenError,
  type Edit,
} from "./serialize";
export { hoverMarkdown, escapeHover, type HoverInput, type HoverHop } from "./hover";
export { inlayValue } from "./inlay";
