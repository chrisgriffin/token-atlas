/**
 * Go to Symbol in Workspace (Cmd+T) over tokens, inside a real VS Code.
 *
 * `src/host/languageFeatures.ts` registers `TokenWorkspaceSymbolProvider`,
 * which answers from the workspace token index with the active token
 * document's own definitions first. Everything goes through
 * `executeWorkspaceSymbolProvider`, the same way Cmd+T does.
 */
import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { TokenAtlasTestHooks } from "../../src/extension";

const workspace = vscode.workspace.workspaceFolders![0].uri;
const file = (name: string) => vscode.Uri.joinPath(workspace, name);

/** The symbols named exactly `name` for `query`, polled: the index is built lazily. */
async function symbolsNamed(query: string, name: string): Promise<vscode.SymbolInformation[]> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const found =
      (await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        "vscode.executeWorkspaceSymbolProvider",
        query,
      )) ?? [];
    const named = found.filter((s) => s.name === name);
    if (named.length || Date.now() > deadline) return named;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** The text a symbol's range covers in its file. */
async function textAt(symbol: vscode.SymbolInformation): Promise<string> {
  const doc = await vscode.workspace.openTextDocument(symbol.location.uri);
  return doc.getText(symbol.location.range);
}

describe("Token workspace symbols", () => {
  before(async () => {
    const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>("chrisgriffinio.token-atlas");
    assert.ok(ext, "extension not found");
    await ext.activate();
  });

  after(() => vscode.commands.executeCommand("workbench.action.closeAllEditors"));

  it("finds a token by its dotted path and lands on its key", async () => {
    const [symbol, ...rest] = await symbolsNamed("color.base.white", "color.base.white");
    assert.ok(symbol, "no symbol for color.base.white");
    assert.deepEqual(rest, [], "color.base.white listed more than once");
    assert.ok(symbol.location.uri.path.endsWith("/primitives.tokens.json"));
    assert.equal(symbol.containerName, "primitives.tokens.json");
    assert.equal(symbol.kind, vscode.SymbolKind.Variable);
    assert.equal(await textAt(symbol), '"white"');
  });

  it("matches a fuzzy query", async () => {
    const [symbol] = await symbolsNamed("cbwhite", "color.base.white");
    assert.ok(symbol, "cbwhite did not match color.base.white");
  });

  it("returns nothing for a query no token path matches", async () => {
    const found =
      (await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        "vscode.executeWorkspaceSymbolProvider",
        "zzqx-no-such-token",
      )) ?? [];
    assert.deepEqual(found, []);
  });

  it("puts the active token document's definition first for a shared path", async () => {
    // brand-a and brand-b both define brand.primary; the index alone gives one.
    for (const brand of ["brand-a", "brand-b"]) {
      await vscode.window.showTextDocument(file(`${brand}.tokens.json`));
      const [symbol, ...rest] = await symbolsNamed("brand.primary", "brand.primary");
      assert.ok(symbol, "no symbol for brand.primary");
      assert.deepEqual(rest, [], "brand.primary listed more than once");
      assert.ok(
        symbol.location.uri.path.endsWith(`/${brand}.tokens.json`),
        `with ${brand} active, brand.primary landed in ${symbol.location.uri.path}`,
      );
      assert.equal(await textAt(symbol), '"primary"');
    }
  });
});
