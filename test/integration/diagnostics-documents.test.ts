/**
 * Which documents get Token Atlas diagnostics, inside a real VS Code.
 *
 * A token file shown a second time under another scheme — the left side of a
 * git diff is a `git:` document over the same text — must not report its
 * problems twice in the Problems panel. The scheme here is the test's own,
 * standing in for `git:`, whose provider belongs to the built-in Git
 * extension.
 */
import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { TokenAtlasTestHooks } from "../../src/extension";

const PROBLEM = "Unresolved reference: {nowhere.at.all}";
const TEXT = JSON.stringify({ alias: { $type: "color", $value: "{nowhere.at.all}" } }, null, 2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(check: () => T | Promise<T>, what: string, ms = 20_000): Promise<T> {
  const deadline = Date.now() + ms;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}

const reported = (uri: vscode.Uri) =>
  vscode.languages.getDiagnostics(uri).filter((d) => d.message === PROBLEM);

before(async () => {
  const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>("chrisgriffin.token-atlas");
  assert.ok(ext, "extension not found");
  await ext.activate();
});

describe("Diagnostics by document", () => {
  it("reports nothing on a read-only copy under another scheme", async () => {
    const scheme = "token-atlas-test";
    const provider = vscode.workspace.registerTextDocumentContentProvider(scheme, {
      provideTextDocumentContent: () => TEXT,
    });
    try {
      // A positive control: the same text, untitled, is reported.
      const untitled = await vscode.workspace.openTextDocument({ language: "json", content: TEXT });
      await waitFor(() => reported(untitled.uri).length > 0, "the untitled copy's problem");
      const copy = await vscode.workspace.openTextDocument(
        vscode.Uri.from({ scheme, path: "/light.tokens.json" }),
      );
      await vscode.languages.setTextDocumentLanguage(copy, "json");
      await vscode.window.showTextDocument(copy);
      await sleep(1_500);
      assert.deepEqual(reported(copy.uri), [], "the read-only copy reported its problem");
    } finally {
      provider.dispose();
    }
  });
});
