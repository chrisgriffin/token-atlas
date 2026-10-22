/**
 * The visual editor's modes, inside a real VS Code (spec 063).
 *
 * `light.tokens.json` is the last file of `themes.resolver.json`'s `light`
 * context, so its editor shows the `theme` modifier's modes. An edit to the
 * `dark` cell must land in `dark.tokens.json`, as the one `$value` it
 * changes, and picking `dark` from the dropdown must make the dark
 * resolution active everywhere.
 *
 * Each intent goes in through `hooks.tokenEditor.receive`, as in
 * `token-editor-writes.test.ts`; every file is left as it was found.
 */
import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { TokenAtlasTestHooks } from "../../src/extension";

const workspace = vscode.workspace.workspaceFolders![0].uri;
const LIGHT = vscode.Uri.joinPath(workspace, "light.tokens.json");
const DARK = vscode.Uri.joinPath(workspace, "dark.tokens.json");
type Intent = Parameters<TokenAtlasTestHooks["tokenEditor"]["receive"]>[1];

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

/** Send `intent` to the visual editor on the light file. */
async function send(intent: Intent): Promise<void> {
  await vscode.commands.executeCommand("vscode.openWith", LIGHT, "tokenAtlas.tokenEditor.any");
  await waitFor(async () => {
    try {
      await hooks.tokenEditor.receive(LIGHT, intent);
      return true;
    } catch {
      return false;
    }
  }, "the visual editor to take the intent");
}

/** The hover over `{ref}` in a fresh untitled document. */
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

before(async () => {
  const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>("chrisgriffin.token-atlas");
  assert.ok(ext, "extension not found");
  hooks = await ext.activate();
});

describe("Visual editor modes", () => {
  it("writes another mode's cell into that mode's file, and nothing else", async () => {
    const dark = await vscode.workspace.openTextDocument(DARK);
    const light = await vscode.workspace.openTextDocument(LIGHT);
    const before = dark.getText();
    const lightBefore = light.getText();
    const path = ["theme", "accent"];
    try {
      await send({ type: "setModeValue", context: "dark", path, value: "{color.base.blue-600}" });
      await waitFor(() => dark.getText() !== before, "the dark file to change");
      assert.equal(
        dark.getText(),
        before.replace('"{color.base.blue-400}"', '"{color.base.blue-600}"'),
      );
      assert.equal(light.getText(), lightBefore);
    } finally {
      await send({ type: "setModeValue", context: "dark", path, value: "{color.base.blue-400}" });
      await waitFor(() => dark.getText() === before, "the dark file to be restored");
      await dark.save();
    }
  });

  it("makes the picked mode the active resolution", async () => {
    try {
      await send({ type: "setMode", context: "dark" });
      await waitFor(
        async () => (await hoverOf("theme.surface")).includes("#1e293b"),
        "theme.surface to resolve to dark's slate-800",
      );
      await send({ type: "setMode", context: "light" });
      await waitFor(
        async () => (await hoverOf("theme.surface")).includes("#f1f5f9"),
        "theme.surface to resolve to light's slate-100",
      );
    } finally {
      await vscode.commands.executeCommand("tokenAtlas.chooseActiveSet", []);
    }
  });
});
