/**
 * The README is the Marketplace listing page, so its `## Settings` table is
 * where most users will ever see a `tokenAtlas.*` setting (#185). That makes it
 * a second copy of every default in `package.json`'s
 * `contributes.configuration`, and a copy drifts the moment someone changes a
 * default on one side only. This file is the check that keeps `package.json`
 * the single source of truth, so the coupling stays out of CLAUDE.md's table
 * per its own note that anything `npm test` already fails on is left out.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const readme = readFileSync(join(ROOT, "README.md"), "utf8");
const settingsSection = readme.split("\n## Settings\n")[1]?.split(/\n## /)[0] ?? "";

const properties = pkg.contributes.configuration.properties as Record<string, { default: unknown }>;

/** How a default is written in the table: JSON, with array items spaced for readability. */
function render(value: unknown): string {
  return Array.isArray(value)
    ? `[${value.map((item) => JSON.stringify(item)).join(", ")}]`
    : JSON.stringify(value);
}

describe("README ↔ contributes.configuration", () => {
  it("has a Settings section", () => {
    expect(settingsSection).not.toEqual("");
  });

  it("documents every setting, with the default package.json declares", () => {
    const keys = Object.keys(properties);
    expect(keys.length).toBeGreaterThan(0);

    const undocumented = keys.filter((key) => !settingsSection.includes(`\`${key}\``));
    expect(undocumented).toEqual([]);

    const wrongDefault = keys.filter(
      (key) => !settingsSection.includes(`\`${render(properties[key].default)}\``),
    );
    expect(wrongDefault).toEqual([]);
  });

  it("documents no setting package.json does not declare", () => {
    const documented = [...settingsSection.matchAll(/`(tokenAtlas\.[A-Za-z]+)`/g)].map((m) => m[1]);
    expect(documented.length).toBeGreaterThan(0);

    const unknown = [...new Set(documented)].filter((key) => !(key in properties));
    expect(unknown).toEqual([]);
  });
});
