/** Every file the packaged .vsix would contain must be on the allow-list below, so tooling directories never ship by accident. */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** The screenshots the README embeds (#478): the listing renders the packaged README, so they ship with it. */
const README_IMAGES = [
  ...readFileSync(join(ROOT, "README.md"), "utf8").matchAll(/!\[[^\]]*\]\((media\/[\w-]+\.png)\)/g),
].map((m) => m[1]);

/** Everything the extension needs at runtime, and nothing else. */
const ALLOWED = [
  /^package\.json$/,
  /^README\.md$/,
  /^LICENSE$/,
  /^CHANGELOG\.md$/,
  /^media\/[\w.-]+\.svg$/,
  // `icon`: the Marketplace listing image (PNG; the Marketplace rejects SVG).
  /^media\/icon\.png$/,
  ...README_IMAGES.map((f) => new RegExp(`^${f.replace(/\./g, "\\.")}$`)),
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

  it("ships every screenshot the README embeds", () => {
    expect(README_IMAGES.length).toBeGreaterThanOrEqual(2);
    expect(files).toEqual(expect.arrayContaining(README_IMAGES));
  });

  it("ships nothing but the extension itself", () => {
    const unexpected = files.filter((f) => !ALLOWED.some((allowed) => allowed.test(f)));
    expect(unexpected).toEqual([]);
  });
});
