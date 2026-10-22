/**
 * The README is the VS Code Marketplace listing page and `package.json` carries
 * the rest of the listing, so a stale line in either is what every visitor
 * reads. These pin the listing facts that no other test sees.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const pkg = JSON.parse(read("package.json"));
const readme = read("README.md");
const install = readme.split("\n## Install\n")[1]?.split(/\n## /)[0] ?? "";

describe("Marketplace listing", () => {
  it("installs from the Marketplace by the manifest's extension id", () => {
    expect(install).toContain(`code --install-extension ${pkg.publisher}.${pkg.name}`);
    expect(install).toContain(`ext install ${pkg.publisher}.${pkg.name}`);
  });

  it("no doc says the extension is not on the Marketplace", () => {
    const docs = [
      "README.md",
      "CLAUDE.md",
      ...readdirSync(join(ROOT, "docs")).map((f) => `docs/${f}`),
    ];
    const stale = docs
      .filter((f) => f.endsWith(".md"))
      .filter((f) =>
        /not (yet )?(on|published to) the (VS Code )?Marketplace|no (VS Code )?Marketplace (publish|listing)|nothing is published to the Marketplace/i.test(
          read(f),
        ),
      );
    expect(stale).toEqual([]);
  });

  it("packages README links against main, the branch a release is cut from", () => {
    // vsce rewrites relative README links to the repo's default branch (develop)
    // unless told otherwise, so the listing would show unreleased screenshots.
    expect(pkg.scripts.package).toMatch(/--githubBranch main\b/);
  });

  it("sets a gallery banner in the icon's own background color", () => {
    const iconColors = [...read("media/icon.svg").matchAll(/#[0-9a-f]{6}\b/gi)].map((m) =>
      m[0].toLowerCase(),
    );
    expect(iconColors).toContain(pkg.galleryBanner?.color?.toLowerCase());
    expect(pkg.galleryBanner.theme).toBe("dark");
  });

  it("lists under Linters, since it validates and lints token files", () => {
    expect(pkg.categories).toContain("Linters");
  });

  it("links the stable 2025.10 DTCG specs, never the drafts", () => {
    expect(readme).not.toMatch(/designtokens\.org\/tr\/drafts\//);
    expect(readme).toContain("https://www.designtokens.org/tr/2025.10/format/");
    expect(readme).toContain("https://www.designtokens.org/tr/2025.10/resolver/");
  });
});
