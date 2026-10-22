/**
 * Four of the couplings CLAUDE.md § Architecture used to list by hand are
 * plain identifier matching between `package.json` and `src/`: a command id,
 * a view id, a custom-editor `viewType`, an activation event. A mismatch
 * means a command that never fires, a view that never appears, or a language
 * feature that never activates — all silent until someone re-reads both
 * sides by eye (#170). This file is that re-read, so those rows are out of
 * the table per its own note that anything `npm test` already fails on is
 * left out.
 *
 * Matched against the source TEXT, not a loaded module: everything under
 * `src/host/` imports `vscode`, which only exists inside the Extension
 * Development Host, so these stay in the plain `node` environment the rest
 * of the suite runs in.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

const pkg = JSON.parse(read("package.json"));

/** Every `.ts` under `src/`, concatenated — the couplings are id strings, not structure. */
const srcText = readdirSync(join(ROOT, "src"), { recursive: true, encoding: "utf8" })
  .filter((entry) => entry.endsWith(".ts") || entry.endsWith(".tsx"))
  .map((entry) => read(join("src", entry)))
  .join("\n");

/** `"<id>"` as the first argument of `call(` — the id may sit on its own line. */
function firstStringArgs(text: string, call: string): string[] {
  const pattern = new RegExp(`${call}\\(\\s*"([^"]+)"`, "g");
  return [...text.matchAll(pattern)].map((m) => m[1]);
}

describe("package.json ↔ src identifiers", () => {
  it("registers every contributed command", () => {
    const contributed = pkg.contributes.commands.map((c: { command: string }) => c.command);
    const registered = firstStringArgs(srcText, "registerCommand");

    expect(contributed.length).toBeGreaterThan(0);
    expect(contributed.filter((id: string) => !registered.includes(id))).toEqual([]);
  });

  it("matches every view id to its tree view, welcome entry and container", () => {
    const createdViews = firstStringArgs(srcText, "createTreeView");
    const welcomeViews = pkg.contributes.viewsWelcome.map((w: { view: string }) => w.view);
    const containerIds = Object.values(pkg.contributes.viewsContainers)
      .flat()
      .map((c) => (c as { id: string }).id);

    const entries = Object.entries(pkg.contributes.views) as [string, { id: string }[]][];
    expect(entries.length).toBeGreaterThan(0);

    for (const [containerId, views] of entries) {
      expect(containerIds).toContain(containerId);
      for (const view of views) {
        expect(createdViews).toContain(view.id);
        expect(welcomeViews).toContain(view.id);
      }
    }
  });

  it("contributes one custom editor, matched to the provider's constant", () => {
    const provider = read("src/host/tokenEditorProvider.ts");
    const constants = [...provider.matchAll(/viewType\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
    const editors = pkg.contributes.customEditors;

    // One editor, or "Reopen Editor With…" lists Token Atlas twice on a
    // *.tokens.json, and the entry reads "<editor> - <extension>" (spec 055).
    expect(editors).toHaveLength(1);
    expect(constants).toEqual([editors[0].viewType]);
    expect(`${editors[0].displayName} - ${pkg.displayName}`).toBe("Token Editor - Token Atlas");
  });

  it("declares an activation event for every export-feature language", () => {
    const block = read("src/host/exportFeatures.ts").match(/const LANGUAGES = \[([^\]]*)\]/);
    const languages = [...(block?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);

    expect(languages.length).toBeGreaterThan(0);
    const missing = languages.filter((l) => !pkg.activationEvents.includes(`onLanguage:${l}`));
    expect(missing).toEqual([]);
  });
});
