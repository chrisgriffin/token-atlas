/**
 * Alias completion and find-all-references, exercised inside a real VS Code (#291).
 *
 * `src/host/languageFeatures.ts` registers `TokenCompletionProvider` and
 * `TokenReferenceProvider` over token documents. Completion inside a `$value`
 * string offers every token of the expected type — the document's own and,
 * through the workspace index, every other file's, the document's own winning
 * where both define a path (invariant 4). Find-references walks every token
 * file, not just index winners, for aliases naming the token under the cursor.
 *
 * Both take a `vscode.TextDocument` and a `vscode.Position`, so vitest cannot
 * reach either: everything here goes through `executeCompletionItemProvider`
 * and `executeReferenceProvider`, the same way the suggest widget and
 * Shift+F12 do.
 *
 * The one fixture this suite adds, `completion-plain.json`, carries no DTCG
 * key, so it moves neither the token-file list `panel.test.ts` asserts
 * verbatim nor the swatch counts `color.test.ts` asserts. Every token case
 * uses the fixtures that were already there.
 */
import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { TokenAtlasTestHooks } from "../../src/extension";

const workspace = vscode.workspace.workspaceFolders![0].uri;
const file = (name: string) => vscode.Uri.joinPath(workspace, name);
const baseName = (uri: vscode.Uri) => uri.path.slice(uri.path.lastIndexOf("/") + 1);

/**
 * Poll until `check` returns a value; the workspace index is built lazily.
 *
 * `check` returns `undefined` until it has an answer, rather than a falsy value
 * of its own — the same contract `definition.test.ts` states for its copy.
 */
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

/** The position just inside `needle`'s first occurrence in `name`. */
async function positionOf(name: string, needle: string) {
  const uri = file(name);
  const doc = await vscode.workspace.openTextDocument(uri);
  const offset = doc.getText().indexOf(needle);
  assert.notEqual(offset, -1, `${name} no longer contains ${needle}`);
  return { uri, position: doc.positionAt(offset + 1) };
}

/**
 * The position just inside the key that opens `path`'s member in `name`.
 *
 * Walks the path group by group, matching each key against the `{` that opens
 * its member rather than the bare key: `"light"` is also a plain string value
 * under `$themes` → `selectedTokenSets` in `studio.tokens.json`, ahead of the
 * `light` group itself (`definition.test.ts`'s `keyOffsetOf` says the same).
 */
async function keyPositionOf(name: string, path: string[]) {
  const uri = file(name);
  const doc = await vscode.workspace.openTextDocument(uri);
  const text = doc.getText();
  let cursor = 0;
  let offset = -1;
  for (const key of path) {
    const opens = new RegExp(`"${key}"\\s*:\\s*\\{`, "g");
    opens.lastIndex = cursor;
    const match = opens.exec(text);
    assert.ok(match, `${name} no longer opens a member at ${path.join(".")}`);
    offset = match.index;
    cursor = match.index + match[0].length;
  }
  return { uri, position: doc.positionAt(offset + 1) };
}

type Suggestion = { label: string; description: string; detail: string; kind?: number };

const labelOf = (item: vscode.CompletionItem) =>
  typeof item.label === "string" ? item.label : item.label.label;

/** Every completion item offered at `position` in `uri`, from every provider. */
async function completionsAt(uri: vscode.Uri, position: vscode.Position) {
  const list = await vscode.commands.executeCommand<vscode.CompletionList>(
    "vscode.executeCompletionItemProvider",
    uri,
    position,
  );
  return list?.items ?? [];
}

/**
 * Token Atlas's alias suggestions at `needle` in `name`.
 *
 * `executeCompletionItemProvider` merges every provider, and the built-in JSON
 * language service answers for the same file, so the filter is Token Atlas's
 * signature: an alias item inserts exactly `{<its label>}`, quoted or not.
 */
async function aliasSuggestionsAt(name: string, needle: string): Promise<Suggestion[]> {
  const { uri, position } = await positionOf(name, needle);
  return (await completionsAt(uri, position))
    .filter((item) => {
      const insert = typeof item.insertText === "string" ? item.insertText : "";
      return insert.replace(/^"|"$/g, "") === `{${labelOf(item)}}`;
    })
    .map((item) => ({
      label: labelOf(item),
      description: typeof item.label === "string" ? "" : (item.label.description ?? ""),
      detail: item.detail ?? "",
      kind: item.kind,
    }));
}

/** Token Atlas's `colorSpace` suggestions at `needle` in `name`: the enum it offers there. */
async function colorSpaceSuggestionsAt(name: string, needle: string): Promise<string[]> {
  const { uri, position } = await positionOf(name, needle);
  return (await completionsAt(uri, position))
    .filter((item) => item.kind === vscode.CompletionItemKind.EnumMember)
    .map(labelOf)
    .filter((label) => ["srgb", "display-p3", "oklch"].includes(label));
}

/**
 * The references at the key opening `path` in `name` that land in a token
 * file, each as `<file> <the key text the range covers>`.
 *
 * `executeReferenceProvider` merges every provider; the filter keeps only
 * Token Atlas's shape of answer, as `definition.test.ts` does for definitions.
 * `memberRange(...).selection` is the referencing token's own quoted key, so
 * reading it back pins each hit to a member rather than to a file.
 */
async function referencesTo(name: string, path: string[]): Promise<vscode.Location[]> {
  const { uri, position } = await keyPositionOf(name, path);
  const found =
    (await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeReferenceProvider",
      uri,
      position,
    )) ?? [];
  return found.filter((loc) => loc.uri.path.endsWith(".tokens.json"));
}

async function describeLocation(loc: vscode.Location) {
  const doc = await vscode.workspace.openTextDocument(loc.uri);
  return `${baseName(loc.uri)} ${doc.getText(loc.range)} @${doc.offsetAt(loc.range.start)}`;
}

/** The same description, computed from the fixture: where `path`'s key sits in `name`. */
async function expectedLocation(name: string, path: string[]) {
  const { uri, position } = await keyPositionOf(name, path);
  const doc = await vscode.workspace.openTextDocument(uri);
  const offset = doc.offsetAt(position) - 1;
  return `${name} "${path[path.length - 1]}" @${offset}`;
}

describe("Alias completion and find-all-references", () => {
  // Inside the suite, not at the root: a root-level hook belongs to the root
  // suite and runs around every other file's tests too (exports.test.ts and
  // rename.test.ts both say the same). Nothing here opens an editor — both
  // commands work off a TextDocument — so there is no teardown to pair with it.
  before(async () => {
    const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>("chrisgriffin.token-atlas");
    assert.ok(ext, "extension not found");
    await ext.activate();
  });

  describe("alias completion", () => {
    it("offers the token paths defined in the same document", async () => {
      // studio.tokens.json's `semantic.page` is `{light.surface}`. Completion
      // inside it offers both colour tokens the same file defines, each with no
      // file in its description — the provider's mark for "this document".
      const offered = await waitFor(async () => {
        const found = await aliasSuggestionsAt("studio.tokens.json", '"{light.surface}"');
        return found.some((s) => s.label === "light.surface") ? found : undefined;
      }, "alias completion in studio.tokens.json");
      for (const key of ["light.surface", "dark.surface"]) {
        const item = offered.find((s) => s.label === key);
        assert.ok(item, `${key} was not offered: ${JSON.stringify(offered.map((s) => s.label))}`);
        assert.equal(item.description, "color", `${key} was labelled as another file's`);
      }
      // Never the token itself: an alias to its own path is a cycle.
      assert.ok(!offered.some((s) => s.label === "semantic.page"), "offered the token itself");
    });

    it("offers paths from a second file via the workspace index, the document's own winning", async () => {
      // light.tokens.json defines only `theme.*`, every one an alias into
      // primitives.tokens.json. Completion in `theme.background` must reach
      // that second file through the index.
      const offered = await waitFor(async () => {
        const found = await aliasSuggestionsAt("light.tokens.json", '"{color.base.white}"');
        return found.some((s) => s.label === "color.base.slate-900") ? found : undefined;
      }, "cross-file alias completion in light.tokens.json");
      const fromPrimitives = offered.find((s) => s.label === "color.base.slate-900");
      assert.ok(fromPrimitives);
      assert.equal(fromPrimitives.description, "color · primitives.tokens.json");
      assert.equal(fromPrimitives.detail, "#0f172a");

      // Local-first, invariant 4: `theme.surface` is defined by light.tokens.json
      // AND by dark.tokens.json, and the workspace index keeps only one of them
      // (first file wins). So from BOTH files — whichever lost the index is the
      // one where the override does work — it must be offered once, as the
      // document's own: no file in its description, and resolved through that
      // document's alias, never the other file's.
      for (const [name, needle, hex] of [
        ["light.tokens.json", '"{color.base.white}"', "#f1f5f9"],
        ["dark.tokens.json", '"{color.base.slate-900}"', "#1e293b"],
      ]) {
        const surfaces = (await aliasSuggestionsAt(name, needle)).filter(
          (s) => s.label === "theme.surface",
        );
        assert.equal(surfaces.length, 1, `${name}: theme.surface offered ${surfaces.length} times`);
        assert.equal(
          surfaces[0].description,
          "color",
          `${name}: theme.surface was labelled as another file's`,
        );
        assert.equal(
          surfaces[0].detail,
          hex,
          `${name}: theme.surface resolved through the other file`,
        );
      }
    });

    it("offers nothing in ordinary JSON", async () => {
      // A positive control first: on a token file's `colorSpace` value the
      // provider answers with the colour-space enum, so the silence below is
      // the content gate and not a provider that never ran.
      assert.ok(
        (await colorSpaceSuggestionsAt("primitives.tokens.json", '"srgb"')).length > 0,
        "no colorSpace completion in a token file, so the silence below proves nothing",
      );

      // completion-plain.json has no DTCG key (invariant 3), yet it carries a
      // `colorSpace` property — the one completion branch that does not need a
      // `$value` path, so only `isTokenDocument` can keep it silent — and an
      // alias-shaped string naming a real workspace token.
      assert.deepEqual(await colorSpaceSuggestionsAt("completion-plain.json", '"srgb"'), []);
      assert.deepEqual(
        await aliasSuggestionsAt("completion-plain.json", '"{color.base.white}"'),
        [],
      );
    });
  });

  describe("find-all-references", () => {
    it("returns every alias to a token, including one in a second file", async () => {
      // `light.surface` is defined in studio.tokens.json and aliased twice:
      // by `semantic.page` in that same file, and by `button.surface` in
      // shared.tokens.json, which does not define it. Nothing else names it,
      // so the set is exact — a missed file or a stray hit both fail.
      const expected = [
        await expectedLocation("shared.tokens.json", ["button", "surface"]),
        await expectedLocation("studio.tokens.json", ["semantic", "page"]),
      ];
      const found = await waitFor(async () => {
        const locations = await referencesTo("studio.tokens.json", ["light", "surface"]);
        return locations.length >= expected.length ? locations : undefined;
      }, "references to light.surface in two files");
      const described = (await Promise.all(found.map(describeLocation))).sort();
      assert.deepEqual(described, expected);
    });
  });
});
