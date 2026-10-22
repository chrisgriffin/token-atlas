/**
 * Color swatches beside color tokens used in code, inside a real VS Code.
 *
 * `exported.css` uses `--color-base-white` once and defines it once; only the
 * use gets a swatch, in the token's color from primitives.tokens.json, and
 * `tokenAtlas.codeColorSwatches: false` clears it. VS Code cannot read
 * decorations back, so the extension's test hook reports what it drew.
 */
import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { TokenAtlasTestHooks } from "../../src/extension";

const workspace = vscode.workspace.workspaceFolders![0].uri;
const config = () => vscode.workspace.getConfiguration("tokenAtlas");

async function waitFor<T>(check: () => T, what: string, ms = 20_000): Promise<T> {
  const deadline = Date.now() + ms;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = check();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}

describe("Color swatches in code", () => {
  let hooks: TokenAtlasTestHooks;

  before(async () => {
    const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>("chrisgriffin.token-atlas");
    assert.ok(ext, "extension not found");
    hooks = await ext.activate();
  });

  after(async () => {
    await config().update("codeColorSwatches", undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  it("draws the token's color before each use, and nothing once turned off", async () => {
    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(workspace, "exported.css"),
    );
    await vscode.window.showTextDocument(doc);
    const drawn = () =>
      hooks
        .codeSwatches(doc.uri)
        .map((s) => `${s.range.start.line} ${doc.getText(s.range)} ${s.color}`);

    const found = await waitFor(() => (drawn().length ? drawn() : undefined), "code swatches");
    const use = doc
      .getText()
      .split("\n")
      .findIndex((l) => l.includes("var(--color-base-white)"));
    assert.deepEqual(found, [`${use} --color-base-white #ffffff`]);

    await config().update("codeColorSwatches", false, vscode.ConfigurationTarget.Global);
    await waitFor(() => drawn().length === 0, "swatches cleared");
  });
});
