/**
 * The legacy-value quick fix (`src/host/legacyFix.ts`), exercised inside a
 * real VS Code. `test/core/legacy.test.ts` covers the conversions and edits as
 * pure functions; what it cannot reach is the provider: which actions the
 * lightbulb offers at a cursor, and the document once one is applied.
 *
 * The file is written outside the workspace folder, so the workspace scan
 * never sees it (the `validation.test.ts` pattern). Its indentation is
 * unlike the default on purpose: invariant 1 is only observable against
 * formatting a whole-document rewrite would normalise.
 */
import * as assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import type { TokenAtlasTestHooks } from "../../src/extension";

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

const SOURCE = `{
   "brand": { "$type": "color", "$value": "#ff0000" },
   "gap":   { "$type": "dimension", "$value": "16px" },
   "fast":  { "$type": "duration", "$value": "200ms" }
}
`;

describe("legacy value quick fix", () => {
  const dir = mkdtempSync(join(tmpdir(), "token-atlas-legacy-"));
  const uri = vscode.Uri.file(join(dir, "legacy.json"));

  const actionsAt = async (line: number) =>
    (await vscode.commands.executeCommand<vscode.CodeAction[]>(
      "vscode.executeCodeActionProvider",
      uri,
      new vscode.Range(line, 5, line, 5),
    )) ?? [];

  /**
   * The code actions at `line`, asked for until `ready` accepts their titles.
   * VS Code cancels a code-action request when any code-action provider
   * registers or unregisters mid-flight, and returns only the answers already
   * in, so one request can come back without this extension's fixes (#424;
   * the same drop #414 fixed in `hardcoded.test.ts`).
   */
  const actionsUntil = (line: number, ready: (titles: string[]) => boolean, what: string) => {
    let titles: string[] = [];
    return waitFor(async () => {
      const actions = await actionsAt(line);
      titles = actions.map((a) => a.title);
      return ready(titles) ? actions : undefined;
    }, what).then(
      (actions) => actions!, // waitFor only returns once the check is truthy
      (e: Error) => {
        throw new Error(`${e.message}; last offered ${JSON.stringify(titles)}`);
      },
    );
  };

  before(async () => {
    const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>("chrisgriffinio.token-atlas");
    assert.ok(ext, "extension not found");
    await ext.activate();
  });

  beforeEach(async () => {
    writeFileSync(uri.fsPath, SOURCE);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    // A previous case may have left the document edited; start from disk.
    await vscode.commands.executeCommand("workbench.action.files.revert");
  });

  after(async () => {
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    rmSync(dir, { recursive: true, force: true });
  });

  it("offers a per-token fix and a whole-file fix on a legacy value", async () => {
    const titles = (
      await actionsUntil(
        2,
        (t) =>
          t.includes("Convert to DTCG 2025.10") &&
          t.includes("Convert all 3 legacy values in this file to DTCG 2025.10"),
        "both legacy-value fixes",
      )
    ).map((a) => a.title);
    assert.ok(titles.includes("Convert to DTCG 2025.10"), titles.join(" | "));
    assert.ok(
      titles.includes("Convert all 3 legacy values in this file to DTCG 2025.10"),
      titles.join(" | "),
    );
  });

  it("offers nothing on a line with no legacy value", async () => {
    const ours = (await actionsAt(0)).filter((a) => a.title.includes("DTCG 2025.10"));
    assert.deepEqual(ours, []);
  });

  it("converts one token in place, leaving every other byte alone", async () => {
    const fix = (
      await actionsUntil(2, (t) => t.includes("Convert to DTCG 2025.10"), "the per-token fix")
    ).find((a) => a.title === "Convert to DTCG 2025.10");
    assert.ok(fix?.edit, "no per-token fix");
    assert.ok(await vscode.workspace.applyEdit(fix.edit));
    const text = (await vscode.workspace.openTextDocument(uri)).getText();
    assert.equal(text, SOURCE.replace('"16px"', '{ "value": 16, "unit": "px" }'));
  });

  it("converts the whole file in one edit", async () => {
    const all = (
      await actionsUntil(1, (t) => t.some((x) => x.startsWith("Convert all")), "the whole-file fix")
    ).find((a) => a.title.startsWith("Convert all"));
    assert.ok(all?.edit, "no whole-file fix");
    assert.ok(await vscode.workspace.applyEdit(all.edit));
    const text = (await vscode.workspace.openTextDocument(uri)).getText();
    assert.equal(
      text,
      SOURCE.replace(
        '"#ff0000"',
        '{ "colorSpace": "srgb", "components": [1, 0, 0], "hex": "#ff0000" }',
      )
        .replace('"16px"', '{ "value": 16, "unit": "px" }')
        .replace('"200ms"', '{ "value": 200, "unit": "ms" }'),
    );
  });
});
