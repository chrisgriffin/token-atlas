/**
 * The visual editor's write path, exercised inside a real VS Code.
 *
 * Invariant 1 (format-preserving writes) is the product's reason to exist, and
 * the visual editor is the one place a token is edited without typing JSON.
 * `test/core/{serialize,edits}.test.ts` cover the surgical-edit primitives as
 * pure functions; what they cannot reach is `src/host/tokenEditorProvider.ts`
 * turning a webview intent into a ranged `WorkspaceEdit` on a real document
 * (#298).
 *
 * VS Code has no API for posting a message *from* a webview, so each intent
 * goes in through `hooks.tokenEditor.receive`: the same queue and handler the
 * editor's own `onDidReceiveMessage` feeds.
 *
 * Every assertion is on the bytes the edit left alone, never on a re-parsed
 * value: a writer that re-serialised the whole document would produce the same
 * tokens and must still fail here. The fixture carries comments, blank lines,
 * four-space indents and aligned values for that reason — a round trip through
 * `JSON.stringify` keeps none of them.
 *
 * The fixture is written by the test rather than committed, and emptied before
 * it is removed, for the reasons `rename.test.ts` gives: `panel.test.ts`
 * asserts the workspace's token-file list exactly.
 */
import * as assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import * as vscode from "vscode";
import type { TokenAtlasTestHooks } from "../../src/extension";

const workspace = vscode.workspace.workspaceFolders![0].uri;
const baseName = (uri: vscode.Uri) => uri.path.slice(uri.path.lastIndexOf("/") + 1);

const NAME = "editor-writes.json";
const uri = vscode.Uri.joinPath(workspace, NAME);

// One token per intent; `stale` sits mid-group so removing it takes no comma
// from a neighbour.
const FIXTURE = `{
    // Brand palette.
    "palette": {
        "$type": "color",

        "ink": {
            "$value":       "#111111",
            "$description": "Body text"
        },

        /* kept through every edit */
        "paper": {
            "$value": "#ffffff"
        },
        "stale": {
            "$value": "#ff00ff"
        },
        "base": {
            "$value": "#3366cc"
        },
        "accent": {
            "$value": "{palette.base}"
        }
    }
}
`;

type Intent = Parameters<TokenAtlasTestHooks["tokenEditor"]["receive"]>[1];

let hooks: TokenAtlasTestHooks;

/** Poll until `check` returns a truthy value; the editor resolves asynchronously. */
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

/**
 * Send `intent` to the visual editor on the fixture, and return the document
 * text before and after. The editor is opened here, not once for the suite:
 * `panel.test.ts`'s root-level `afterEach` closes every editor after each test
 * in every file. Saved for the same reason — that close must find it clean.
 */
async function apply(intent: Intent): Promise<{ before: string; after: string }> {
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.commands.executeCommand("vscode.openWith", uri, "tokenAtlas.tokenEditor.any");
  const before = doc.getText();
  // `receive` throws until the editor has resolved; once it stops, it has run
  // the intent through the editor's queue and the edit is applied.
  await waitFor(async () => {
    try {
      await hooks.tokenEditor.receive(uri, intent);
      return true;
    } catch {
      return false;
    }
  }, "the visual editor to take the intent");
  await doc.save();
  return { before, after: doc.getText() };
}

/**
 * The lines `before` lost and `after` gained, once the lines they share at the
 * head and the tail are set aside. Everything outside the two lists is
 * byte-identical by construction, so asserting the lists exactly is asserting
 * that nothing else in the document moved.
 */
function changed(before: string, after: string): { lost: string[]; gained: string[] } {
  const a = before.split("\n");
  const b = after.split("\n");
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }
  return { lost: a.slice(head, a.length - tail), gained: b.slice(head, b.length - tail) };
}

/** Replace the fixture's whole text and save it. */
async function rewrite(text: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    uri,
    new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)),
    text,
  );
  await vscode.workspace.applyEdit(edit);
  // This document, awaited: left dirty, a later `saveAll` in another file
  // would write it back to disk after the suite has removed it.
  assert.ok(await doc.save(), "the fixture was not saved");
}

before(async () => {
  const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>("chrisgriffin.token-atlas");
  assert.ok(ext, "extension not found");
  hooks = await ext.activate();
});

describe("Visual editor writes", () => {
  // Written here and not in a root-level hook, which would run ahead of every
  // other file's tests and move the token-file list panel.test.ts asserts.
  before(() => writeFileSync(uri.fsPath, FIXTURE));

  // Every test starts from the fixture as written. Left to accumulate, the
  // first whole-document rewrite would normalise the file and every later
  // test would be comparing one normalised document with another.
  beforeEach(() => rewrite(FIXTURE));

  after(async () => {
    // Emptied of DTCG keys before it is removed, then re-scanned on the config
    // lever: rename.test.ts's teardown explains why deleting alone is not enough.
    await rewrite('{ "gone": true }\n');
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    rmSync(uri.fsPath, { force: true });
    const config = () => vscode.workspace.getConfiguration("tokenAtlas");
    await config().update("exclude", [`**/${NAME}`], vscode.ConfigurationTarget.Global);
    await config().update("exclude", undefined, vscode.ConfigurationTarget.Global);
    const listed = async () =>
      ((await hooks.tokenTree.provider.getChildren()) ?? []) as Array<{ uri: vscode.Uri }>;
    await waitFor(
      async () => !(await listed()).some((i) => baseName(i.uri) === NAME),
      "the written fixture dropped from the panel",
    );
  });

  it("setValue rewrites the value and no other byte", async () => {
    const { before, after } = await apply({
      type: "setValue",
      path: ["palette", "paper"],
      value: "#fafafa",
    });
    assert.deepEqual(changed(before, after), {
      lost: ['            "$value": "#ffffff"'],
      gained: ['            "$value": "#fafafa"'],
    });
  });

  it("setDescription rewrites the description and keeps the alignment beside it", async () => {
    const { before, after } = await apply({
      type: "setDescription",
      path: ["palette", "ink"],
      description: "Headings",
    });
    assert.deepEqual(changed(before, after), {
      lost: ['            "$description": "Body text"'],
      gained: ['            "$description": "Headings"'],
    });
  });

  it("addToken inserts the token and takes no line away", async () => {
    const { before, after } = await apply({
      type: "addToken",
      parentPath: ["palette"],
      name: "highlight",
    });
    const { lost, gained } = changed(before, after);
    // Nothing lost: the comma the previous sibling gains shows up as a gained
    // line, because its closing brace is matched by the new token's own.
    assert.deepEqual(lost, []);
    assert.deepEqual(
      gained.map((line) => line.trim()),
      ["},", '"highlight": {', '"$value": 0'],
    );
  });

  it("renameNode rewrites the key and its reference, and nothing between them", async () => {
    const { before, after } = await apply({
      type: "renameNode",
      path: ["palette", "base"],
      newName: "brand",
    });
    assert.ok(before.includes('"base": {') && before.includes('"{palette.base}"'));
    assert.equal(
      after,
      before.replace('"base": {', '"brand": {').replace('"{palette.base}"', '"{palette.brand}"'),
    );
  });

  it("deleteNode removes the token's own lines and no other", async () => {
    const { before, after } = await apply({ type: "deleteNode", path: ["palette", "stale"] });
    assert.deepEqual(changed(before, after), {
      lost: ['        "stale": {', '            "$value": "#ff00ff"', "        },"],
      gained: [],
    });
  });

  it("leaves the file alone when the path names nothing", async () => {
    const missing = ["palette", "missing"];
    const deleted = await apply({ type: "deleteNode", path: missing });
    assert.equal(deleted.after, deleted.before);
    const renamed = await apply({ type: "renameNode", path: missing, newName: "found" });
    assert.equal(renamed.after, renamed.before);
    // A positive control: the same route does write for a path that exists, so
    // the two no-ops above are the host declining and not an intent that never
    // arrived.
    const control = await apply({
      type: "setDeprecated",
      path: ["palette", "ink"],
      deprecated: true,
    });
    assert.notEqual(control.after, control.before);
  });

  it("an edit to an inherited ($extends) token writes an override in the extending group", async () => {
    await rewrite(`{
    "palette": {
        "$type": "color",
        "ink": { "$value": "#111111" }
    },
    "print": { "$extends": "{palette}" }
}
`);
    const { before, after } = await apply({
      type: "setDescription",
      path: ["print", "ink"],
      description: "Inherited, then overridden",
    });
    assert.notEqual(after, before);
    assert.ok(after.startsWith(before.slice(0, before.indexOf('"print"'))), "palette moved");
    assert.deepEqual(JSON.parse(after).print, {
      $extends: "{palette}",
      ink: { $value: "#111111", $description: "Inherited, then overridden" },
    });
  });

  it("saves column widths for every editor and leaves the file alone", async () => {
    const saved = await apply({ type: "setColumnWidths", widths: { name: 321, type: 90 } });
    assert.equal(saved.after, saved.before);
    // Global state, not this panel's: what every editor's `init` carries.
    assert.deepEqual(hooks.tokenEditor.columnWidths(), { name: 321, type: 90 });
    await apply({ type: "setColumnWidths", widths: {} });
    assert.deepEqual(hooks.tokenEditor.columnWidths(), {});
  });
});
