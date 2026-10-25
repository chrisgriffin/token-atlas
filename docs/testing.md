# Testing

The tests prove that the pure token logic — parsing, alias resolution, validation and format-preserving edits — is correct on its own, and that the extension really activates and behaves inside a running VS Code.

## The gate

- CI runs this repo's gate on every PR; the commands are the `run:` steps of
  its CI workflow in `.github/workflows/`.
- A PR merges only when that gate is green.
- Run the same commands locally before pushing. A failing test is fixed in
  the code, never by weakening the assertion.
- A behavior change starts with a test that fails without it.

## Running tests

`build-check.yml` runs these six, in this order:

- `npm run format:check` — Prettier over everything `.prettierignore` does not exclude, in the shared style `@chrisgriffin/config/prettier` sets.
- `npm run lint` — ESLint from `eslint.config.mjs`, which spreads `@chrisgriffin/config/eslint` first.
- `npm run typecheck` — `tsc --noEmit`, with a `tsconfig.json` that extends `@chrisgriffin/config/tsconfig.json`.
- `npm test` — `vitest run`, the whole vitest suite. Needs no build.
- `npm run build` — `node esbuild.mjs`, producing `dist/extension.js` and `dist/webview.js`.
- `npm run test:integration` — compiles the integration suite to `out/` and launches a downloaded VS Code through `vscode-test`. It needs a display, so CI runs it as `xvfb-run -a npm run test:integration`.
- `test/integration-run.mjs` runs `vscode-test` for that last command and names a failure in the step's own output:
  - a test failed → `Integration tests failed`, exit 1 as before;
  - VS Code logged `CodeWindow: detected unresponsive` before any test ran → `VS Code startup hang`, retried once, exit 3 if it hangs again (a recovered run leaves a warning);
  - no test reported and no hang logged → `No integration tests reported`, exit 4.

Narrower runs while working: `npx vitest run test/core/parse.test.ts` for one file, `npx vitest` to watch. `VSCODE_VERSION=1.90.0 npm run test:integration` checks the extension against an older VS Code instead of `stable`.

## What is tested

- `test/core/` — the pure TypeScript in `src/core/`: parsing, alias resolution and cycles, cross-file collisions, colour math, unit conversion, validation, hovers and format-preserving serialisation. Runs in vitest's `node` environment.
- `test/webview/` — the React visual editor's components and its render logic, in a `jsdom` environment (the `webview` project in `vitest.config.ts`). It exercises the webview in isolation; it never talks to a real extension host.
- `test/host/` — the `src/host/` modules that load without the `vscode` module, such as the Tokens tree's codicon per type, and the ones that load against `vscode-stub.ts`, a stand-in just big enough for the workspace index, diagnostics and hover to count searches and file reads or fire a close by hand. Runs in vitest's `node` environment; anything that needs real VS Code behavior — tabs, custom editors, tree views, settings — belongs in `test/integration/`.
- `test/ci/` — repo-shape guards that read files off disk rather than running code: the `package.json` ↔ `src/` identifier couplings, `contributes.configuration` defaults, what `.vscodeignore` keeps out of a packaged `.vsix`, the README's settings table, the Marketplace listing fields, that every path CLAUDE.md's couplings table names still exists, and the workflow stubs' guards and `timeout-minutes`, and that Prettier, ESLint and TypeScript read the shared `@chrisgriffin/config` configs.
- `test/integration/` — mocha running _inside_ a downloaded VS Code via `@vscode/test-cli`, configured in `.vscode-test.mjs` against the token workspace in `test/integration/workspace/`. It reaches the extension only through the `vscode` API and the `TokenAtlasTestHooks` value `activate()` returns; those are test hooks, not a public API, and nothing outside the tests may depend on them.
- Vitest cannot load the `vscode` module at all, so `vitest.config.ts` excludes `test/integration/**`. Anything about tabs, custom editors, tree views or settings can only be tested in the integration layer.

## Adding a test

- A new test goes in the folder for its layer and is named `<subject>.test.ts`, or `.test.tsx` for a webview component — `vitest.config.ts` collects `test/**/*.test.ts` and `test/**/*.test.tsx` only.
- Token sets to test against live in `test/fixtures/architectures/`, one folder per token architecture, which `test/core/architectures.test.ts` walks. `examples/` and `fixtures/` at the repo root are for running the extension by hand, not for tests.
- Webview tests build their state from the helpers in `test/webview/fixtures.ts`.
- An integration test is a `.test.ts` under `test/integration/`, compiled to `out/integration/` by `esbuild.mjs --integration`; the workspace it opens is `test/integration/workspace/`.
