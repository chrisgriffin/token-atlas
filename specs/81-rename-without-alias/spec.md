# Spec: Title the rename-without-alias command "Rename Without Alias"

**Issue**: [#81](https://github.com/chrisgriffin/token-atlas/issues/81)

## Overview

With `tokenAtlas.deprecationWorkflow` on, a rename keeps the old name as a deprecated alias of the new one. The command that skips that alias for one rename is titled "Rename Token Without Keeping Old Name", which is long and does not say what it skips. Chris requested on 2026-11-07 that it be titled "Rename Without Alias". The command id `tokenAtlas.renameWithoutAlias` and its behavior do not change.

## User scenarios

- With the workflow on, the Command Palette lists `Token Atlas: Rename Without Alias`.
- With the workflow on, right-clicking a token or group in the visual editor shows `Rename Without Alias` under `Rename…`.

## Functional requirements

- FR-001: `package.json` contributes `tokenAtlas.renameWithoutAlias` titled `Rename Without Alias`, category Token Atlas.
- FR-002: The `tokenAtlas.deprecationWorkflow` setting description, the README, `docs/design.md`, the `src/host/rename.ts` comments and the test names call it `Rename Without Alias`.

## Success criteria

- [ ] `package.json` contributes `tokenAtlas.renameWithoutAlias` with the title `Rename Without Alias` (category Token Atlas), and no contributed title or setting description says "Rename Token Without Keeping Old Name".
- [ ] README, `docs/design.md`, `src/host/rename.ts` comments and the test names call the command `Rename Without Alias`.
- [ ] **Runnable:** `npx vitest run test/ci/manifest-couplings.test.ts` passes with a test that the command's title is `Rename Without Alias` (it fails on `develop@66deff7`, where the title is the old one), and the full gate is green: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:integration`.

## Out of scope

- Spec folders of merged work (015, 019, 022, 55): they record what was built under the old title.
