# Token Atlas — context for Claude

How this repo works, written for a person: [docs/architecture.md](docs/architecture.md).

VS Code extension for editing W3C/DTCG design tokens. **Text-editor-first**: language features (completion, hover, go-to-def, references, outline, color swatches, diagnostics) on token JSON, with an opt-in visual editor via "Reopen Editor With… → Token Editor".

## Commands

```bash
npm run build      # esbuild → dist/extension.js + dist/webview.js
npm run watch      # rebuild on change
npm test           # vitest — test/{core,webview,ci,host}, no vscode
npm run test:integration  # the extension inside a downloaded VS Code (test/integration/)
npm run typecheck  # tsc --noEmit
npm run package    # vsce package --no-dependencies → .vsix
```

F5 ("Run Token Atlas Extension") launches an Extension Development Host. Try `examples/` (one folder per token architecture) or `fixtures/`.

## Architecture — three layers, and the seams nothing tests

- `src/core/` — pure TS, **zero `vscode` imports, zero DOM**. Parse, alias resolution (cross-file via an external index), validation, format-preserving edits, color math (colorjs.io), unit conversions. Most unit tests target this layer.
- `src/host/` — the **only** vscode-aware code: language features, rename, diagnostics, colour swatches, the workspace token index, and the Custom Text Editor provider. File-by-file map: [`docs/design.md`](docs/design.md) § 2.1.
- `src/webview/` — React app for the visual editor. Sends intents over `src/shared/protocol.ts`; never touches files.

Never break the boundary. UI emits intents; host applies edits; core stays pure.

`test/integration/` is the one place the layers are tested together, because vitest cannot load `vscode`: anything about tabs, custom editors, tree views or settings belongs there. How it is wired: [`docs/testing.md`](docs/testing.md).

The couplings below are the ones no test or CI check catches: touch the left, do the right in the same change.

| If you touch                                                                       | Then                                                                                                                                                                   |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the `when` clause on `contributes.menus` in `package.json`                        | the `setContext("tokenAtlas.isTokenDocument", …)` call in `src/extension.ts` that feeds it                                                                             |
| a `dependencies` entry or `mainFields` in `esbuild.mjs`                            | invariant 2: run `npm run build` and read the guard's output — the bundle ships with `--no-dependencies`, so a dep that does not inline breaks activation at runtime   |
| the `build` job name in `.github/workflows/build-check.yml`                        | the branch ruleset on GitHub, which requires the check named `build / ci` (admin-only; see the comment block at the top of that file)                                 |
| the local agent-tooling entries in `.prettierignore` / `.gitignore` / `.vscodeignore` | all three are load-bearing: the first two keep the format check green, the third keeps that tooling out of a packaged extension (pinned by `test/ci/vscodeignore-overlay.test.ts`) |
| a top-level directory tooling drops into the repo (Spec Kit's .specify, local agent tooling, the integration build's out)   | add it to `.vscodeignore`, or it ships inside the packaged extension — `test/ci/package-contents.test.ts` fails on any packaged file outside the allow-list |
| a `docs/adr/` record                                                               | link it from the PR that implements it |

Left out on purpose because a test already covers them: the `package.json` ↔ `src/` identifier couplings (`test/ci/manifest-couplings.test.ts`) and the `contributes.configuration` defaults (`test/ci/configuration-defaults.test.ts`).

## Non-negotiable invariants

1. **Format-preserving writes.** All edits go through jsonc-parser surgical edits (`src/core/serialize.ts`) → ranged `WorkspaceEdit`s. Never `JSON.stringify` a whole document — clean git diffs are the product's reason to exist.
2. **Self-contained extension bundle.** We package with `--no-dependencies`, so `dist/extension.js` must inline everything. esbuild uses `mainFields: ["module","main"]` (jsonc-parser's UMD `main` is un-bundleable) and `esbuild.mjs` has a post-build guard that fails on leftover relative requires. v0.0.x shipped broken because of this — don't regress it.
3. **Content-based detection.** Language features register for `json`/`jsonc` but no-op unless the document sniffs as DTCG (`"$value"`/`"$type"`) or has the format's extension (`.tokens`, `.tokens.json`), which is how an empty new file counts; a resolver document (`resolutionOrder` at the root) never counts. Never spam ordinary JSON. Cross-file indexing scans `tokenAtlas.include` globs.
4. **Local-first resolution.** The active document's tokens win over the workspace index (unsaved edits + multi-brand identical paths depend on this — pinned in `test/core/architectures.test.ts`).

## Spec target

DTCG Design Tokens Format Module **2025.10** (first stable). Color values are objects (`{colorSpace, components, alpha?, hex?}`); dimensions are `{value, unit}`. Theming is the separate Resolver Module 2025.10 (`.resolver.json`), read by the active-set picker; Token Atlas's model is multi-file (theme files reference a shared primitives file).

## Releasing

Automated: every push to `develop` opens/updates a `release/next` → `main` PR
from conventional-commit history; merging it builds and attaches the `.vsix` to
a GitHub Release. Not on the Marketplace. To install a build:
`code --install-extension token-atlas-<v>.vsix --force`, then reload the window.
Mechanism and workflow map: [`docs/releasing.md`](docs/releasing.md).

## CI

Every workflow in `.github/workflows/` is a thin stub calling a reusable
workflow in the public [`chrisgriffin/workflows`](https://github.com/chrisgriffin/workflows)
repo at its `v1` tag.

**Build gate:**
`npm run format:check && npm run typecheck && npm test && npm run build && npm run test:integration`
(CI wraps the last in `xvfb-run -a`).
