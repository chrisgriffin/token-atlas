/**
 * The Token Editor on a file that holds no tokens (spec 055).
 *
 * VS Code offers the editor on any *.json, because its menu matches filenames
 * only. On a file with no tokens the editor shows a "Reopen in Text Editor"
 * message instead of mounting the table, so no intent handler is registered.
 */
import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { TokenAtlasTestHooks } from "../../src/extension";

const workspace = vscode.workspace.workspaceFolders![0].uri;
const file = (name: string) => vscode.Uri.joinPath(workspace, name);
let hooks: TokenAtlasTestHooks;

async function waitFor<T>(check: () => T | Promise<T>, what: string, ms = 20_000): Promise<T> {
  const deadline = Date.now() + ms;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}

const customTab = (uri: vscode.Uri) =>
  vscode.window.tabGroups.all
    .flatMap((g) => g.tabs)
    .find(
      (t) =>
        t.input instanceof vscode.TabInputCustom &&
        t.input.uri.toString() === uri.toString() &&
        t.input.viewType === "tokenAtlas.tokenEditor.any",
    );

before(async () => {
  const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>("chrisgriffin.token-atlas");
  assert.ok(ext, "extension not found");
  hooks = await ext.activate();
});

describe("Token Editor on a file with no tokens", () => {
  it("opens a message, not the table", async () => {
    const plain = file("not-tokens.json");
    await vscode.commands.executeCommand("vscode.openWith", plain, "tokenAtlas.tokenEditor.any");
    await waitFor(() => customTab(plain), "the Token Editor tab on not-tokens.json");
    // Give a table editor time to register, were one mounting.
    await new Promise((r) => setTimeout(r, 500));
    assert.throws(
      () => hooks.tokenEditor.receive(plain, { type: "ready" }),
      /No Token Atlas editor/,
    );
  });

  it("still mounts the table on a token file", async () => {
    const tokens = file("primitives.tokens.json");
    await vscode.commands.executeCommand("vscode.openWith", tokens, "tokenAtlas.tokenEditor.any");
    await waitFor(() => {
      try {
        void hooks.tokenEditor.receive(tokens, { type: "ready" });
        return true;
      } catch {
        return false;
      }
    }, "the table editor on primitives.tokens.json");
  });
});
