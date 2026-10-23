# Feature Specification: Core model follows DTCG 2025.10 and keeps the file's formatting

**Feature Branch**: `002-core-model-fixes`
**Issue**: #10
**Status**: Built

## Summary

A review of the token parser, resolver, validator and edit code before the 1.0.0 release found 17 places where Token Atlas disagrees with the DTCG 2025.10 format and resolver specs, or writes more of the file than it should. Some lose tokens outright (a `$root` token, any file with a comment), some flag valid files (a resolver whose version is `2025.10`), some accept files the spec rejects (an unknown `$type`, an `em` unit, a malformed shadow), and some edits reformat lines nobody touched. This fixes all of them in the core layer, each with a test that fails without the fix. Chris requested this on 2026-10-22.

## User Scenarios & Testing

### User Story 1 - Spec-valid files read correctly (Priority: P1)

Someone opens a token file or resolver the spec allows and every token is there, every reference resolves, and nothing valid is flagged.

**Independent Test**: `npx vitest run test/core/parse.test.ts test/core/resolver.test.ts`.

**Acceptance Scenarios**:

1. **Given** a group with a `$root` token, **When** another token references `{group.$root}`, **Then** the root token exists and the reference resolves (§6.2, §6.7.2).
2. **Given** a token file with a comment or a trailing comma, **When** it is parsed, **Then** every token is read; a real syntax error is reported where it is.
3. **Given** a resolver with `"version": "2025.10"`, **When** it is checked, **Then** there is no version error.
4. **Given** a modifier whose name has a `/`, referenced as `#/modifiers/a~1b`, **When** the resolver is read, **Then** the modifier is found.

### User Story 2 - Files the spec rejects are reported (Priority: P1)

Someone writes a value the spec does not allow and the Problems panel says what is wrong.

**Independent Test**: `npx vitest run test/core/validate.test.ts`.

**Acceptance Scenarios**:

1. **Given** `"$type": "colour"`, **Then** an error names the unknown type.
2. **Given** a dimension in `em` or a duration in `min`, **Then** an error names the allowed units.
3. **Given** a color with an unknown `colorSpace`, the wrong number of components, a non-numeric component, an alpha outside 0 to 1 or a hex that is not 6 digits, **Then** an error says which.
4. **Given** a shadow, border, transition, typography, gradient or stroke style value missing a member, with an unknown member, or with a sub-value of the wrong shape, **Then** an error names the member; a reference in a sub-value is accepted.
5. **Given** an unknown `$` key such as `$valeu`, **Then** a warning names it.
6. **Given** two composite tokens that reference each other, **Then** each is reported as part of a reference cycle.
7. **Given** `a → {b}` and `b → {missing}`, **Then** `a` is reported as not resolving because `{missing}` does not exist, not as a cycle.

### User Story 3 - Types and inherited tokens come out right (Priority: P2)

**Independent Test**: `npx vitest run test/core/resolve.test.ts test/core/modes.test.ts test/core/extends.test.ts test/core/aliases.test.ts`.

**Acceptance Scenarios**:

1. **Given** an alias with no `$type` of its own in a group whose `$type` differs from its target's, **Then** its resolved type is the target's (§5.2.2).
2. **Given** a mode file whose group gets a token through `$extends`, **When** its mode column is read, **Then** that token has its value.
3. **Given** a parsed model re-resolved after its `$extends` target's `$type` changed, **Then** the inherited type is the new one.
4. **Given** a token whose `$ref` pointer reaches into another token's value, **When** the alias picker lists candidates for that other token, **Then** it does not offer the first.

### User Story 4 - Edits keep the file's formatting (Priority: P1)

**Independent Test**: `npx vitest run test/core/serialize.test.ts test/core/edits.test.ts`.

**Acceptance Scenarios**:

1. **Given** a tab-indented or 4-space file and no formatting options from the caller, **When** a property is set or a token added, **Then** the new lines use the file's indentation and line ending, and no untouched line changes.
2. **Given** a one-line token, **When** `$description` or `$deprecated` is added or removed, **Then** it stays on one line.
3. **Given** a rename to `x.y`, `{x}`, `$a` or an empty name, **Then** it is refused with a message and no edit, in F2 and in the visual editor alike.

### Edge Cases

- A tokens file from Tokens Studio carries `$themes` and `$metadata` at its root; those are not unknown keys.
- The resolver's older date versions (`2025-11-01`, `2025-10-01`) stay accepted without a message, so existing files keep working.
- A `$ref` pointer from a composite to another member of its own value resolves as before and is not a cycle; a cycle is only reported when resolution got stuck and a reference leads back to the token.
- A value with a `$ref` pointer left unresolved gets no shape error: the pointer is reported, and the value it stands for is unknown.
- Example files that broke the newly checked rules are corrected: two 8-digit `hex` fallbacks, and the kitchen sink's legacy colors inside composites.
- `$root` may itself be renamed to and from; any other name starting with `$` is refused.
- Text with a real syntax error still reads as no tokens, as before, because a best guess at half-typed JSON can put tokens at the wrong paths; the error itself is now reported.

## Requirements

- **FR-001**: `parseTokens` reads `$root` tokens, accepts comments and trailing commas, and keeps syntax errors and unknown `$` keys as findings that `validate` reports.
- **FR-002**: `parseResolver` accepts `"2025.10"` and asks for it in its messages; modifier references are RFC 6901 unescaped; a modifier is one choice however often the order lists it.
- **FR-003**: `validate` checks `$type` names, units, color objects and composite values, reports composite cycles, and names the missing token at the end of a dangling chain. The legacy quick fix converts a legacy string inside a composite too, since validation now reports it.
- **FR-004**: `resolveAliases` gives an alias without its own `$type` its target's type, at the token and at every hop.
- **FR-005**: `contextValues` includes tokens a mode file inherits through `$extends`; `expandExtends` re-derives inherited types on every run; `wouldCycle` follows `$ref` pointers and composite references.
- **FR-006**: The edit functions infer indentation and line ending from the text when the caller passes none; adding or removing a property keeps a one-line object on one line; `computeRenameEdits` refuses an illegal name.
- **FR-007**: Every fix has a test that fails without it, under a `core model fixes` describe block.

## Success criteria

- [x] A spec-valid file reads fully: a `$root` token exists and `{group.$root}` resolves; a file with comments or trailing commas keeps every token and a real syntax error is reported; a resolver with `"version": "2025.10"` has no error; `#/modifiers/a~1b` finds modifier `a/b`.
- [x] Validation reports what DTCG 2025.10 rejects: an unknown `$type`, a dimension or duration unit outside `px`/`rem` and `ms`/`s`, a malformed color object, a malformed composite value, an unknown `$` key (warning), a cycle through composite values; a dangling alias chain says which token is missing instead of reporting a cycle.
- [x] Types and inherited tokens are right: an alias without its own `$type` takes its target's type over its group's; a mode column shows a token the mode file inherits through `$extends`; a cached model re-resolved after its `$extends` target's type changes has the new type; the alias picker does not offer a token that would close a cycle through a `$ref` pointer.
- [x] Edits keep the file's own formatting: a tab or 4-space file keeps its indentation when a property is set or a token added; adding or removing a property on a one-line token keeps it on one line; a rename to a name with `{`, `}`, `.` or a leading `$` is refused and the file is unchanged.
- [x] **Runnable:** `npx vitest run test/core -t "core model fixes"` exits 0 and its summary reports 25 or more tests passed and none failed (today: 0 passed, every test skipped).

## Assumptions

- The resolver's date versions stay accepted silently; messages ask for `2025.10`.
- Unknown `$` keys are a warning, not an error; `$themes` and `$metadata` (Tokens Studio) are known.
- Composite values with an extra member are an error, per §9.2 ("Adding additional sub-values ... make the composite token invalid").
- A gradient stop position outside 0 to 1 is not an error: §9.7 says it is clamped.
- JSON syntax errors are reported by Token Atlas as well as by VS Code's JSON service, as the resolver and lint config already are.
- Resolution of a deeply repeated composite (a reference used twice per level, many levels deep) is exponential, but only for a crafted file: 18 doubling levels take about 200 ms. The resolved value is itself that large, since the spec's no-flattening rule expands every reference, so reusing a resolution would only move the cost to validation, hover and the visual editor. Not changed.
- A modifier listed twice in `resolutionOrder` is one choice in the active-set picker, not a product with itself ("theme: light · theme: dark" named a resolution that was really dark). The spec is silent on listing it twice; its files take their last position in the order, as any source listed twice does.

## Needs from Chris

none
