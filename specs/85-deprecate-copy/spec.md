# Spec: Deprecate Token…: shorter copy in the reason box and the replacement picker

**Issue**: [#85](https://github.com/chrisgriffin/token-atlas/issues/85)

## Overview

Deprecate Token…'s reason box read "Why is it deprecated? (optional)", and VS Code appends its own "(Press 'Enter' to confirm or 'Escape' to cancel)" to any prompt, so the line under the field carried two parentheticals. Chris approved shorter copy on 2026-11-07 from screenshots of each option. "Optional" is in the prompt as well as the placeholder, because a placeholder disappears on typing and is not reliably announced by screen readers.

## Functional requirements

- FR-001: The reason box keeps the title `Deprecate <token>`, and has the placeholder `Deprecation reason (optional)…` and the prompt `Optional. Shown wherever the token is used.`
- FR-002: The replacement picker has the title `Replace <token> with` and the placeholder `Replacement token`.

## Success criteria

- [x] The reason box (`src/host/deprecate.ts`) keeps the title `Deprecate <token>`, has the placeholder `Deprecation reason (optional)…` and the prompt `Optional. Shown wherever the token is used.` (before: no placeholder, prompt `Why is it deprecated? (optional)`).
- [x] The replacement picker has the title `Replace <token> with` (before: `Deprecate <token>: replace it with`) and the placeholder `Replacement token` (before: `The token its uses should move to`).
- [x] **Runnable:** `npx vitest run test/host/deprecate-copy.test.ts` passes (no such file on `develop`, so it fails there), and the full gate is green: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:integration`.

## Out of scope

- VS Code's own "(Press 'Enter' to confirm or 'Escape' to cancel)": an extension cannot change it, short of replacing the whole line with a highlighted info message, which Chris declined.
- The detail panel's replacement tooltip in `src/webview/components/shared.tsx`.
