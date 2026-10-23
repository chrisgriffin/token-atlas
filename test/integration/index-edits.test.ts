/**
 * The workspace index while files are being edited, inside a real VS Code.
 *
 * An edit replaces only the edited file's entry in the index
 * (`src/host/workspaceIndex.ts`); `test/host/workspaceIndex.test.ts` pins
 * what that costs. These pin what a user sees while it happens: half-typed
 * JSON in one file never breaks another file's references, a file that stops
 * holding tokens leaves the index, a discarded edit leaves with its buffer,
 * and a file renamed inside the active token set stays in it.
 *
 * The fixtures are written by the test and blanked before removal, for the
 * reasons `rename.test.ts` gives: `panel.test.ts` asserts the token-file list
 * exactly.
 */
import * as assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import * as vscode from "vscode";
import type { TokenAtlasTestHooks } from "../../src/extension";

const workspace = vscode.workspace.workspaceFolders![0].uri;
const file = (name: string) => vscode.Uri.joinPath(workspace, name);
const baseName = (uri: vscode.Uri) => uri.path.slice(uri.path.lastIndexOf("/") + 1);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const config = () => vscode.workspace.getConfiguration("tokenAtlas");

let hooks: TokenAtlasTestHooks;

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

/** The hover over `{ref}` in a fresh untitled document, which never joins the index. */
async function hoverOf(ref: string): Promise<string> {
  const doc = await vscode.workspace.openTextDocument({
    language: "json",
    content: `{ "p": { "$value": "{${ref}}" } }`,
  });
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    doc.uri,
    doc.positionAt(doc.getText().indexOf(`{${ref}}`) + 2),
  );
  return hovers
    .flatMap((h) => h.contents.map((c) => (typeof c === "string" ? c : c.value)))
    .join("\n");
}

async function replaceAll(doc: vscode.TextDocument, text: string): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    doc.uri,
    new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)),
    text,
  );
  assert.ok(await vscode.workspace.applyEdit(edit), "the edit was not applied");
}

const listed = async () =>
  (((await hooks.tokenTree.provider.getChildren()) ?? []) as Array<{ uri: vscode.Uri }>).map((i) =>
    baseName(i.uri),
  );

/** Blank, close and delete `names`, then wait for the panel to drop them. */
async function remove(...names: string[]): Promise<void> {
  for (const name of names) {
    try {
      const doc = await vscode.workspace.openTextDocument(file(name));
      await replaceAll(doc, '{ "gone": true }\n');
      await doc.save();
    } catch {
      /* already gone */
    }
  }
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  for (const name of names) rmSync(file(name).fsPath, { force: true });
  await config().update("exclude", ["**/index-*.json"], vscode.ConfigurationTarget.Global);
  await config().update("exclude", undefined, vscode.ConfigurationTarget.Global);
  await waitFor(
    async () => !(await listed()).some((n) => names.includes(n)),
    `${names.join(", ")} dropped from the panel`,
  );
}

before(async () => {
  const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>("chrisgriffinio.token-atlas");
  assert.ok(ext, "extension not found");
  hooks = await ext.activate();
});

describe("Index while editing", () => {
  afterEach(() => vscode.commands.executeCommand("tokenAtlas.chooseActiveSet", []));

  it("keeps another file's references resolved while one file's JSON is half-typed", async () => {
    const prim = await vscode.workspace.openTextDocument(file("primitives.tokens.json"));
    const light = await vscode.workspace.openTextDocument(file("light.tokens.json"));
    await vscode.window.showTextDocument(light, vscode.ViewColumn.Two);
    await vscode.window.showTextDocument(prim, vscode.ViewColumn.One);
    const errors = () =>
      vscode.languages
        .getDiagnostics(light.uri)
        .filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    await waitFor(() => errors().length === 0, "light.tokens.json free of errors");
    const original = prim.getText();
    try {
      // The user starts typing a new key: `"new` — not JSON yet.
      const edit = new vscode.WorkspaceEdit();
      edit.insert(prim.uri, prim.positionAt(original.indexOf('"base"')), '"new');
      assert.ok(await vscode.workspace.applyEdit(edit));
      // Diagnostics re-run a quarter second after the index tells them to.
      await sleep(2_000);
      assert.deepEqual(
        errors().map((d) => d.message),
        [],
        "half-typed JSON in primitives.tokens.json broke light.tokens.json",
      );
    } finally {
      await replaceAll(prim, original);
      await prim.save();
    }
  });

  it("drops a .json file edited so it no longer holds tokens", async () => {
    const name = "index-stale.json";
    writeFileSync(file(name).fsPath, '{ "indexstale": { "$type": "number", "$value": 7 } }\n');
    try {
      const doc = await vscode.workspace.openTextDocument(file(name));
      await vscode.window.showTextDocument(doc);
      await waitFor(async () => (await hoverOf("indexstale")).length > 0, "the token to resolve");
      await replaceAll(doc, "{}\n"); // unsaved
      await waitFor(
        async () => (await hoverOf("indexstale")).length === 0,
        "the token gone from the index",
        5_000,
      );
    } finally {
      await remove(name);
    }
  });

  it("drops a discarded edit when its file is closed without saving", async () => {
    const name = "index-revert.json";
    writeFileSync(file(name).fsPath, '{ "indexsaved": { "$type": "number", "$value": 1 } }\n');
    try {
      const doc = await vscode.workspace.openTextDocument(file(name));
      await vscode.window.showTextDocument(doc);
      await replaceAll(doc, '{ "indexunsaved": { "$type": "number", "$value": 2 } }\n');
      await waitFor(async () => (await hoverOf("indexunsaved")).length > 0, "the unsaved token");
      await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
      await waitFor(
        async () =>
          (await hoverOf("indexunsaved")).length === 0 && (await hoverOf("indexsaved")).length > 0,
        "the file's saved tokens back in the index",
        5_000,
      );
    } finally {
      await remove(name);
    }
  });

  it("keeps a file renamed inside the active token set in it", async () => {
    const from = "index-moved.json";
    const to = "index-moved-2.json";
    writeFileSync(file(from).fsPath, '{ "indexmoved": { "$type": "number", "$value": 3 } }\n');
    try {
      await waitFor(async () => (await listed()).includes(from), `${from} listed`);
      await vscode.commands.executeCommand("tokenAtlas.chooseActiveSet", [file(from).toString()]);
      await waitFor(async () => (await hoverOf("indexmoved")).length > 0, "the token to resolve");
      const move = new vscode.WorkspaceEdit();
      move.renameFile(file(from), file(to));
      assert.ok(await vscode.workspace.applyEdit(move), "the rename was not applied");
      await waitFor(async () => (await listed()).includes(to), `${to} listed`);
      await waitFor(
        async () => (await hoverOf("indexmoved")).length > 0,
        "the renamed file still active",
        5_000,
      );
    } finally {
      await vscode.commands.executeCommand("tokenAtlas.chooseActiveSet", []);
      await remove(from, to);
    }
  });
});
