/**
 * Token lint driven by `token-atlas.lint.json`, inside a real VS Code (#307).
 *
 * `computeDiagnostics` in `src/host/diagnostics.ts` adds `lintTokens`' findings
 * for the config at the document's workspace folder root, and a file watcher
 * re-reads that config on every write. The config's own problems go in the
 * `token-atlas-lint-config` collection, on the config file.
 *
 * The token file is `examples/02-tiered` with one upward alias injected,
 * written into the workspace so its folder's config governs it. It is named to
 * sort after `studio.tokens.json`, which also defines `semantic.*`: the scan is
 * first-file-wins by URI, so this file never takes a path from another suite.
 * It also carries one unresolved reference, so "validation has run" is
 * observable and "no lint finding" is not just "nothing computed yet".
 */
import * as assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import type { TokenAtlasTestHooks } from "../../src/extension";

const workspace = vscode.workspace.workspaceFolders![0].uri;
const tokens = vscode.Uri.joinPath(workspace, "zz-lint-tiered.tokens.json");
const config = vscode.Uri.joinPath(workspace, "token-atlas.lint.json");
// The background of the contrast pair, in a file of its own: aliased to a
// primitive in the token file, so the pair resolves across both.
const surface = vscode.Uri.joinPath(workspace, "zz-lint-surface.tokens.json");
const UNRESOLVED = "Unresolved reference: {nowhere.at.all}";

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

const lintFindings = () =>
  vscode.languages
    .getDiagnostics(tokens)
    .filter((d) => typeof d.code === "string" && d.code.startsWith("token-atlas/"));
const validated = () =>
  vscode.languages.getDiagnostics(tokens).some((d) => d.message === UNRESOLVED);
const configProblems = () =>
  vscode.languages.getDiagnostics(config).filter((d) => d.source === "Token Atlas");

describe("token lint (token-atlas.lint.json)", () => {
  before(async () => {
    const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>("chrisgriffinio.token-atlas");
    assert.ok(ext, "extension not found");
    await ext.activate();

    // examples/ sits two levels above the compiled suite's source folder.
    const tiered = JSON.parse(
      readFileSync(join(__dirname, "../../examples/02-tiered/tokens.json"), "utf8"),
    );
    tiered.primitive.color.inverted = { $value: "{semantic.color.action}" };
    tiered.component.button.broken = { $type: "color", $value: "{nowhere.at.all}" };
    writeFileSync(tokens.fsPath, JSON.stringify(tiered, null, 2));
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(tokens));
  });

  after(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    rmSync(tokens.fsPath, { force: true });
    rmSync(config.fsPath, { force: true });
    rmSync(surface.fsPath, { force: true });
  });

  it("is silent with no config file", async () => {
    await waitFor(validated, "validation to run on the token file");
    assert.deepEqual(lintFindings(), []);
  });

  it("flags the one upward alias once the config names the tiers", async () => {
    writeFileSync(config.fsPath, JSON.stringify({ tiers: ["primitive", "semantic", "component"] }));
    const [finding] = await waitFor(
      () => (lintFindings().length ? lintFindings() : undefined),
      "the tier finding",
    );
    assert.equal(lintFindings().length, 1);
    assert.equal(finding.code, "token-atlas/tier-alias-inverted");
    assert.equal(finding.severity, vscode.DiagnosticSeverity.Warning);
    assert.equal(finding.source, "Token Atlas");
    const doc = await vscode.workspace.openTextDocument(tokens);
    assert.equal(doc.getText(finding.range), '"inverted"');
  });

  it("raises the severity live when the config says error", async () => {
    writeFileSync(
      config.fsPath,
      JSON.stringify({
        tiers: ["primitive", "semantic", "component"],
        rules: { "token-atlas/tier-alias-inverted": "error" },
      }),
    );
    await waitFor(
      () => lintFindings()[0]?.severity === vscode.DiagnosticSeverity.Error,
      "the finding to become an error",
    );
  });

  it("follows tokenAtlas.validation off and back on", async () => {
    const validation = (value: string | undefined) =>
      vscode.workspace
        .getConfiguration("tokenAtlas")
        .update("validation", value, vscode.ConfigurationTarget.Global);
    try {
      await validation("off");
      await waitFor(() => lintFindings().length === 0, "lint to clear with validation off");
    } finally {
      await validation(undefined);
    }
    await waitFor(() => lintFindings().length === 1, "lint to come back");
  });

  it("reports a malformed config on the config file and lints nothing", async () => {
    writeFileSync(config.fsPath, '{ "tiers": ["primitive", "semantic"], }');
    const [problem] = await waitFor(
      () => (configProblems().length ? configProblems() : undefined),
      "a problem on the config file",
    );
    assert.match(problem.message, /not valid JSON/);
    await waitFor(() => lintFindings().length === 0, "the tier finding to clear");
  });

  it("clears everything when the config file is deleted", async () => {
    writeFileSync(config.fsPath, JSON.stringify({ tiers: ["primitive", "semantic"] }));
    await waitFor(
      () => lintFindings().length === 1 && configProblems().length === 0,
      "a clean config",
    );
    rmSync(config.fsPath);
    await waitFor(() => lintFindings().length === 0, "the finding to clear");
  });

  it("flags a contrast pair on the foreground, with the background in another file", async () => {
    writeFileSync(
      surface.fsPath,
      JSON.stringify({
        zzsurface: { page: { $type: "color", $value: "{primitive.color.slate-50}" } },
      }),
    );
    writeFileSync(
      config.fsPath,
      JSON.stringify({
        contrastPairs: [
          { foreground: "semantic.color.text-inverse", background: "zzsurface.page" },
          { foreground: "semantic.color.text", background: "zzsurface.page", target: "AAA" },
        ],
      }),
    );
    // Until the index has read the new surface file, the pair reads "could not be checked".
    const findings = await waitFor(() => {
      const hits = lintFindings().filter((d) => d.code === "token-atlas/contrast-insufficient");
      return hits.some((d) => d.message.includes("has contrast")) ? hits : undefined;
    }, "the contrast finding");
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /on "zzsurface\.page" has contrast 1\.\d+:1, below WCAG AA/);
    const doc = await vscode.workspace.openTextDocument(tokens);
    assert.equal(doc.getText(findings[0].range), '"text-inverse"');
  });
});
