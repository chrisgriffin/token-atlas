/**
 * Uses of deprecated tokens, inside a real VS Code (spec 070).
 *
 * The suite writes a token file and a CSS file into the workspace for its own
 * run and deletes both after, so the token-file list `panel.test.ts` asserts
 * is untouched. `retired.brand` is deprecated directly, `retired.legacy.*`
 * through its group; `retired.use` aliases one of each and a current token.
 * `src/host/diagnostics.ts` puts a Hint tagged Deprecated on each such
 * reference, and on the CSS `var(--retired-brand)`; alias completion tags the
 * deprecated candidates. A resolver's inline tokens get the same hint; that
 * file lives outside the workspace so the active-set picker never lists it.
 */
import * as assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import type { TokenAtlasTestHooks } from "../../src/extension";

const workspace = vscode.workspace.workspaceFolders![0].uri;
const tokens = vscode.Uri.joinPath(workspace, "deprecated.tokens.json");
const css = vscode.Uri.joinPath(workspace, "deprecated.css");
const color = { colorSpace: "srgb", components: [1, 0, 0] };
const dir = mkdtempSync(join(tmpdir(), "token-atlas-deprecated-"));
const resolver = vscode.Uri.file(join(dir, "deprecated.resolver.json"));

async function waitFor<T>(
  check: () => T | undefined | Promise<T | undefined>,
  what: string,
  ms = 20_000,
): Promise<T> {
  const deadline = Date.now() + ms;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}

/** Resolves once `uri`'s diagnostics have not changed for `ms`. */
async function quiet(uri: vscode.Uri, ms = 600): Promise<void> {
  let last = Date.now();
  const sub = vscode.languages.onDidChangeDiagnostics((e) => {
    if (e.uris.some((u) => u.toString() === uri.toString())) last = Date.now();
  });
  try {
    await waitFor(() => (Date.now() - last >= ms ? true : undefined), "diagnostics to settle");
  } finally {
    sub.dispose();
  }
}

/** Token Atlas's deprecation hints on `uri`, as `text: message` with the struck-through text. */
const hints = (doc: vscode.TextDocument) =>
  vscode.languages
    .getDiagnostics(doc.uri)
    .filter((d) => d.source === "Token Atlas" && d.code === "deprecated-token")
    .map((d) => {
      assert.equal(d.severity, vscode.DiagnosticSeverity.Hint);
      assert.deepEqual(d.tags, [vscode.DiagnosticTag.Deprecated]);
      return `${doc.getText(d.range)}: ${d.message}`;
    })
    .sort();

describe("Deprecated token uses", () => {
  before(async () => {
    const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>("chrisgriffin.token-atlas");
    assert.ok(ext, "extension not found");
    await ext.activate();
    writeFileSync(
      tokens.fsPath,
      JSON.stringify(
        {
          retired: {
            $type: "color",
            brand: { $value: color, $deprecated: "use retired.current" },
            current: { $value: color },
            legacy: { $deprecated: true, red: { $value: color } },
            use: {
              a: { $value: "{retired.brand}" },
              b: { $value: "{retired.legacy.red}" },
              c: { $value: "{retired.current}" },
              d: { $value: "" },
            },
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(css.fsPath, ".a { color: var(--retired-brand); }\n");
    writeFileSync(
      resolver.fsPath,
      JSON.stringify(
        {
          version: "2025.10",
          resolutionOrder: [
            {
              type: "set",
              name: "inline",
              sources: [
                {
                  $type: "color",
                  old: { $value: color, $deprecated: "use new" },
                  use: { $value: "{old}" },
                },
              ],
            },
          ],
        },
        null,
        2,
      ),
    );
  });

  after(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    rmSync(tokens.fsPath, { force: true });
    rmSync(css.fsPath, { force: true });
    rmSync(dir, { recursive: true, force: true });
  });

  it("strikes through each reference to a deprecated token in a token file", async () => {
    const doc = await vscode.workspace.openTextDocument(tokens);
    await vscode.window.showTextDocument(doc);
    const found = await waitFor(() => (hints(doc).length === 2 ? hints(doc) : undefined), "hints");
    assert.deepEqual(found, [
      "{retired.brand}: {retired.brand} is deprecated: use retired.current",
      "{retired.legacy.red}: {retired.legacy.red} is deprecated.",
    ]);
  });

  it("strikes through a use of a deprecated token in CSS", async () => {
    const doc = await vscode.workspace.openTextDocument(css);
    await vscode.window.showTextDocument(doc);
    const found = await waitFor(() => (hints(doc).length ? hints(doc) : undefined), "CSS hint");
    assert.deepEqual(found, [
      "--retired-brand: {retired.brand} is deprecated: use retired.current",
    ]);
  });

  it("re-computes a code document's hints once per pause in typing", async () => {
    // #449: a keystroke in code rebuilds the hints from the workspace index, so
    // that waits for a pause. Each recompute makes new Diagnostic objects, so
    // the distinct objects seen while typing count the recomputes.
    const doc = await vscode.workspace.openTextDocument(css);
    await vscode.window.showTextDocument(doc);
    await waitFor(() => (hints(doc).length ? true : undefined), "CSS hint");
    // The suite's own token write invalidates the index, which re-validates
    // every open document 250 ms later; let that land before counting.
    await quiet(css);
    const own = () =>
      vscode.languages.getDiagnostics(css).filter((d) => d.code === "deprecated-token");
    const before = new Set(own());
    const seen = new Set<vscode.Diagnostic>();
    const sub = vscode.languages.onDidChangeDiagnostics(() => own().forEach((d) => seen.add(d)));
    try {
      // Eight keystrokes back to back. No sleep between them: on a loaded
      // runner an 80 ms sleep plus the applyEdit round trip reached the 250 ms
      // pause that ends a burst, and the hints rightly refreshed mid-burst.
      for (let i = 0; i < 8; i++) {
        const edit = new vscode.WorkspaceEdit();
        edit.insert(css, doc.positionAt(doc.getText().length), " ");
        assert.ok(await vscode.workspace.applyEdit(edit));
        own().forEach((d) => seen.add(d));
      }
      await new Promise((r) => setTimeout(r, 1500));
      own().forEach((d) => seen.add(d));
    } finally {
      sub.dispose();
    }
    const recomputes = [...seen].filter((d) => !before.has(d)).length;
    assert.ok(recomputes <= 1, `hints recomputed ${recomputes} times for one burst of typing`);
    assert.deepEqual(hints(doc), [
      "--retired-brand: {retired.brand} is deprecated: use retired.current",
    ]);
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand("workbench.action.files.revert");
  });

  it("strikes through a reference in a resolver's inline tokens", async () => {
    const doc = await vscode.workspace.openTextDocument(resolver);
    await vscode.window.showTextDocument(doc);
    const found = await waitFor(() => (hints(doc).length ? hints(doc) : undefined), "hint");
    assert.deepEqual(found, ["{old}: {old} is deprecated: use new"]);
  });

  it("tags deprecated tokens in alias completion", async () => {
    const doc = await vscode.workspace.openTextDocument(tokens);
    const at = doc.positionAt(doc.getText().indexOf('"$value": ""') + '"$value": "'.length);
    const tagged = await waitFor(async () => {
      const list = await vscode.commands.executeCommand<vscode.CompletionList>(
        "vscode.executeCompletionItemProvider",
        doc.uri,
        at,
      );
      const byLabel = new Map(
        list.items.map((i) => [typeof i.label === "string" ? i.label : i.label.label, i.tags]),
      );
      return byLabel.has("retired.brand") ? byLabel : undefined;
    }, "completion items");
    assert.deepEqual(tagged.get("retired.brand"), [vscode.CompletionItemTag.Deprecated]);
    assert.deepEqual(tagged.get("retired.legacy.red"), [vscode.CompletionItemTag.Deprecated]);
    assert.equal(tagged.get("retired.current"), undefined);
  });
});
