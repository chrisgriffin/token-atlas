/** Local agent tooling written into a checkout must stay out of a packaged .vsix. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const entries = readFileSync(join(ROOT, ".vscodeignore"), "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

describe(".vscodeignore", () => {
  it.each([
    ".agents/**",
    ".operator/**",
    "morning-briefing.md",
    "pm-briefing.md",
    "recovery-recap.md",
    "postcss.config.mjs",
  ])("excludes the local tooling path %s", (path) => {
    expect(entries).toContain(path);
  });
});
