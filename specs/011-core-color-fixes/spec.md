# Feature Specification: Color, unit, exported-name and lint fixes before 1.0

**Feature Branch**: `011-core-color-fixes`
**Issue**: #11
**Status**: Built

## Summary

A review before the 1.0 release found thirteen defects in Token Atlas's color math, unit conversions, matching of exported code names, and lint. Some change files wrongly (an 8-digit `hex`, a color picker edit that flattens the value, a rename that rewrites a CSS property), some show wrong numbers (contrast that ignores transparency, `0.063rem`), and some miss or invent problems. This fixes each one with a regression test that fails before the fix.

## User Scenarios & Testing

### User Story 1 - Writes keep the format valid and the file's shape (Priority: P1)

Someone picks a color in the raw JSON's swatch, or upgrades a legacy value with the quick fix, and gets a DTCG-valid color laid out as the visual editor writes it.

**Independent Test**: `npx vitest run test/core/color.test.ts` and `test/integration/color.test.ts`.

**Acceptance Scenarios**:

1. **Given** a translucent color, **When** Token Atlas writes it, **Then** its `hex` is 6-digit and the alpha lives only in `alpha`.
2. **Given** a multi-line color value with `"alpha": 1`, **When** a color is picked, **Then** the value stays multi-line at its own indent and keeps `"alpha": 1`.

### User Story 2 - Contrast is judged on what shows (Priority: P1)

Someone hovers a translucent text color, or lints a contrast pair, and sees the contrast of the color as painted over its background.

**Acceptance Scenarios**:

1. **Given** black at 10% alpha, **When** hovered, **Then** contrast on white reads 1.25:1 and fails.
2. **Given** a contrast pair whose foreground no file defines, **When** linted, **Then** the pair is reported on the background token.

### User Story 3 - Rename and stylesheet features touch only variables (Priority: P1)

Someone renames `border.width` with `border-width: var(--border-width)` in a stylesheet and only the variable changes.

**Acceptance Scenarios**:

1. **Given** a stylesheet word that spells a token without a variable sigil, **When** the token is renamed, hovered or its references listed, **Then** that word is untouched and not listed.

### Edge Cases

- A color value with too few, too many or non-numeric components, or a non-numeric alpha, is no color: no swatch, no hover color.
- An alpha that rounds to 100% is shown as opaque in every notation.
- An out-of-sRGB color is gamut-mapped the same way for the swatch and the hover.
- A translucent background is first composited over white.
- In SCSS and Less, a quoted string holding `//` is not a comment.

## Requirements

- **FR-001**: Every `hex` Token Atlas writes into a token file is `#rrggbb`.
- **FR-002**: The color picker builds its edit with core `computeSetEdits`, as the visual editor does, and keeps an explicit `alpha`.
- **FR-003**: `wcagContrast` blends a translucent foreground over the background (and a translucent background over white) before measuring.
- **FR-004**: A contrast pair with an undefined foreground is reported on the background token.
- **FR-005**: In CSS only `--x`, in Sass also `$x`, in Less also `@x` can name a token; this holds for rename, references, hover, go-to-definition, swatches and deprecation marks.
- **FR-006**: A DTCG color object needs exactly three finite-number or `"none"` components and a finite or absent alpha.
- **FR-007**: rem conversions keep 4 decimals; `url(#id)` is not a color literal; a quoted `url("//…")` in SCSS/Less does not hide the rest of the line; an acronym prefix (`DSColor…`) splits off; PascalCase allows a leading digit; an alpha rounding to 100% reads opaque; the swatch is gamut-mapped.
- **FR-008**: New Token File drops trailing dots and refuses Windows device names.

## Success criteria

- [x] A color value Token Atlas writes into a token file (color picker, legacy quick fix, visual editor) carries a 6-digit `hex`, and the color picker writes it laid out as the visual editor writes it, keeping an explicit `"alpha": 1`.
- [x] Contrast in hovers and in the contrast-pair lint judges a translucent color by what shows through it, and a contrast pair whose foreground no file defines is reported.
- [x] Renaming a token never rewrites a property, keyword or other bare word in a stylesheet, and hover, go-to-definition, references and swatches in a stylesheet answer only for its variables (`--x`, Sass `$x`, Less `@x`).
- [x] Each other finding above has a regression test that fails on `develop` and passes with the fix, and the PR records that red run.
- [x] **Runnable:** `npm test` exits 0, and `grep -c "the hex fallback written into a token file" test/core/color.test.ts` prints `1` (today `0`).

## Assumptions

- A translucent contrast-pair background has no named backdrop, so white stands in for it.
- A contrast pair whose foreground and background are both undefined has no token to report on and stays silent.
- JS/TS matching is unchanged: a camelCase export and a DOM style property (`el.style.fontSize`) are the same word, and nothing in the syntax tells them apart.
- The color picker writes a `hex` even where the value had none, as the visual editor does.

## Needs from Chris

none
