// `npm run test:integration`: the extension loaded into a downloaded VS Code,
// against the small token workspace in test/integration/workspace.
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@vscode/test-cli";

// A short userDataDir (#434): VS Code binds its IPC socket inside it and macOS
// caps a socket path at 103 characters, so the default under the checkout fails
// `listen EINVAL` from a long worktree path. One per checkout, so two worktrees
// running at once never share a VS Code instance.
const checkoutHash = createHash("sha1")
  .update(import.meta.dirname)
  .digest("hex")
  .slice(0, 8);

export default defineConfig({
  files: "out/integration/**/*.test.js",
  workspaceFolder: "test/integration/workspace",
  // `VSCODE_VERSION=1.90.0 npm run test:integration` checks an older build.
  version: process.env.VSCODE_VERSION ?? "stable",
  // Only Token Atlas: other extensions would add noise and startup time.
  launchArgs: [
    "--disable-extensions",
    "--disable-workspace-trust",
    `--user-data-dir=${join(tmpdir(), `token-atlas-${checkoutHash}`)}`,
  ],
  mocha: { ui: "bdd", timeout: 60_000 },
});
