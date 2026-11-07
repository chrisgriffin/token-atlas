# Spec: Find All References shows its results in the visual editor's detail panel

**Issue**: [#83](https://github.com/chrisgriffin/token-atlas/issues/83)

## Overview

Find All References on the visual editor's right-click menu ran VS Code's references peek, which only works in a text editor, so it switched the file to JSON. Chris requested on 2026-11-07 that the results show inside the visual editor instead: the token's detail panel opens with a Referenced by section, its token references grouped apart from its uses in code.

## User scenarios

- Right-click `color.ink`, choose Find All References: the detail panel opens on `color.ink`, and Referenced by lists `color.button` (this file) and `brand.text` (another token file) under Tokens, and `app.css:12` under Code. The visual editor stays.
- Click `color.button`: its detail panel opens. Click `brand.text`: its file opens in the Token Editor on `brand.text`. Click `app.css:12`: `app.css` opens as text with the cursor on the use.
- Find All References on a token nothing uses: the panel says so.

## Functional requirements

- FR-001: The command gathers what `vscode.executeReferenceProvider` finds at the token's key, the provider Shift+F12 uses, and sends it to the open Token Editor as one `references` message; it opens no text editor and no peek.
- FR-002: A location in a token file is listed under Tokens by the token whose key it is; every other location is listed under Code by its workspace-relative file and 1-based line.
- FR-003: The webview opens the panel on the token and shows the section until the panel moves to another token.
- FR-004: Clicking a token in the same file opens its detail panel in place. Clicking anything else sends an `openReference` intent: the host opens another token file in the Token Editor on that token (as the Tokens panel's reveal does), and a code file as text with the cursor on the use.
- FR-005: With the editor closed by the time the results arrive, the command says so and opens nothing.

## Success criteria

- [ ] Find All References from a token row's right-click menu opens that token's detail panel with a Referenced by section, and opens no text editor on the token file.
- [ ] The section lists every location Shift+F12 on the token's key finds: references from token files under Tokens, by token path, with the referencing token's value; every other location under Code, by file and line. With none, it says nothing references the token.
- [ ] Clicking a token in the same file opens its detail panel; a token in another token file opens that file in the Token Editor with that token's detail panel open; a code use opens that file as text with the cursor on the use.
- [ ] README describes the section.
- [ ] **Runnable:** `npx vitest run test/host/editor-references.test.ts test/webview/references.test.tsx` passes (neither file exists on `develop@66deff7`, so it fails there), and the full gate is green: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:integration`.

## Out of scope

- A Find All References button inside the detail panel itself; the menu is the entry point.
- Refreshing the list after later edits: it is the answer at the time asked, as the peek was.
