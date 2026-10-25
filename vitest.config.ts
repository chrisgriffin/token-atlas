import { defineConfig } from "vitest/config"

// Those run inside a real VS Code via `npm run test:integration`; the
// `vscode` module does not exist here.
const exclude = ["test/integration/**", "**/node_modules/**"]

export default defineConfig({
  test: {
    // Vitest 4 dropped `environmentMatchGlobs`; one project per environment
    // replaces it.
    projects: [
      {
        test: {
          name: "node",
          // `test/core/` is pure TS and `test/ci/` reads files off disk, so
          // neither wants the cost of a DOM.
          include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
          exclude: [...exclude, "test/webview/**"],
          environment: "node",
        },
      },
      {
        test: {
          name: "webview",
          // `.tsx` so webview component tests are collected at all, not just
          // the plain-logic `.test.ts` files.
          include: ["test/webview/**/*.test.ts", "test/webview/**/*.test.tsx"],
          exclude,
          environment: "jsdom",
        },
      },
    ],
  },
})
