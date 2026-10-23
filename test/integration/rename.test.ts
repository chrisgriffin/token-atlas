/**
 * Cross-file rename, exercised inside a real VS Code.
 *
 * `src/host/rename.ts` is the widest write Token Atlas makes: renaming one key
 * opens every indexed token file and rewrites its `{reference}`s as a single
 * `WorkspaceEdit`, at offsets computed from documents the user never opened.
 * `test/core/edits.test.ts` covers `computeRenameEdits` and
 * `computeReferenceRenameEdits` as pure functions; what it cannot reach is the
 * host wiring around them — the cross-file walk, the local-first skip and the
 * two `TokenRenameProvider` guards — because all three need the `vscode`
 * module, which vitest cannot load (#274).
 *
 * Every assertion below is on what a consumer observes: the `WorkspaceEdit`
 * the rename provider hands back, and the document text once it is applied.
 *
 * The fixtures are written by the test rather than committed, because
 * `panel.test.ts` asserts the workspace's token-file list exactly and a
 * committed token file would move it — the pattern `detection.test.ts` already
 * uses for `empty.tokens.json`. They are plain `*.json` and are discovered by
 * content (rule 3), which is also what makes the teardown deterministic: see
 * the `after` hook. Their indentation is deliberately unlike the rest of the
 * workspace, because invariant 1 (format-preserving writes) is only observable
 * against formatting a whole-document rewrite would normalise.
 */
import * as assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import * as vscode from "vscode";
import type { TokenAtlasTestHooks } from "../../src/extension";

const workspace = vscode.workspace.workspaceFolders![0].uri;
const file = (name: string) => vscode.Uri.joinPath(workspace, name);
const baseName = (uri: vscode.Uri) => uri.path.slice(uri.path.lastIndexOf("/") + 1);

const SOURCE = "rename-source.json";
const USER = "rename-user.json";
const OWN = "rename-own.json";

const FIXTURES: Record<string, string> = {
  // Defines swatch.primary. The rename starts here.
  [SOURCE]: `{
    "swatch": {
        "$type": "color",

        "primary": {
            "$value": { "colorSpace": "srgb", "components": [0.2, 0.4, 0.6], "hex": "#336699" }
        }
    }
}
`,
  // Only *uses* swatch.primary, twice: the cross-file rewrite, in a file the
  // rename never opens on its own.
  [USER]: `{
    "card": {
        "$type": "color",

        "border":  { "$value": "{swatch.primary}" },
        "fill":    { "$value": "{swatch.primary}" }
    }
}
`,
  // Defines swatch.primary itself *and* references it. Local-first (invariant
  // 4): its reference resolves to its own token, so renaming the other file's
  // must leave this one alone. The reference is what makes that assertion able
  // to fail — a file with nothing to rewrite would pass either way.
  [OWN]: `{
    "swatch": {
        "$type": "color",
        "primary": {
            "$value": { "colorSpace": "srgb", "components": [1, 0, 0], "hex": "#ff0000" }
        }
    },
    "chip": {
        "$type": "color",
        "fill": { "$value": "{swatch.primary}" }
    }
}
`,
};

// Code that uses swatch.primary (#441): rename rewrites each occurrence in its
// own spelling, declarations included, and leaves a generated file alone. Not
// token files, so neither the panel nor the teardown's blanking concerns them.
const CSS = "rename-usage.css";
const JS = "rename-usage.js";
const GENERATED = "rename-generated.css";

const CODE: Record<string, string> = {
  [CSS]: `/* Hand-written: redeclares the token and uses it, once behind a prefix. */
:root {
  --swatch-primary: inherit;
}
.card {
  border-color: var(--swatch-primary);
  outline-color: var(--ds-swatch-primary);
  grid-area: swatch-primary;
}
`,
  [JS]: `// Hand-written: the camelCase export and the dotted object path.
import { swatchPrimary, tokens } from "./tokens.js";
export const edges = [swatchPrimary, tokens.swatch.primary];
`,
  [GENERATED]: `/**
 * Do not edit directly, this file was generated automatically.
 */
:root {
  --swatch-primary: inherit;
}
`,
};

let hooks: TokenAtlasTestHooks;

/** Poll until `check` returns a truthy value; discovery and indexing are debounced. */
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

const textOf = async (name: string) =>
  (await vscode.workspace.openTextDocument(file(name))).getText();

/** The position just inside `needle`'s first occurrence in `name`. */
async function positionOf(name: string, needle: string): Promise<vscode.Position> {
  const doc = await vscode.workspace.openTextDocument(file(name));
  const offset = doc.getText().indexOf(needle);
  assert.notEqual(offset, -1, `${name} no longer contains ${needle}`);
  return doc.positionAt(offset + 1);
}

/** The WorkspaceEdit the rename provider offers for `needle` in `name`. */
async function renameEdit(
  name: string,
  needle: string,
  newName: string,
): Promise<vscode.WorkspaceEdit | undefined> {
  return vscode.commands.executeCommand<vscode.WorkspaceEdit | undefined>(
    "vscode.executeDocumentRenameProvider",
    file(name),
    await positionOf(name, needle),
    newName,
  );
}

before(async () => {
  const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>("chrisgriffinio.token-atlas");
  assert.ok(ext, "extension not found");
  hooks = await ext.activate();
});

describe("Cross-file rename", () => {
  // The fixtures are written here and not in a root-level hook: a `before`
  // outside a describe belongs to the root suite and would run ahead of every
  // other file's tests, moving the token-file list panel.test.ts asserts.
  before(async () => {
    for (const [name, text] of Object.entries({ ...FIXTURES, ...CODE })) {
      writeFileSync(file(name).fsPath, text);
    }
    // The workspace scan is what finds the new files; it is invalidated by the
    // write and re-runs asynchronously, so wait for the walk to reach them
    // before asserting anything about what it rewrote.
    await waitFor(async () => {
      const edit = await renameEdit(SOURCE, '"primary"', "brand");
      const names = edit?.entries().map(([uri]) => baseName(uri)) ?? [];
      return names.includes(USER) && names.includes(CSS) && names.includes(JS);
    }, `the cross-file walk to reach ${USER}, ${CSS} and ${JS}`);
  });

  after(async () => {
    // Deleting the files is not enough on its own. `findTokenFiles` takes a
    // discovered file's text from an open TextDocument when there is one, and a
    // document outlives the editor that showed it, so a deleted fixture stays
    // listed for as long as its document lingers and the workspace search
    // service's file list is stale — which leaves the panel wrong while a later
    // file asserts it exactly. Emptying each document of DTCG keys first makes
    // the content sniff reject it whichever of the two is consulted, so the
    // teardown does not depend on either clearing.
    for (const name of Object.keys(FIXTURES)) {
      const doc = await vscode.workspace.openTextDocument(file(name));
      const blank = new vscode.WorkspaceEdit();
      blank.replace(
        doc.uri,
        new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)),
        '{ "gone": true }\n',
      );
      await vscode.workspace.applyEdit(blank);
      await doc.save();
    }
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    for (const name of Object.keys({ ...FIXTURES, ...CODE })) {
      rmSync(file(name).fsPath, { force: true });
    }
    // Re-scan on the config lever rather than the file watcher: a settings
    // change invalidates the index there and then (workspaceIndex.ts), while
    // the watcher's delete event is debounced and, on a loaded machine, slow.
    const config = () => vscode.workspace.getConfiguration("tokenAtlas");
    await config().update("exclude", ["**/rename-*.json"], vscode.ConfigurationTarget.Global);
    await config().update("exclude", undefined, vscode.ConfigurationTarget.Global);
    // Gone again before any later file runs: panel.test.ts asserts its list exactly.
    const listed = async () =>
      ((await hooks.tokenTree.provider.getChildren()) ?? []) as Array<{ uri: vscode.Uri }>;
    await waitFor(
      async () => !(await listed()).some((i) => Object.keys(FIXTURES).includes(baseName(i.uri))),
      "the written fixtures dropped from the panel",
    );
  });

  describe("the applied edit", () => {
    before(async () => {
      const edit = await renameEdit(SOURCE, '"primary"', "brand");
      assert.ok(edit, "the rename provider offered no edit");
      assert.ok(await vscode.workspace.applyEdit(edit), "the WorkspaceEdit was not applied");
      // Saved so the later cleanup closes clean editors, and so the assertions
      // read what a user would be left with on disk. Each document by name:
      // `saveAll` straight after `applyEdit` saves none of them, and a document
      // left dirty over the old text on disk can be reloaded from it mid-suite.
      for (const [uri] of edit.entries()) {
        assert.ok(await (await vscode.workspace.openTextDocument(uri)).save(), "not saved");
      }
    });

    it("rewrites the definition key in the file the rename started in", async () => {
      const text = await textOf(SOURCE);
      assert.ok(text.includes('"brand": {'), `the key was not renamed:\n${text}`);
      assert.ok(!text.includes('"primary"'), `the old key survived:\n${text}`);
    });

    it("rewrites a {reference} in a different file", async () => {
      const text = await textOf(USER);
      assert.ok(text.includes("{swatch.brand}"), `the reference was not rewritten:\n${text}`);
      assert.ok(!text.includes("{swatch.primary}"), `an old reference survived:\n${text}`);
    });

    it("skips a file that defines the renamed path itself", async () => {
      // Local-first, invariant 4: rename-own.json's {swatch.primary}
      // means *its own* swatch.primary, so not one byte of it may move.
      assert.equal(await textOf(OWN), FIXTURES[OWN]);
    });

    it("rewrites CSS usages and declarations, prefix kept, and no bare word that spells the token", async () => {
      // `grid-area: swatch-primary` names a grid area, not the token: in a
      // stylesheet only a variable (`--x`, `$x`, `@x`) can be one.
      assert.equal(await textOf(CSS), CODE[CSS].replaceAll("-swatch-primary", "-swatch-brand"));
    });

    it("rewrites JS camelCase and dotted-path usages", async () => {
      assert.equal(
        await textOf(JS),
        CODE[JS].replaceAll("swatchPrimary", "swatchBrand").replace(
          "tokens.swatch.primary",
          "tokens.swatch.brand",
        ),
      );
    });

    it("leaves a generated code file to its export tool", async () => {
      assert.equal(await textOf(GENERATED), CODE[GENERATED]);
    });

    it("preserves the formatting outside the renamed spans", async () => {
      // Invariant 1: the whole document, byte for byte, with only the key and
      // the two references replaced — blank lines and alignment included.
      assert.equal(await textOf(SOURCE), FIXTURES[SOURCE].replace('"primary"', '"brand"'));
      assert.equal(
        await textOf(USER),
        FIXTURES[USER].replaceAll("{swatch.primary}", "{swatch.brand}"),
      );
    });
  });

  // Guarded against the file the rename above must not touch, so these hold
  // whichever order mocha runs the two groups in.
  describe("the guards", () => {
    it("rejects a rename to an empty, dotted, braced or $-prefixed name", async () => {
      for (const bad of ["", "a.b", "{x}", "$description"]) {
        await assert.rejects(
          async () => {
            await renameEdit(OWN, '"primary"', bad);
          },
          /may not be empty, start with "\$"/,
          `${JSON.stringify(bad)} was accepted as a token name`,
        );
      }
    });

    it("rejects prepareRename off a token key", async () => {
      const uri = file(OWN);
      // A positive control first: on a token key it resolves, so the rejection
      // below is the guard and not a provider that never answers.
      const resolved = await vscode.commands.executeCommand<{ placeholder: string }>(
        "vscode.prepareRename",
        uri,
        await positionOf(OWN, '"primary"'),
      );
      assert.equal(resolved.placeholder, "primary");

      await assert.rejects(async () => {
        await vscode.commands.executeCommand(
          "vscode.prepareRename",
          uri,
          await positionOf(OWN, '"$type"'),
        );
      }, /Put the cursor on a token or group name/);
    });
  });
});
