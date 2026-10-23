/** Every file the packaged .vsix would contain must be on the allow-list below, so tooling directories never ship by accident. */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * The screenshots the README embeds. They stay out of the package: vsce
 * rewrites their links to GitHub (`--githubBranch main`), and the listing
 * loads them from there.
 */
const README_IMAGES = [
  ...readFileSync(join(ROOT, "README.md"), "utf8").matchAll(/!\[[^\]]*\]\((media\/[\w-]+\.png)\)/g),
].map((m) => m[1]);

/** Everything the extension needs at runtime, and nothing else. */
const ALLOWED = [
  /^package\.json$/,
  /^README\.md$/,
  /^LICENSE$/,
  /^CHANGELOG\.md$/,
  // `contributes.viewsContainers`: the activity-bar icon.
  /^media\/map\.svg$/,
  // `icon`: the Marketplace listing image (PNG; the Marketplace rejects SVG).
  /^media\/icon\.png$/,
  // `contributes.jsonValidation`: completion and checks in token-atlas.lint.json.
  /^schemas\/token-atlas\.lint\.schema\.json$/,
  // Built by `npm run build`, which CI runs after the tests — so these are
  // present locally and absent on a clean checkout. Either is fine.
  /^dist\/(extension|webview)\.js$/,
];

function packagedFiles(): string[] {
  const out = execFileSync("npx", ["vsce", "ls", "--no-dependencies"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
  });
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

describe("packaged .vsix contents", () => {
  const files = packagedFiles();

  it("ships the manifest and the readme", () => {
    expect(files).toContain("package.json");
    expect(files).toContain("README.md");
  });

  it("ships the Marketplace icon the manifest names", () => {
    const { icon } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(icon).toBe("media/icon.png");
    expect(files).toContain(icon);
  });

  it("ships the activity-bar icon, the monochrome folded map", () => {
    const { contributes } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const [{ icon }] = contributes.viewsContainers.activitybar;
    expect(icon).toBe("media/map.svg");
    expect(files).toContain(icon);
  });

  it("ships none of the screenshots the README embeds", () => {
    expect(README_IMAGES.length).toBeGreaterThanOrEqual(2);
    expect(files.filter((f) => README_IMAGES.includes(f))).toEqual([]);
  });

  it("ships nothing but the extension itself", () => {
    const unexpected = files.filter((f) => !ALLOWED.some((allowed) => allowed.test(f)));
    expect(unexpected).toEqual([]);
  });
});
