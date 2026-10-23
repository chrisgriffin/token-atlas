/**
 * DTCG resolver documents, exercised inside a real VS Code (spec 049).
 *
 * `themes.resolver.json` composes the fixture's existing files: the
 * primitives as a set, then a `theme` modifier choosing between
 * `light.tokens.json` and `dark.tokens.json`. Both define `theme.surface`,
 * so which one a reference resolves to shows which resolution is active —
 * and, in the two contexts that list both files, that the later one wins.
 * With no choice the index is URI order, where dark wins.
 *
 * Its `extras` set adds the sources spec 053 reads: `light.tokens.json#/theme`,
 * whose children become top-level paths (`surface`), and an inline `inline`
 * token, which lives in the resolver itself, beside `inlineAlias` (a
 * reference to it) and `edge` (a reference out to `color.base.slate-800`), so
 * rename and find-references can be seen crossing the resolver both ways.
 *
 * The reference is written in an untitled document, which is not on disk and
 * so never joins the index or the Tokens panel other suites count.
 */
import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { TokenAtlasTestHooks } from "../../src/extension";

const workspace = vscode.workspace.workspaceFolders![0].uri;
const RESOLVER = vscode.Uri.joinPath(workspace, "themes.resolver.json");
const LIGHT = "#f1f5f9"; // slate-100, light's theme.surface
const DARK = "#1e293b"; // slate-800, dark's theme.surface
const PROBE = {
  language: "json",
  content: '{ "probe": { "$type": "color", "$value": "{theme.surface}" } }',
};

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

const choose = (input: Record<string, string>) =>
  vscode.commands.executeCommand("tokenAtlas.chooseActiveSet", {
    resolver: RESOLVER.toString(),
    input,
  });

describe("DTCG resolver", () => {
  let probe: vscode.TextDocument;

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

  /** The hover over `{theme.surface}` in the untitled probe document. */
  async function surfaceHover(): Promise<string> {
    // No editor shows the probe, so VS Code may dispose it mid-suite; a closed
    // document has no hover at all.
    if (probe.isClosed) probe = await vscode.workspace.openTextDocument(PROBE);
    const at = probe.positionAt(probe.getText().indexOf("{theme.surface}") + 2);
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      "vscode.executeHoverProvider",
      probe.uri,
      at,
    );
    return hovers
      .flatMap((h) => h.contents.map((c) => (typeof c === "string" ? c : c.value)))
      .join("\n");
  }

  before(async () => {
    const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>("chrisgriffinio.token-atlas");
    assert.ok(ext, "extension not found");
    await ext.activate();
    probe = await vscode.workspace.openTextDocument(PROBE);
  });

  afterEach(async () => {
    await vscode.commands.executeCommand("tokenAtlas.chooseActiveSet", []);
  });

  after(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  it("resolves against the chosen context", async () => {
    await choose({ theme: "light" });
    await waitFor(async () => (await surfaceHover()).includes(LIGHT), "light's surface");
    await choose({ theme: "dark" });
    await waitFor(async () => (await surfaceHover()).includes(DARK), "dark's surface");
  });

  it("lets the later source win where a context lists both files", async () => {
    // URI order alone would pick dark here; the resolver puts light last.
    await choose({ theme: "lightOverDark" });
    await waitFor(async () => (await surfaceHover()).includes(LIGHT), "light, listed last");
    await choose({ theme: "darkOverLight" });
    await waitFor(async () => (await surfaceHover()).includes(DARK), "dark, listed last");
  });

  it("uses the modifier's default when the input leaves it out", async () => {
    await choose({});
    await waitFor(async () => (await surfaceHover()).includes(LIGHT), "the default, light");
  });

  it("rejects an input that names no resolution, and keeps the set it had", async () => {
    await choose({ theme: "dark" });
    await waitFor(async () => (await surfaceHover()).includes(DARK), "dark's surface");
    await assert.rejects(async () => choose({ theme: "sepia" }), /no context "sepia"/);
    await assert.rejects(
      async () => choose({ theme: "dark", mode: "x" }),
      /No modifier named "mode"/,
    );
    await assert.rejects(
      async () =>
        vscode.commands.executeCommand("tokenAtlas.chooseActiveSet", {
          resolver: vscode.Uri.joinPath(workspace, "nope.resolver.json").toString(),
        }),
      /No resolver document/,
    );
    assert.ok((await surfaceHover()).includes(DARK), "the dark resolution is still active");
  });

  it("reads part of a file through a #/pointer, its children top-level", async () => {
    await choose({ theme: "dark" });
    // `surface` exists only as light.tokens.json's theme.surface, re-rooted.
    await waitFor(async () => (await hoverOf("surface")).includes(LIGHT), "the fragment's surface");
    await waitFor(async () => (await surfaceHover()).includes(DARK), "dark's theme.surface");
  });

  it("resolves tokens written inline in the resolver, and goes to them there", async () => {
    await choose({ theme: "light" });
    const doc = await vscode.workspace.openTextDocument({
      language: "json",
      content: '{ "p": { "$type": "number", "$value": "{inline}" } }',
    });
    const at = doc.positionAt(doc.getText().indexOf("{inline}") + 2);
    const [location] = await waitFor(async () => {
      const found = await vscode.commands.executeCommand<vscode.Location[]>(
        "vscode.executeDefinitionProvider",
        doc.uri,
        at,
      );
      return found?.length ? found : undefined;
    }, "a definition for {inline}");
    assert.equal(location.uri.toString(), RESOLVER.toString());
    const resolver = await vscode.workspace.openTextDocument(RESOLVER);
    assert.equal(resolver.getText(location.range), '"inline"');
  });

  /** Where `needle` starts in `uri`, one character in. */
  async function at(uri: vscode.Uri, needle: string) {
    const doc = await vscode.workspace.openTextDocument(uri);
    return doc.positionAt(doc.getText().indexOf(needle) + 1);
  }

  /** Every replacement a rename at `needle` makes in the resolver, sorted. */
  async function renameInResolver(uri: vscode.Uri, needle: string, name: string) {
    const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
      "vscode.executeDocumentRenameProvider",
      uri,
      await at(uri, needle),
      name,
    );
    return edit
      .get(RESOLVER)
      .map((e) => e.newText)
      .sort();
  }

  /** The keys `needle`'s references cover in the resolver. */
  async function referencesInResolver(uri: vscode.Uri, needle: string) {
    const found = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeReferenceProvider",
      uri,
      await at(uri, needle),
    );
    const resolver = await vscode.workspace.openTextDocument(RESOLVER);
    return found
      .filter((l) => l.uri.toString() === RESOLVER.toString())
      .map((l) => resolver.getText(l.range));
  }

  const PRIMITIVES = vscode.Uri.joinPath(workspace, "primitives.tokens.json");

  it("renames an inline token in the resolver, and the references to it there", async () => {
    assert.deepEqual(await renameInResolver(RESOLVER, '"inline"', "renamed"), [
      '"renamed"',
      '"{renamed}"',
    ]);
  });

  it("rewrites a reference inside an inline source when a file token is renamed", async () => {
    assert.deepEqual(await renameInResolver(PRIMITIVES, '"slate-800"', "slate-850"), [
      '"{color.base.slate-850}"',
    ]);
  });

  it("finds references inside inline sources, to inline and to file tokens", async () => {
    assert.deepEqual(await referencesInResolver(RESOLVER, '"inline"'), ['"inlineAlias"']);
    assert.deepEqual(await referencesInResolver(PRIMITIVES, '"slate-800"'), ['"edge"']);
  });

  it("checks the resolver document itself, and does not treat it as a token file", async () => {
    // It holds an inline token, so it sniffs as DTCG; it is still a resolver.
    const doc = await vscode.workspace.openTextDocument(RESOLVER);
    const messages = await waitFor(() => {
      const found = vscode.languages.getDiagnostics(RESOLVER).map((d) => d.message);
      return found.length >= 2 ? found.sort() : undefined;
    }, "the resolver's diagnostics");
    assert.deepEqual(messages, [
      "File not found: missing.tokens.json",
      "No token group at light.tokens.json#/nope",
    ]);
    assert.equal(doc.languageId, "json");
  });
});
