/**
 * The Tokens panel and the visual editor, exercised inside a real VS Code.
 *
 * Every test here pins a bug that shipped or nearly shipped and that no unit
 * test could see, because it lived in how VS Code's tabs, tree views and
 * custom editors behave together.
 */
import * as assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import * as vscode from "vscode";
import type { TokenAtlasTestHooks } from "../../src/extension";

type Item = { uri: vscode.Uri; node?: { name: string; kind: string; path: string[] } };

const workspace = vscode.workspace.workspaceFolders![0].uri;
const file = (name: string) => vscode.Uri.joinPath(workspace, name);
const baseName = (uri: vscode.Uri) => uri.path.slice(uri.path.lastIndexOf("/") + 1);

let hooks: TokenAtlasTestHooks;
const tree = () => hooks.tokenTree.provider;

/** Poll until `check` returns a truthy value; the panel refreshes on a debounce. */
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

const settle = (ms = 1_500) => new Promise((r) => setTimeout(r, ms));

async function roots(): Promise<Item[]> {
  return ((await tree().getChildren()) ?? []) as Item[];
}

async function rootNames(): Promise<string[]> {
  return (await roots()).map((i) => baseName(i.uri));
}

async function child(parent: Item | undefined, name: string): Promise<Item | undefined> {
  const kids = ((await tree().getChildren(parent as never)) ?? []) as Item[];
  return kids.find((k) => k.node?.name === name);
}

function tabsFor(uri: vscode.Uri): vscode.Tab[] {
  return vscode.window.tabGroups.all
    .flatMap((g) => g.tabs)
    .filter(
      (t) => (t.input as { uri?: vscode.Uri } | undefined)?.uri?.toString() === uri.toString(),
    );
}

function kinds(uri: vscode.Uri): string[] {
  return tabsFor(uri).map((t) =>
    t.input instanceof vscode.TabInputCustom
      ? "visual"
      : t.input instanceof vscode.TabInputText
        ? "text"
        : "other",
  );
}

const config = () => vscode.workspace.getConfiguration("tokenAtlas");

before(async () => {
  const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>("chrisgriffinio.token-atlas");
  assert.ok(ext, "extension not found");
  hooks = await ext.activate();
});

afterEach(async () => {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  await config().update("defaultEditor", undefined, vscode.ConfigurationTarget.Global);
  await config().update("exclude", undefined, vscode.ConfigurationTarget.Global);
});

describe("Tokens panel", () => {
  it("lists every token file in the workspace, whatever its name, and no other JSON", async () => {
    // scale/space.json is found by its content alone. not-tokens.json has no
    // DTCG keys; dist/ and package.json are kept out by the default exclude
    // even though both contain them.
    const listed = async () =>
      (await roots()).map((i) => vscode.workspace.asRelativePath(i.uri)).join();
    await waitFor(
      async () =>
        (await listed()) ===
        "brand-a.tokens.json,brand-b.tokens.json,dark.tokens.json,light.tokens.json,primitives.tokens.json,scale/space.json,shared.tokens.json,studio.tokens.json",
      "every token file, and not not-tokens.json, dist/ or package.json",
    );
  });

  it("skips a JSON file too big to scan", async () => {
    // big.json is DTCG, so only the size cap keeps it out. small.json is
    // written after it: once small.json is listed, a rescan has seen both.
    const big = file("big.json").fsPath;
    const small = file("small.json").fsPath;
    try {
      writeFileSync(
        big,
        JSON.stringify({ big: { $type: "string", $value: "x" }, pad: "x".repeat(3_000_000) }),
      );
      writeFileSync(small, JSON.stringify({ small: { $type: "string", $value: "y" } }));
      await waitFor(async () => (await rootNames()).includes("small.json"), "small.json listed");
      assert.ok(!(await rootNames()).includes("big.json"), "a 3 MB file was scanned");
    } finally {
      rmSync(big, { force: true });
      rmSync(small, { force: true });
    }
    await waitFor(async () => !(await rootNames()).includes("small.json"), "small.json gone");
  });

  it("expands the file you are looking at", async () => {
    await vscode.window.showTextDocument(file("light.tokens.json"));
    await waitFor(async () => {
      const light = (await roots()).find((i) => baseName(i.uri) === "light.tokens.json");
      return (
        light &&
        (await tree().getTreeItem(light as never)).collapsibleState ===
          vscode.TreeItemCollapsibleState.Expanded
      );
    }, "light.tokens.json expanded");
  });

  it("counts the tokens in each file and group, and in total", async () => {
    // scale/space.json holds two tokens, both in its `space` group.
    const space = await waitFor(
      async () =>
        (await roots()).find((i) => vscode.workspace.asRelativePath(i.uri) === "scale/space.json"),
      "scale/space.json listed",
    );
    assert.equal((await tree().getTreeItem(space as never)).description, "scale · 2");
    const group = await child(space, "space");
    assert.equal((await tree().getTreeItem(group as never)).description, "2");

    // The header is the sum of every file row's count.
    let sum = 0;
    for (const root of await roots()) {
      const parts = String((await tree().getTreeItem(root as never)).description).split(" · ");
      sum += Number(parts.find((p) => /^\d+$/.test(p)) ?? 0);
    }
    assert.equal(hooks.tokenTree.view.description, `${sum} tokens`);
  });

  it("follows an on-disk edit to a file that is not open", async () => {
    // Written behind VS Code's back, the way git checkout or another tool
    // would. The panel used to miss this until something unrelated refreshed it.
    const path = file("dark.tokens.json").fsPath;
    const original = readFileSync(path, "utf8");
    const accent = async () => {
      const dark = (await roots()).find((i) => baseName(i.uri) === "dark.tokens.json");
      const token = await child(await child(dark, "theme"), "accent");
      return token && (await tree().getTreeItem(token as never)).description;
    };
    const before = await waitFor(accent, "dark theme.accent");
    const edited = original.replace(
      /"accent":\s*\{\s*"\$value":\s*"\{[^}]+\}"/,
      '"accent": { "$value": "{color.base.white}"',
    );
    assert.notEqual(edited, original, "fixture no longer has theme.accent as an alias");
    try {
      writeFileSync(path, edited);
      await waitFor(async () => (await accent()) === "{color.base.white}", "the edited alias");
    } finally {
      writeFileSync(path, original);
    }
    await waitFor(async () => (await accent()) === before, "the restored alias");
  });

  it("drops a file matched by tokenAtlas.exclude, and brings it back", async () => {
    await waitFor(async () => (await rootNames()).includes("dark.tokens.json"), "dark listed");
    await config().update(
      "exclude",
      ["**/node_modules/**", "**/dark.tokens.json"],
      vscode.ConfigurationTarget.Global,
    );
    await waitFor(async () => !(await rootNames()).includes("dark.tokens.json"), "dark excluded");
    await config().update("exclude", undefined, vscode.ConfigurationTarget.Global);
    await waitFor(async () => (await rootNames()).includes("dark.tokens.json"), "dark restored");
  });
});

describe("Tokens view rows", () => {
  /** The file root for `name`, once the panel is listing it. */
  const fileRow = async (name: string) =>
    (await waitFor(
      async () => (await roots()).find((i) => baseName(i.uri) === name),
      `${name} listed`,
    ))!;

  /** A descendant of that file root, named segment by segment from the file down. */
  async function row(name: string, ...path: string[]): Promise<Item> {
    let item = await fileRow(name);
    for (const segment of path) {
      const parent = item;
      item = (await waitFor(() => child(parent, segment), `${name} → ${segment}`))!;
    }
    return item;
  }

  const itemFor = (item: Item) => tree().getTreeItem(item as never);
  const iconOf = async (item: Item) =>
    ((await itemFor(item)).iconPath as vscode.ThemeIcon | undefined)?.id;
  const contextOf = async (item: Item) => (await itemFor(item)).contextValue;
  const commandOf = async (item: Item) => (await itemFor(item)).command?.command;

  it("gives a token row the icon its DTCG $type maps to", async () => {
    // Two types that map to two icons: against a single type the assertion
    // would pass just as well on a hardcoded glyph.
    assert.equal(await iconOf(await row("light.tokens.json", "theme", "accent")), "symbol-color");
    assert.equal(await iconOf(await row("space.json", "space", "sm")), "symbol-ruler");
  });

  it("gives a group its own icon and leaves a file row's to the file icon theme", async () => {
    assert.equal(await iconOf(await row("light.tokens.json", "theme")), "folder");
    // A file row is built from the file's Uri, which sets `resourceUri` and
    // leaves `iconPath` unset on purpose: its icon is the theme's own for that
    // file type. The pair is the assertion — an absent icon on its own would
    // also hold if the row stopped being a resource at all.
    const light = file("light.tokens.json");
    const item = await itemFor(await fileRow("light.tokens.json"));
    assert.equal(item.iconPath, undefined);
    assert.equal(item.resourceUri?.toString(), light.toString());
  });

  it("carries a contextValue per row kind, so each kind gets its own menu", async () => {
    assert.equal(await contextOf(await fileRow("light.tokens.json")), "tokenAtlasFile");
    assert.equal(await contextOf(await row("light.tokens.json", "theme")), "tokenAtlasGroup");
    assert.equal(
      await contextOf(await row("light.tokens.json", "theme", "accent")),
      "tokenAtlasToken",
    );
  });

  it("clicks a token through to reveal, and a group through to the table", async () => {
    assert.equal(
      await commandOf(await row("light.tokens.json", "theme", "accent")),
      "tokenAtlas.revealToken",
    );
    assert.equal(
      await commandOf(await row("light.tokens.json", "theme")),
      "tokenAtlas.scopeToGroup",
    );
  });

  // The three below run the handler the case above only finds wired. It
  // scopes the visual editor's table, not this tree, so the scope is read
  // back from the host: a webview's contents cannot be seen from here.
  const light = file("light.tokens.json");
  const scopeOf = () => hooks.tokenEditor.scopeOf(light);
  /** What clicking that row passes to its command. */
  const clickOf = async (item: Item) => (await itemFor(item)).command!.arguments!;

  it("scopes the visual editor to the group clicked", async () => {
    const group = await clickOf(await row("light.tokens.json", "theme"));
    await vscode.commands.executeCommand("tokenAtlas.scopeToGroup", ...group);
    await waitFor(() => kinds(light).join() === "visual", "one visual tab on the file");
    assert.deepEqual(scopeOf(), ["theme"]);
  });

  it("returns a scoped editor to the whole file from the file row", async () => {
    const group = await clickOf(await row("light.tokens.json", "theme"));
    const whole = await clickOf(await fileRow("light.tokens.json"));
    await vscode.commands.executeCommand("tokenAtlas.scopeToGroup", ...group);
    assert.deepEqual(scopeOf(), ["theme"]);
    await vscode.commands.executeCommand("tokenAtlas.scopeToGroup", ...whole);
    assert.deepEqual(scopeOf(), []);
    assert.deepEqual(kinds(light), ["visual"]);
  });

  it("does nothing when scoped to a row that is not a group", async () => {
    // A token row is wired to reveal, never to this, so its arguments are
    // borrowed: same shape, a path that names a token.
    const token = await clickOf(await row("light.tokens.json", "theme", "accent"));
    const group = await clickOf(await row("light.tokens.json", "theme"));

    // Nothing open: nothing opens. The last case's editor takes its scope
    // with it as it closes, so wait for that rather than racing it.
    await waitFor(() => scopeOf() === undefined, "no editor left on the file");
    await vscode.commands.executeCommand("tokenAtlas.scopeToGroup", ...token);
    await settle();
    assert.deepEqual(kinds(light), [], "a token path opened the visual editor");
    assert.equal(scopeOf(), undefined);

    // Scoped to a group: it stays scoped to that group.
    await vscode.commands.executeCommand("tokenAtlas.scopeToGroup", ...group);
    await vscode.commands.executeCommand("tokenAtlas.scopeToGroup", ...token);
    assert.deepEqual(scopeOf(), ["theme"], "a token path replaced the group's scope");
    assert.deepEqual(kinds(light), ["visual"]);
  });

  it("keeps the rows it has when a token file goes invalid mid-edit", async () => {
    // Malformed JSON parses to an empty document rather than throwing, so the
    // file keeps its row and loses only its own children. Nothing asserted
    // here depends on which layer swallows it.
    const path = file("dark.tokens.json").fsPath;
    const original = readFileSync(path, "utf8");
    const darkChildren = async () =>
      (((await tree().getChildren((await fileRow("dark.tokens.json")) as never)) ?? []) as Item[])
        .length;
    await waitFor(async () => (await darkChildren()) > 0, "dark.tokens.json parsed");
    const before = await rootNames();
    assert.ok(before.length > 1, "nothing was listed to keep");
    try {
      writeFileSync(path, original.replace("{", "{{"));
      // Its children going empty is the proof the re-read landed: without this
      // wait every assertion below could pass against the pre-edit state.
      await waitFor(async () => (await darkChildren()) === 0, "dark.tokens.json unparsed");
      assert.deepEqual(await rootNames(), before, "invalid JSON dropped rows from the view");
      // The broken row still draws, and a sibling file keeps its own rows.
      assert.equal(await contextOf(await fileRow("dark.tokens.json")), "tokenAtlasFile");
      assert.ok(await row("light.tokens.json", "theme", "accent"), "a sibling file lost its rows");
    } finally {
      writeFileSync(path, original);
    }
    await waitFor(async () => (await darkChildren()) > 0, "dark.tokens.json parsed again");
  });

  // Rows a hand-edited file can produce: a $type no DTCG type matches, and a
  // dotted key (invalid, so validation reports it) beside the group path it
  // spells. Each still needs an icon and an id of its own, or VS Code throws
  // on the duplicate and the whole panel stops drawing.
  describe("odd rows", () => {
    const odd = file("odd.tokens.json");

    before(async () => {
      writeFileSync(
        odd.fsPath,
        JSON.stringify({
          mystery: { $type: "sparkle", $value: 1 },
          "a.b": { $type: "number", $value: 1 },
          a: { b: { $type: "number", $value: 2 } },
        }),
      );
      await fileRow("odd.tokens.json");
    });

    after(async () => {
      rmSync(odd.fsPath, { force: true });
      await waitFor(async () => !(await rootNames()).includes("odd.tokens.json"), "it gone");
    });

    it("gives a token of an unknown $type the plain token icon", async () => {
      assert.equal(await iconOf(await row("odd.tokens.json", "mystery")), "symbol-field");
    });

    it("gives a dotted key and the group path it spells different ids", async () => {
      const dotted = (await itemFor(await row("odd.tokens.json", "a.b"))).id;
      const nested = (await itemFor(await row("odd.tokens.json", "a", "b"))).id;
      assert.ok(dotted && nested, "a row has no id");
      assert.notEqual(dotted, nested);
    });
  });

  // What clicking a token in the editor leans on to find its row. No fixture
  // has a token at the top of a file, or two siblings at the top to tell the
  // first from the rest, so this one is written for the purpose.
  describe("reveal path", () => {
    const reveal = file("reveal.tokens.json");
    /** `revealTarget` is not on the hook's declared type; the provider has it. */
    const revealTarget = (uri: vscode.Uri) =>
      (tree() as unknown as { revealTarget(uri: vscode.Uri): Item | undefined }).revealTarget(uri);
    const parentOf = (item: Item) => tree().getParent!(item as never) as Item | undefined;

    before(async () => {
      writeFileSync(
        reveal.fsPath,
        JSON.stringify({
          radius: { $type: "dimension", $value: { value: 4, unit: "px" } },
          motion: { ease: { out: { $type: "cubicBezier", $value: [0, 0, 0.58, 1] } } },
        }),
      );
      await fileRow("reveal.tokens.json");
    });

    after(async () => {
      rmSync(reveal.fsPath, { force: true });
      await waitFor(async () => !(await rootNames()).includes("reveal.tokens.json"), "it gone");
    });

    it("aims reveal at a file's first child, not the file itself", async () => {
      // The file root would be the obvious target, and it would reveal without
      // expanding: VS Code keeps a node's expansion by id and ignores the
      // collapsibleState a later render asks for.
      const target = revealTarget(reveal);
      assert.equal(target?.uri.toString(), reveal.toString());
      assert.deepEqual(target?.node?.path, ["radius"]);
    });

    it("has no reveal target for a file the panel does not list", () => {
      assert.equal(revealTarget(file("nowhere.tokens.json")), undefined);
    });

    it("walks a nested token back up one level at a time, to the file and no further", async () => {
      // Three levels: a walk that jumped straight to the file root would skip
      // both groups and still end in the right place.
      const walk: (string[] | undefined)[] = [];
      let item: Item | undefined = await row("reveal.tokens.json", "motion", "ease", "out");
      while (item) {
        walk.push(item.node?.path);
        assert.equal(item.uri.toString(), reveal.toString());
        item = parentOf(item);
      }
      assert.deepEqual(walk, [
        ["motion", "ease", "out"],
        ["motion", "ease"],
        ["motion"],
        undefined,
      ]);
    });

    it("gives a top-level token the file root as its parent", async () => {
      const parent = parentOf(await row("reveal.tokens.json", "radius"));
      assert.equal(parent?.uri.toString(), reveal.toString());
      assert.equal(parent?.node, undefined);
    });

    it("gives a file row no parent", async () => {
      assert.equal(parentOf(await fileRow("reveal.tokens.json")), undefined);
    });
  });
});

describe("Starting from nothing", () => {
  it("the Tokens view stays available with no token files", async () => {
    await config().update("exclude", ["**"], vscode.ConfigurationTarget.Global);
    await waitFor(async () => (await roots()).length === 0, "an empty panel");
    await vscode.commands.executeCommand("workbench.action.closeSidebar");
    await vscode.commands.executeCommand("tokenAtlas.tokens.focus");
    await waitFor(() => hooks.tokenTree.view.visible, "the Tokens view shown");
  });

  it("creates a named, empty token file and opens it in the visual editor", async () => {
    const colors = file("colors.tokens.json");
    try {
      const created = await vscode.commands.executeCommand<vscode.Uri>(
        "tokenAtlas.newTokenFile",
        "colors",
      );
      assert.equal(created?.toString(), colors.toString());
      assert.equal(readFileSync(colors.fsPath, "utf8"), "{}\n");
      await waitFor(() => kinds(colors).join() === "visual", "the visual editor on it");
      await waitFor(
        async () => (await rootNames()).includes("colors.tokens.json"),
        "the empty file listed",
      );
      // Still listed once closed: the name, not the open editor, makes it a
      // token file while it holds no $value.
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      await settle();
      assert.ok((await rootNames()).includes("colors.tokens.json"), "dropped once closed");

      // A name that is taken writes nothing and keeps the file as it was.
      writeFileSync(colors.fsPath, '{ "keep": { "$value": 1 } }\n');
      const again = await vscode.commands.executeCommand<vscode.Uri | undefined>(
        "tokenAtlas.newTokenFile",
        "colors",
      );
      assert.equal(again, undefined);
      assert.equal(readFileSync(colors.fsPath, "utf8"), '{ "keep": { "$value": 1 } }\n');
    } finally {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      rmSync(colors.fsPath, { force: true });
    }
  });
});

describe("Visual editor", () => {
  it("swaps the text tab instead of opening the file twice", async () => {
    const light = file("light.tokens.json");
    await vscode.window.showTextDocument(light);
    await vscode.commands.executeCommand("tokenAtlas.openCurrent");
    await waitFor(() => kinds(light).join() === "visual", "one visual tab, no text tab");
  });

  it("opens the file whose title button was pressed, not the active one", async () => {
    // Split editors: each group has its own title bar, and its button names
    // its own file whichever group has focus.
    const light = file("light.tokens.json");
    const dark = file("dark.tokens.json");
    await vscode.window.showTextDocument(dark, { viewColumn: vscode.ViewColumn.Two });
    await vscode.window.showTextDocument(light, { viewColumn: vscode.ViewColumn.One });
    await waitFor(
      () => vscode.window.activeTextEditor?.document.uri.toString() === light.toString(),
      "light the active editor",
    );
    await vscode.commands.executeCommand("tokenAtlas.openCurrent", dark);
    await waitFor(() => kinds(dark).includes("visual"), "dark in the visual editor");
    assert.deepEqual(kinds(light), ["text"]);
  });

  // Both starting points: the side bar closed, and the side bar open on
  // another container. They fail differently — `reveal` alone handles one.
  for (const [start, command] of [
    ["the side bar closed", "workbench.action.closeSidebar"],
    ["the Explorer showing", "workbench.view.explorer"],
  ] as const) {
    it(`brings the Tokens panel out with it, from ${start}`, async () => {
      // A reveal from a previous test can still be in flight, so keep asking
      // until the panel is actually out of the way.
      await waitFor(async () => {
        await vscode.commands.executeCommand(command);
        return !hooks.tokenTree.view.visible;
      }, "panel hidden");
      const light = file("light.tokens.json");
      await vscode.window.showTextDocument(light);
      await vscode.commands.executeCommand("tokenAtlas.openCurrent");
      await waitFor(() => hooks.tokenTree.view.visible, "panel visible");
    });
  }

  it("keeps a token picked in the panel in the visual editor, not JSON", async () => {
    const light = file("light.tokens.json");
    await vscode.commands.executeCommand("vscode.openWith", light, "tokenAtlas.tokenEditor.any");
    await waitFor(() => kinds(light).join() === "visual", "visual editor open");
    await vscode.commands.executeCommand("tokenAtlas.revealToken", light, ["theme", "accent"]);
    await settle();
    assert.deepEqual(kinds(light), ["visual"]);
  });

  it("opens token files in the visual editor when tokenAtlas.defaultEditor is visual", async () => {
    await config().update("defaultEditor", "visual", vscode.ConfigurationTarget.Global);
    const light = file("light.tokens.json");
    await vscode.commands.executeCommand("vscode.open", light);
    await waitFor(() => kinds(light).join() === "visual", "one visual tab, no text tab");
  });

  it("leaves ordinary JSON in the text editor under the same setting", async () => {
    await config().update("defaultEditor", "visual", vscode.ConfigurationTarget.Global);
    const plain = file("not-tokens.json");
    await vscode.commands.executeCommand("vscode.open", plain);
    await waitFor(() => kinds(plain).includes("text"), "text tab");
    await settle();
    assert.deepEqual(kinds(plain), ["text"]);
  });
});

describe("Active token set", () => {
  const shared = file("shared.tokens.json");
  const brand = (name: string) => file(name).toString();

  /** Hover over the `{brand.primary}` reference in shared.tokens.json. */
  async function hoverOverReference(): Promise<string> {
    const doc = await vscode.workspace.openTextDocument(shared);
    const offset = doc.getText().indexOf("{brand.primary}") + 2;
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      "vscode.executeHoverProvider",
      shared,
      doc.positionAt(offset),
    );
    return hovers
      .flatMap((h) => h.contents.map((c) => (typeof c === "string" ? c : c.value)))
      .join("\n");
  }

  afterEach(async () => {
    await vscode.commands.executeCommand("tokenAtlas.chooseActiveSet", []);
  });

  it("resolves a shared reference against whichever brand is active", async () => {
    // Both brands define brand.primary; with no choice the winner is whichever
    // file the workspace scan reached first.
    await vscode.commands.executeCommand("tokenAtlas.chooseActiveSet", [
      brand("brand-a.tokens.json"),
    ]);
    await waitFor(async () => (await hoverOverReference()).includes("#cc0000"), "brand-a's red");

    await vscode.commands.executeCommand("tokenAtlas.chooseActiveSet", [
      brand("brand-b.tokens.json"),
    ]);
    await waitFor(async () => (await hoverOverReference()).includes("#0066cc"), "brand-b's blue");
  });

  it("marks a file outside the set as inactive in the panel", async () => {
    await vscode.commands.executeCommand("tokenAtlas.chooseActiveSet", [
      brand("brand-a.tokens.json"),
    ]);
    const descriptionOf = async (name: string) => {
      const item = (await roots()).find((i) => baseName(i.uri) === name);
      return item && (await tree().getTreeItem(item as never)).description;
    };
    await waitFor(
      async () => (await descriptionOf("brand-b.tokens.json")) === "1 · inactive",
      "brand-b marked inactive",
    );
    assert.equal(await descriptionOf("brand-a.tokens.json"), "1");
  });
});

describe("Tokens Studio themes", () => {
  const shared = file("shared.tokens.json");
  const studio = file("studio.tokens.json").toString();
  const setsOf = (...names: string[]) => names.map((n) => `${studio}#${n}`);

  /** Diagnostics on the shared file, as plain messages. */
  const problems = () => vscode.languages.getDiagnostics(shared).map((d) => d.message);

  afterEach(async () => {
    await vscode.commands.executeCommand("tokenAtlas.chooseActiveSet", []);
  });

  it("scopes a reference written inside the file itself, not just across files", async () => {
    // studio.tokens.json's own "semantic" set points at {light.surface}. The
    // Dark theme disables the light set, so that reference is as broken as it
    // would be from another file — local-first resolution must not excuse it,
    // and the value must not leak into the hover either.
    const own = file("studio.tokens.json");
    // Diagnostics are computed for open documents, so open it first.
    const doc = await vscode.workspace.openTextDocument(own);
    const messages = () => vscode.languages.getDiagnostics(own).map((d) => d.message);
    const hoverOverSemantic = async () => {
      const offset = doc.getText().indexOf('"{light.surface}"') + 3;
      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        "vscode.executeHoverProvider",
        own,
        doc.positionAt(offset),
      );
      return hovers
        .flatMap((h) => h.contents.map((c) => (typeof c === "string" ? c : c.value)))
        .join("\n");
    };

    await vscode.commands.executeCommand("tokenAtlas.chooseActiveSet", setsOf("dark", "semantic"));
    await waitFor(
      async () => messages().includes("Unresolved reference: {light.surface}"),
      "the internal reference reported unresolved under Dark",
    );
    // Not a cycle, not a resolved colour: the target simply is not there.
    assert.ok(
      !(await hoverOverSemantic()).includes("#ffffff"),
      "the disabled set's colour leaked into the hover",
    );

    await vscode.commands.executeCommand("tokenAtlas.chooseActiveSet", setsOf("light", "semantic"));
    await waitFor(async () => messages().length === 0, "the same reference resolving under Light");
    assert.ok(
      (await hoverOverSemantic()).includes("#ffffff"),
      "the hover should show the colour once the light set is live",
    );
  });

  it("resolves only the sets the chosen theme enables", async () => {
    // shared.tokens.json references {light.surface}, which lives in the file's
    // "light" set — so the Dark theme leaves it undefined.
    await vscode.commands.executeCommand("tokenAtlas.chooseActiveSet", setsOf("dark"));
    await waitFor(
      async () => problems().some((m) => m.includes("light.surface")),
      "an unresolved reference under the Dark theme",
    );

    await vscode.commands.executeCommand("tokenAtlas.chooseActiveSet", setsOf("light"));
    await waitFor(
      async () => !problems().some((m) => m.includes("light.surface")),
      "the same reference resolving under the Light theme",
    );
  });
});
