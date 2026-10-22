import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `.tsx` so webview component tests are collected at all, not just the
    // plain-logic `.test.ts` files.
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    // Those run inside a real VS Code via `npm run test:integration`; the
    // `vscode` module does not exist here.
    exclude: ["test/integration/**", "**/node_modules/**"],
    // Default stays `node`: `test/core/` is pure TS and `test/ci/` reads files
    // off disk, so neither wants the cost of a DOM.
    environment: "node",
    environmentMatchGlobs: [["test/webview/**", "jsdom"]],
  },
});
