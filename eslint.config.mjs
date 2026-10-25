import base from "@chrisgriffin/config/eslint"
import globals from "globals"

export default [
  {
    ignores: [
      "dist/",
      "out/",
      ".vscode-test/",
      "examples/",
      "test/integration/workspace/",
    ],
  },
  ...base,
  {
    files: ["src/webview/**", "test/webview/**"],
    languageOptions: { globals: globals.browser },
  },
  {
    // A leading `_` marks a name that is unused on purpose: a rest sibling
    // that omits a key, or a parameter kept for the signature.
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]
