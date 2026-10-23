/**
 * Choosing the active token set: which files — and which sets within them — a
 * `{reference}` resolves against.
 *
 * A workspace can hold several definitions of the same paths: one per brand,
 * per theme, per platform, as separate files or as the top-level sets of a
 * Tokens Studio export. Without a choice the index is first-file-wins and a
 * shared file silently resolves to whichever was found first. This makes the
 * choice explicit and switchable from the status bar: pick a theme, or pick
 * the files yourself, and hovers, swatches, the table and diagnostics follow.
 *
 * A DTCG resolver document (`.resolver.json`) is the spec's own answer to the
 * same question, so its resolutions are offered first: choosing one makes its
 * sources active in the resolver's order, later sources winning. A resolver
 * with more combinations than fit in a list is offered once, and picking it
 * asks for one context per modifier instead.
 *
 * The choice is per workspace and personal (workspace state, not a setting):
 * which brand you are looking at right now is not a fact about the repo.
 */
import * as vscode from "vscode";
import {
  inputIssues,
  parseResolver,
  readThemes,
  resolutionCount,
  resolutions,
  type Resolver,
  type TokenTheme,
} from "../core";
import {
  activeGroupsFor,
  activeResolution,
  activeSet,
  activeSetOrdered,
  entriesFor,
  findResolverFiles,
  findTokenFiles,
  isActive,
  onDidInvalidateWorkspaceIndex,
  setActiveSet,
  type ResolutionArg,
} from "./workspaceIndex";

const STORAGE_KEY = "tokenAtlas.activeSet";
/** Set when the stored set is a resolver resolution, in precedence order. */
const ORDERED_KEY = "tokenAtlas.activeSetOrdered";
/** The chosen resolution's label, for the status bar. */
const LABEL_KEY = "tokenAtlas.activeSetLabel";
/** The chosen resolution itself, so the visual editor can show its modes. */
const RESOLUTION_KEY = "tokenAtlas.activeResolution";
/** Past this many combinations a resolver is picked one modifier at a time. */
const MAX_LISTED = 12;

/** A resolver document in the workspace, read. */
interface ResolverDoc {
  uri: vscode.Uri;
  resolver: Resolver;
  name: string;
}

/** A Tokens Studio theme, with the file that declares it. */
interface FileTheme extends TokenTheme {
  uri: vscode.Uri;
  /** The sets this theme selects, as index entries. */
  entries: string[];
}

type TokenFile = { uri: vscode.Uri; text: string };

export function registerActiveSet(context: vscode.ExtensionContext): void {
  setActiveSet(
    context.workspaceState.get<string[]>(STORAGE_KEY) ?? [],
    context.workspaceState.get<boolean>(ORDERED_KEY) ?? false,
    context.workspaceState.get<ResolutionArg>(RESOLUTION_KEY),
  );

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "tokenAtlas.chooseActiveSet";
  statusBar.name = "Token Atlas token set";

  const store = async (
    entries: string[],
    inOrder = false,
    label?: string,
    chosen?: ResolutionArg,
  ) => {
    setActiveSet(entries, inOrder, chosen);
    await context.workspaceState.update(STORAGE_KEY, entries.length ? entries : undefined);
    await context.workspaceState.update(ORDERED_KEY, inOrder || undefined);
    await context.workspaceState.update(LABEL_KEY, (inOrder && label) || undefined);
    await context.workspaceState.update(RESOLUTION_KEY, chosen);
    await refresh();
  };

  /** Make one resolution of `doc` active. */
  const storeResolution = (doc: ResolverDoc, input: Record<string, string>) => {
    // Named in full, defaults included, as the picker lists it.
    const label = doc.resolver.modifiers
      .map((m) => `${m.name}: ${input[m.name] ?? m.default}`)
      .join(" · ");
    return store(
      entriesFor(doc.uri, doc.resolver, input),
      true,
      label ? `${doc.name} — ${label}` : doc.name,
      { resolver: doc.uri.toString(), input },
    );
  };

  /** Show the set only where there is a choice to make. */
  const refresh = async () => {
    const files = await findTokenFiles();
    const themes = themesIn(files);
    const resolvers = await resolversIn();
    if (files.length < 2 && themes.length === 0 && resolvers.length === 0) {
      statusBar.hide();
      return;
    }
    const chosen = files.filter((f) => isActive(f.uri));
    // A resolution or theme the set matches exactly is what the author would call it.
    const themeName = activeSetOrdered()
      ? context.workspaceState.get<string>(LABEL_KEY)
      : themes.find((t) => sameSet(t.entries, activeSet()))?.name;
    const parts = chosen.flatMap((f) => activeGroupsFor(f.uri) ?? [shortName(f.uri)]);
    statusBar.text = `$(symbol-color) ${
      activeSet().length === 0
        ? "All tokens"
        : (themeName ?? (parts.join(" · ") || "Nothing active"))
    }`;
    const list = chosen.length
      ? chosen
          .map((f) => {
            const groups = activeGroupsFor(f.uri);
            const path = vscode.workspace.asRelativePath(f.uri);
            return groups ? `- ${path} — ${groups.join(", ")}` : `- ${path}`;
          })
          .join("\n")
      : "_none_";
    statusBar.tooltip = new vscode.MarkdownString(
      `**Active token set** — what \`{references}\` resolve against.\n\n${list}\n\nClick to change.`,
    );
    statusBar.show();
  };

  context.subscriptions.push(
    statusBar,
    // `uris` skips the picker — for tests, tasks and keybindings that want a
    // named set. Undefined opens the picker. A `{ resolver, input }` that names
    // no resolution rejects with the reason.
    vscode.commands.registerCommand(
      "tokenAtlas.chooseActiveSet",
      async (uris?: string[] | ResolutionArg) => {
        const files = await findTokenFiles();
        if (uris && !Array.isArray(uris)) {
          // Written by hand in a task or keybinding, so checked: a bad one
          // stores nothing rather than a partial set (§6.1).
          const found = (await findResolverFiles()).find((r) => r.uri.toString() === uris.resolver);
          if (!found) throw new Error(`No resolver document at ${uris.resolver}.`);
          const doc = (await resolversIn()).find((r) => r.uri.toString() === uris.resolver);
          if (!doc) throw new Error(`${uris.resolver} is not a readable resolver document.`);
          const input = uris.input ?? {};
          const issues = inputIssues(doc.resolver, input);
          if (issues.length)
            throw new Error(`Not a resolution of ${uris.resolver}: ${issues.join(" ")}`);
          await storeResolution(doc, input);
          return;
        }
        if (uris) {
          // "Everything" means every file, whole — a list of set entries is a
          // scoped choice however many there are.
          const everything = uris.every((u) => !u.includes("#")) && uris.length === files.length;
          await store(everything ? [] : uris);
          return;
        }
        if (files.length === 0) {
          void vscode.window.showInformationMessage("No token files in this workspace.");
          return;
        }

        // A resolver document, then a Tokens Studio file, names its own
        // themes; offer those first, since they are the choice its author
        // already made. A resolver is the DTCG spec's way, so it leads.
        const themes = themesIn(files);
        const resolvers = await resolversIn();
        if (themes.length || resolvers.length) {
          const BY_FILE = "$(files) Choose files…";
          type Item = vscode.QuickPickItem & {
            run?: () => Promise<void>;
          };
          const choice = await vscode.window.showQuickPick<Item>(
            [
              ...resolvers.flatMap((doc): Item[] => {
                const description = vscode.workspace.asRelativePath(doc.uri);
                if (resolutionCount(doc.resolver) > MAX_LISTED)
                  return [
                    {
                      label: `$(symbol-color) ${doc.name} — choose contexts…`,
                      description,
                      run: async () => {
                        const input = await pickContexts(doc);
                        if (input) await storeResolution(doc, input);
                      },
                    },
                  ];
                return resolutions(doc.resolver).map((r) => ({
                  label: `$(symbol-color) ${r.label ? `${doc.name} — ${r.label}` : doc.name}`,
                  description,
                  run: () => storeResolution(doc, r.input),
                }));
              }),
              ...themes.map((theme) => ({
                label: `$(symbol-color) ${theme.name}`,
                description: vscode.workspace.asRelativePath(theme.uri),
                detail: theme.sets.join(", "),
                run: () => store(theme.entries),
              })),
              { label: "$(list-selection) All tokens", run: () => store([]) },
              { label: BY_FILE },
            ],
            { title: "Active token set", placeHolder: "Pick a theme, or choose files yourself" },
          );
          if (!choice) return; // cancelled
          if (choice.run) {
            await choice.run();
            return;
          }
        }

        const picked = await vscode.window.showQuickPick(
          files.map((f) => ({
            label: vscode.workspace.asRelativePath(f.uri),
            uri: f.uri.toString(),
            picked: isActive(f.uri),
          })),
          {
            canPickMany: true,
            title: "Active token files",
            placeHolder: "References resolve against the files you pick",
          },
        );
        if (!picked) return; // cancelled
        // Picking everything is the same as making no choice, and keeps meaning
        // "all" as files come and go.
        await store(picked.length === files.length ? [] : picked.map((p) => p.uri));
      },
    ),
    // Files appearing, vanishing or being excluded changes what "all" covers.
    onDidInvalidateWorkspaceIndex(() => void refresh()),
    // A file renamed or moved keeps its place in the set, under its new name.
    vscode.workspace.onDidRenameFiles(async ({ files }) => {
      const move = (entry: string) => {
        for (const { oldUri, newUri } of files) {
          const from = oldUri.toString();
          if (entry === from || entry.startsWith(`${from}#`) || entry.startsWith(`${from}/`)) {
            return newUri.toString() + entry.slice(from.length);
          }
        }
        return entry;
      };
      const entries = activeSet().map(move);
      const chosen = activeResolution();
      const resolver = chosen && move(chosen.resolver);
      if (entries.every((e, i) => e === activeSet()[i]) && resolver === chosen?.resolver) return;
      await store(
        entries,
        activeSetOrdered(),
        context.workspaceState.get<string>(LABEL_KEY),
        chosen && { ...chosen, resolver: resolver! },
      );
    }),
  );

  void refresh();
}

/** Every readable resolver document, in workspace order. */
async function resolversIn(): Promise<ResolverDoc[]> {
  return (await findResolverFiles()).flatMap(({ uri, text }) => {
    const { resolver } = parseResolver(text);
    return resolver ? [{ uri, resolver, name: resolver.name ?? shortName(uri) }] : [];
  });
}

/** One context per modifier, default first; undefined if cancelled. */
async function pickContexts(doc: ResolverDoc): Promise<Record<string, string> | undefined> {
  const input: Record<string, string> = {};
  for (const modifier of doc.resolver.modifiers) {
    const contexts = [...modifier.contexts.keys()].sort(
      (a, b) => +(b === modifier.default) - +(a === modifier.default),
    );
    const picked = await vscode.window.showQuickPick(contexts, {
      title: `${doc.name}: ${modifier.name}`,
      placeHolder: `Context for "${modifier.name}"`,
    });
    if (!picked) return undefined;
    input[modifier.name] = picked;
  }
  return input;
}

/** Every theme declared by every token file, in workspace order. */
function themesIn(files: ReadonlyArray<TokenFile>): FileTheme[] {
  return files.flatMap((f) =>
    readThemes(f.text).map((theme) => ({
      ...theme,
      uri: f.uri,
      entries: theme.sets.map((set) => `${f.uri.toString()}#${set}`),
    })),
  );
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

/** `brand-a.tokens.json` reads as `brand-a` in a status bar. */
function shortName(uri: vscode.Uri): string {
  const base = uri.path.slice(uri.path.lastIndexOf("/") + 1);
  return base.replace(/\.tokens\.json$|\.resolver\.json$|\.tokens$|\.json$/, "");
}
