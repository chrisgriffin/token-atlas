# Spec: The README says a $root reference's "Expected object" warning comes from the DTCG schema, not Token Atlas

**Issue**: [#102](https://github.com/chrisgriffin/token-atlas/issues/102)

## Overview

A reference like `{spacing.2.$root}` resolves correctly in Token Atlas, but a file that declares the official DTCG 2025.10 JSON Schema in `$schema` gets the warning "Incorrect type. Expected "object"" from VS Code's own JSON validation, because the schema's reference pattern rejects a path segment that starts with `$`. The README does not say so, so the next person who sees it will report it as a Token Atlas bug (as #100 did). A sentence or two in the README's "DTCG support" section closes that gap.

## Functional requirements

- FR-001: The README's "DTCG support" section says `$root` and references through it are supported.
- FR-002: It says a file declaring the DTCG 2025.10 schema in `$schema` may still get the "Expected object" warning from VS Code's JSON validation, and that the warning comes from that schema, not Token Atlas.
- FR-003: It gives the user a way to act on it: drop the `$schema` line, or ignore that warning.

## Success criteria

- [x] **Runnable:** `grep -cF '$root' README.md` prints `1` or more (it prints `0` on `develop`).
- [x] The README says the "Expected object" warning on a `$root` reference comes from the DTCG schema named in `$schema`, not from Token Atlas, and gives the user a way to act on it.
- [x] `npm run format:check` exits 0.

## Out of scope

- Any change to how Token Atlas validates or resolves `$root` references: PR #101 (open, not yet merged) pins that behaviour with tests.
