# Spec: ADR-002 names the destructured tokens key that rename leaves behind

**Feature Branch**: `018-adr002-destructured-key`
**Issue**: [#37](https://github.com/chrisgriffin/token-atlas/issues/37)

## Overview

ADR-002 skips a bare object key in JS/TS. That also skips a key destructured with a new name from an imported tokens object (`const { borderWidth: bw } = tokens`), while `tokens.borderWidth` in the same file is still renamed, so after F2 the two disagree. The ADR's Consequences list the other prices of the rule but not this one; this adds it beside the tokens-module key.

## User scenarios

1. **Given** a reader of ADR-002, **When** they read § Consequences, **Then** they learn that F2 renames `tokens.borderWidth` but not the key in `const { borderWidth: bw } = tokens`, and that the two then disagree.

## Functional requirements

- **FR-001**: ADR-002 § Consequences carries a bullet naming the destructured-with-rename key, beside the tokens-module key bullet.
- **FR-002**: the scan itself is unchanged (out of scope: the ADR defers that until a real workspace hits it).

## Success criteria

- [ ] ADR-002's Consequences says that a key destructured with a new name from an imported tokens object (`const { borderWidth: bw } = tokens`) is not renamed by F2 while `tokens.borderWidth` is, and that the two then disagree.
- [ ] **Runnable:** `grep -c "} = tokens" docs/adr/ADR-002-js-style-property-names.md` prints `1` or more (it prints `0` on `develop` today). This is a docs-only ticket, so the repo's verify gate is the other half of the check.
- [ ] `npm run verify` exits 0.

## Out of scope

- Changing `scanIdentifiers` to rename the destructured key.

## Needs from Chris

none
