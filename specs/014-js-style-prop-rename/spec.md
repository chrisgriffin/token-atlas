# Spec: Rename leaves DOM style properties in JS/TS alone

**Feature Branch**: `014-js-style-prop-rename`
**Issue**: [#16](https://github.com/chrisgriffin/token-atlas/issues/16)

## Overview

Renaming a token whose camelCase export name is also a DOM style property renames that property in JS/TS too. With a token `border.width`, F2 rewrites `el.style.borderWidth` and a style object's `borderWidth` key, which breaks the code. #14 fixed the same flaw for CSS, Sass and Less by matching only variable spellings; JS/TS has no sigil, so the fix needs another signal: whether the file imports the name.

## User scenarios

1. **Given** a token `border.width` and a TS file with `el.style.borderWidth = '2px'` and `{ borderWidth: 1 }`, **When** the token is renamed to `border.size`, **Then** neither line changes.
2. **Given** the same token and a file that does `import tokens from './tokens'` and `import { borderWidth } from './tokens'`, **When** it is renamed, **Then** `tokens.border.width` becomes `tokens.border.size` and `borderWidth` becomes `borderSize`, the import specifier included.
3. **Given** a tokens module that declares `export const borderWidth = '1px'`, **When** it is renamed, **Then** the declaration is renamed.

## Functional requirements

- **FR-001**: In a JS/TS file, an identifier whose last dotted part is a CSS property in its DOM spelling is not a token usage, unless its root is imported (`import … from`, `require(…)`) into the file or it is the file's own `export const`/`let`/`var`.
- **FR-002**: A one-word property at the end of a dotted path other than `.style.` (`tokens.border.width`) is a token path segment and still counts.
- **FR-003**: Any other identifier, and every stylesheet, is matched as before.
- **FR-004**: Rename, Find References and the unused-token hint read the same scan, so they agree.

## Success criteria

- [ ] Renaming `border.width` leaves `el.style.borderWidth` and `{ borderWidth: ... }` style keys untouched, pinned by a test.
- [ ] Renaming still updates real token exports such as `tokens.border.width` and `borderWidth` imported from a tokens module.

**Runnable:** `npx vitest run test/core/exportNames-js-style-props.test.ts` exits 0.

## Needs from Chris

none
