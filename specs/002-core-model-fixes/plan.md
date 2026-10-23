# Implementation Plan: Core model follows DTCG 2025.10 and keeps the file's formatting

**Branch**: `002-core-model-fixes` | **Spec**: [spec.md](./spec.md)

## Summary

Seventeen fixes in `src/core/`, each pinned by a test under a `core model fixes` describe block in the test file of the module it changes. Three small host changes carry core behavior to VS Code: a syntax error's offset becomes the diagnostic's range, F2 rename uses the core's name check instead of its own copy, and the visual editor shows a refused name the way it already shows a taken one.

## Technical context

- Parse: `jsonc-parser`'s `parse` with `allowTrailingComma`, already a dependency and already used by the resolver and lint config, replaces `JSON.parse`. Text with a real syntax error still parses to an empty document, as before: jsonc's best guess at half-typed JSON can move tokens to the wrong paths. Syntax errors and unknown `$` keys go on a new `model.issues`, which `validate` passes through. `ValidationIssue` gets the `offset` field `ResolverIssue` already has.
- `$root`: parse builds it as a token named `$root`; `parsePointer` splits at the first `$` segment that is not `$root`.
- Types: `resolveAliases` uses the token's own `$type` (not `typeIsInherited`), then the target's, then the group's; the same at every hop.
- Cycles: `referencesReach` in `resolve.ts` follows every reference (whole-value, composite, `$ref`) from a token; `validate` reports a composite whose resolution left a reference behind and whose direct reference leads back to it, and `wouldCycle` is the same walk. A whole-value alias that does not resolve is walked once more to say whether a cycle or a missing token stopped it. Resolution itself is unchanged, so a `$ref` to a sibling member of the same value still resolves.
- Legacy fix: `computeLegacyFixes` walks a composite's value and types each string by its member (`expectedTypeAt`), so the new sub-value errors have the same quick fix.
- Validation shapes: member tables per composite type from §9; primitive sub-values reuse the primitive check; references anywhere in a sub-value are skipped. Color checks use `COLOR_SPACES` from `color.ts`; units live once in `types.ts` and `legacy.ts` imports them.
- Edits: `inferFormat(text)` reads the first indented line (tab or the smallest space run) and CRLF; used whenever the caller passes no format. A removed property goes through `computeDeleteEdits`; an added one through `computeAddEdits`, which gains a one-line case writing `, "key": value` inline.
- Rename: `computeRenameEdits` throws `InvalidNameError` for an empty name, `{`, `}`, `.` or a leading `$` other than `$root`; `src/host/rename.ts` drops its own copy of the check and lets that message through.
- Modes: each source's `$extends` is expanded against the sources before it, and the merged tokens are resolved as plain tokens.
- `expandExtends` records the tokens it typed and clears them at the start of the next run.
- Resolver: `"2025.10"` first in `VERSIONS`, date forms kept; one RFC 6901 unescape helper serves pointers, set and modifier references.

## Surfaces touched

- `src/core/`: `types.ts`, `parse.ts`, `resolve.ts`, `validate.ts`, `serialize.ts`, `extends.ts`, `modes.ts`, `aliases.ts`, `resolver.ts`, `legacy.ts`, `index.ts`.
- `src/host/diagnostics.ts` (area C's file): a validation issue with an `offset` gets that position as its range, as resolver issues already do.
- `src/host/rename.ts` and `src/host/tokenEditorProvider.ts` (area C's files): the duplicate name check goes; a refused name shows as a message in the visual editor, like a taken one.
- Tests: `test/core/{parse,resolve,validate,serialize,edits,extends,modes,aliases,resolver,legacy,collisions}.test.ts`; `collisions.test.ts` is area B's file and only its resolver version changes.
- Resolver files pinned to the old version: `examples/09-resolver/tokens.resolver.json`, `test/integration/workspace/themes.resolver.json`, `test/integration/deprecated.test.ts`.
- Example token files the new checks flag: `examples/01-single-file/tokens.json` and `examples/08-exported-code/tokens.json` (8-digit hex), `examples/07-kitchen-sink/tokens.json` (legacy colors inside composites).
- `test/core/extends.test.ts`: two cases copied the spec's Example 14, whose `%` unit §8.2.1 forbids; they use `rem`.
- `docs/design.md` (area E's file): §4.1 names (`$root`) and comments, §5 indentation and one-line objects. Its claim that composites are validated becomes true.
- `docs/architecture.md`: no directory or part's job changes; no edit.
- Published surface: `src/core/index.ts` exports `InvalidNameError`; no command, setting or schema changes.
- Fleet surfaces: none apply (no workflow, ruleset, routine or vault-covered path).
