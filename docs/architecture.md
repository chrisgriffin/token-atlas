# Architecture

How this repo works, written for a person rather than a parser. It describes
the repo as it is on `develop` today, and a change that adds, removes or
renames a directory, or changes what a part does, updates this file in the
same PR.

## What it is

Token Atlas is a VS Code extension for working with **design tokens** — the named values a design system is built from (`color.brand.primary`, `space.md`) — written in the W3C/DTCG JSON format the Design Tokens Community Group standardised as the Design Tokens Format Module 2025.10.

Open a token file and the extension adds completion for `{alias}` references, hovers that show a token's resolved value, go-to-definition and find-references across files, rename, an outline, inline colour swatches and validation in the Problems panel. The same hovers and go-to-definition also work on the identifiers an export tool emits — `--color-brand-primary` in CSS, `$color-brand-primary` in Sass, `colorBrandPrimary` in TypeScript — matched back to the token they came from, and renaming a token rewrites them there too, each in its own spelling. A visual editor is there too, opt-in per file.

It is used by whoever is editing tokens in VS Code, and it exists so those tokens can stay in the repo, in git, with diffs a reviewer can read — no design-tool sync, no subscription, no separate source of truth. That goal drives the whole design: every write is a surgical edit to the existing JSON, so changing one colour changes one line.

## How it works

### The three layers

The code in `src/` is split into three layers with one hard rule: the `vscode` module is imported **only** in the host layer, and React and the DOM appear **only** in the webview.

- `src/core/` — pure TypeScript, no `vscode` and no DOM. It is where the token logic lives: `parse.ts` turns DTCG JSON into a model (an object with a `$value` is a token, and so is one with a `$ref` that does not name a group; any other object is a group), `resolve.ts` follows `{alias}` references and `$ref` JSON Pointers hop by hop and detects cycles, `extends.ts` copies the tokens a group inherits through `$extends` into the resolved model, marked as inherited, `aliases.ts` decides which tokens a given spot may reference without making a cycle (shared by JSON completion and the alias picker), `validate.ts` checks names and value shapes against the spec and finds references to `$deprecated` tokens, `legacy.ts` rewrites a pre-2025.10 string value (`"#ff0000"`, `"16px"`, `"200ms"`) to its object form, `serialize.ts` computes the minimal edits for a change, `color.ts` does colour-space maths via colorjs.io, `units.ts` converts `px`/`rem`/`pt`, `exportNames.ts` matches an exported identifier back to a token, scans a code file for every identifier it could be, finds each `var(--name)` in a stylesheet and where it ends, and spells a token the way exported code does, for completion, `hover.ts` builds the hover card's markdown, `inlay.ts` writes a resolved value as the one-line label an inlay hint shows, `collisions.ts` finds a token path defined in more than one file, less the files a resolver offers as alternatives, `hardcoded.ts` finds colour and `px`/`rem` literals in a stylesheet that equal a token and names the replacement, `lint/` checks a token system against the conventions a project writes in `token-atlas.lint.json` (tier direction, closed vocabularies, colour ramps, name case, contrast pairs), `tokensStudio.ts` reads a Tokens Studio export's `$themes` block, `resolver.ts` reads and checks a DTCG resolver document (`.resolver.json`) and lists its resolutions and their files, `modes.ts` finds the modifier a file is a mode of and each mode's value and write target for the visual editor's mode columns, and groups each modifier's files for the collision check, `symbols.ts` holds the relaxed match Go to Symbol in Workspace filters token paths with, `fileName.ts` turns what the user typed into a `.tokens.json` name for New Token File, `parseCache.ts` avoids re-parsing unchanged files, and `types.ts` plus `index.ts` define the model and the layer's public surface.
- `src/host/` — the only code that knows about VS Code. `languageFeatures.ts` registers completion, hover, go-to-definition, references, document symbols, workspace symbols (Go to Symbol in Workspace) and inlay hints with each alias's resolved value (the `tokenAtlas.inlayHints` setting); `exportFeatures.ts` does hover, go-to-definition and completion for CSS/Sass/Less/JS/TS, and an inlay hint with the resolved value after each `var(--token)` in CSS/Sass/Less (the same `tokenAtlas.inlayHints` setting); `hardcodedValues.ts` reports a stylesheet literal that equals a token, with a quick fix to the token's exported name (the `tokenAtlas.hardcodedValues` setting, off by default); `codeUsages.ts` finds where tokens are used in those files, for Find References and the opt-in unused-token hint; `codeColorSwatches.ts` draws a swatch before each color token used there (the `tokenAtlas.codeColorSwatches` setting); `rename.ts` handles F2, rewriting references in token files and resolvers and the token's usages in code (a file that says it was generated is left to the export tool); `diagnostics.ts` turns validation results into squiggles, strikes through uses of deprecated tokens (token files, resolver inline tokens, open code files), and checks resolver documents; `legacyFix.ts` offers the quick fix that converts a legacy value; `colorProvider.ts` puts swatches in the raw JSON; `workspaceIndex.ts` keeps the workspace-wide token index; `tokenTree.ts` drives the Design Tokens panel, with a codicon per type from `typeCodicons.ts`; `activeSet.ts` owns the status-bar choice described below; `defaultEditor.ts` implements the `tokenAtlas.defaultEditor` setting; `newTokenFile.ts` backs the New Token File command; `tokenEditorProvider.ts` is the Custom Text Editor provider and the bridge to the webview.
- `src/webview/` — the React app for the visual editor: `App.tsx` and `index.tsx`, `components/` (the table, detail panels, alias picker, problems list), `editors/` (a dedicated editor per token type, primitive and composite), `lib/` (render helpers), `icons.tsx` (the inline SVG icons, so the webview ships no icon font), `vscodeApi.ts` (the typed `postMessage`/state handle) and `styles.ts`, which styles everything from VS Code's own `--vscode-*` theme variables so the UI follows the user's theme.
- `src/shared/protocol.ts` — the typed message contract between host and webview. The webview sends **intents** ("set this value"); the host sends **state**. The webview never writes a file.

`src/extension.ts` is the entry point: VS Code calls its `activate()` and it registers every provider above.

### From opening a file to seeing something

The extension activates on startup and on any JSON, JSONC, CSS, Sass, Less, JS or TS document (`activationEvents` in `package.json`). Every provider is registered for the language, but **content-gated**: it does nothing unless the document actually sniffs as DTCG — it contains `$value` or `$type`. That is why ordinary JSON is never touched and why detection does not depend on a filename.

So, hovering a token in a token file: the provider confirms the document is DTCG, `core/parse.ts` parses the text, `core/resolve.ts` resolves the alias chain — consulting the workspace index when the reference points at another file — and `core/hover.ts` returns the markdown the host wraps in a hover card, with the swatch, the contrast figures and the unit conversions already in it. Diagnostics and colour swatches take the same route from the same parse.

The workspace index is built by scanning the globs in the `tokenAtlas.include` setting, each workspace folder with its own, and confirming each hit with the same content check. After that scan an edit or a write replaces only its own file's entry, and a file whose JSON is half typed keeps resolving to its last text that parsed. It is what makes cross-file completion, go-to-definition, find-references and rename work at all. When several files define the same token paths — one per brand, per theme, per platform — the status bar shows which of them a reference currently resolves against, and clicking it picks a different set. A DTCG resolver document's resolutions are offered there first, then a Tokens Studio export's own `$themes`. A resolver is the one choice with an order: its files go active highest precedence first, and the index visits them in that order, so the source the resolver lists last wins a shared path. An active entry can also name part of a file, `<uri>#/<json pointer>`: a resolver source that is a fragment of a file, or a source written inline in the resolver itself, whose children are indexed as top-level paths. A resolver document is never a token file itself, even when it holds inline tokens, so they reach the index only through an active resolution; rename and find-references visit each inline source as well as every token file.

Hovering `--color-brand-primary` in a stylesheet goes the other way round: `host/exportFeatures.ts` takes the word under the cursor, `core/exportNames.ts` normalises it to letters and digits only, and that key is looked up in the workspace index. A miss returns nothing, so unrelated CSS stays quiet. Completion runs the other direction: typing `--`, `$` (Sass), `@` (Less) or `a.b.` (JS/TS) asks `core/exportNames.ts` for each token's exported spelling, reusing a prefix the file already shows. Find References on a token runs the same match in reverse: `host/codeUsages.ts` scans each code file once into identifier spellings and keeps them until that file changes. In a stylesheet only a variable spelling counts; in JS/TS a DOM style property (`el.style.borderWidth`, a style object's `borderWidth` key) counts only when the file imports it ([ADR-002](./adr/ADR-002-js-style-property-names.md)), so neither Find References nor rename touches one. Why it matches by name rather than by configuration is [ADR-001](./adr/ADR-001-exported-identifier-matching.md).

### The visual editor round trip

_Reopen Editor With… → Token Editor_ hands the file to `host/tokenEditorProvider.ts`, a `CustomTextEditorProvider`. The `TextDocument` stays the single source of truth, so undo, dirty state, save and git diffs keep working exactly as they do for text. The provider parses the document, posts the model to the webview, and listens: an intent arriving from the webview becomes a set of jsonc-parser edits, applied as ranged `WorkspaceEdit`s — never a re-stringified document — and any change to the document, including one typed into the raw JSON in a split pane, re-pushes the model to the webview. That is the whole sync mechanism.

### Everything else in the repo

- `test/` — `core/` (unit tests for the pure layer), `webview/` (React components under jsdom), `host/` (host modules that load without `vscode`, or against a small stand-in for it), `ci/` (repo-shape guards that read files off disk), `integration/` (the extension inside a real downloaded VS Code, with the token workspace it opens), `integration-run.mjs` (runs that suite and names a VS Code startup hang apart from a test failure), and `fixtures/architectures/` (one token set per architecture, walked by the core tests). See [testing.md](./testing.md).
- `examples/` — hands-on token setups, one folder per architecture seen in the wild, for trying the extension by hand; `fixtures/` is a smaller sample for the same purpose.
- `docs/` — this file and the rest of the written record; `docs/adr/` holds the decision records.
- `specs/` — the Spec Kit spec, plan and tasks behind past pieces of work.
- `media/` — the activity-bar icon, the Marketplace icon (`icon.png`, rendered from `icon.svg`), and the screenshots the README embeds (left out of the `.vsix`; the listing loads them from GitHub).
- `schemas/` — the JSON Schema VS Code uses for completion and checks in a `token-atlas.lint.json`, wired up by `contributes.jsonValidation`.
- `.github/workflows/` — CI and release triggers; `.vscode/` — launch and task definitions for developing the extension; `.claude/` — permissions and hooks for agent sessions in this repo.
- `esbuild.mjs` produces two bundles: `dist/extension.js` (Node, CommonJS, with `vscode` left external) and `dist/webview.js` (browser, IIFE). Because the extension is packaged with `--no-dependencies`, the host bundle has to inline everything; a post-build guard fails the build if any unresolved relative `require` survives.

## How it connects

- **VS Code** is the host and the only runtime. `package.json`'s `contributes` block is the seam: it declares the settings, commands, menus, the activity-bar view and the two custom editors, and `src/` implements them. The extension requires VS Code 1.90 or newer and Node 22.
- **The DTCG spec** (Design Tokens Format Module 2025.10) is the external contract the core is written against. It is an inbound dependency only — the repo tracks the spec, nothing flows back.
- **Runtime dependencies** are `jsonc-parser` (format-preserving edits), `colorjs.io` (colour-space maths), and React for the webview. All are bundled into `dist/`, so an installed extension has no `node_modules`.
- **CI.** Every workflow in `.github/workflows/` is a thin trigger stub calling one of the `_reusable-*.yml` workflows in the public **[chrisgriffin/workflows](https://github.com/chrisgriffin/workflows)** repo (at its floating `v1` tag, so a release there is what changes CI here), passing this repo's own facts as inputs (the gate chain, the `CLAUDE.md` byte budget, the docs it owes, the docs-only paths), so a change to CI or the release machinery reaches this repo without a PR here. Local agent tooling is never committed, and `.gitignore`, `.prettierignore` and `.vscodeignore` all list it.
- **Nothing depends on this repo as code.** There is no npm package; the only output is the `.vsix` each release attaches to its GitHub Release and publishes as `chrisgriffinio.token-atlas` to the VS Code Marketplace and Open VSX.

## Running it

```bash
npm install
npm run build             # esbuild → dist/extension.js + dist/webview.js
npm run watch             # rebuild on change
npm test                  # vitest: core, webview and repo-shape tests
npm run typecheck         # tsc --noEmit
npm run format:check      # prettier
npm run test:integration  # the extension inside a downloaded VS Code
npm run package           # vsce package --no-dependencies --githubBranch main → .vsix
```

To use it: press <kbd>F5</kbd> in VS Code ("Run Token Atlas Extension"), which opens an Extension Development Host with the extension loaded, then open one of the token files in `examples/` or `fixtures/`.

The gate CI runs, and the one to run before pushing, is those commands in order: `npm run format:check && npm run typecheck && npm test && npm run build && npm run test:integration`. CI wraps the last one in `xvfb-run -a` because it needs a display.

## Where to look next

- [README.md](../README.md) — what the extension does, and every `tokenAtlas.*` setting with its default.
- [design.md](./design.md) — the design document behind Token Atlas: scope, the DTCG data model type by type, why a Custom Text Editor rather than a side panel, and the known gaps.
- [testing.md](./testing.md) — what each test folder covers, how to run a narrower slice, and where a new test belongs.
- [releasing.md](./releasing.md) — how a change becomes a `.vsix` on a GitHub Release.
- [adr/README.md](./adr/README.md) — the decision records, including [ADR-001](./adr/ADR-001-exported-identifier-matching.md) on matching exported identifiers.
- [CLAUDE.md](../CLAUDE.md) — the rules an agent working in this repo follows: the layer boundary, the non-negotiable invariants, and the couplings no test catches.
- [examples/README.md](../examples/README.md) — what each example token setup demonstrates and what to try in it.
