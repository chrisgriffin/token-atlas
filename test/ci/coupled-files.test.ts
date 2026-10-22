/** CLAUDE.md § Architecture lists couplings no test can see; every path a row names must exist. */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const md = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
const section = md.split("## Architecture")[1].split(/\n## /)[0];

// Backticked spans that look like a path (contain "/" or a file extension),
// minus commands, globs, and dotted identifiers that are not files.
const paths = [...section.matchAll(/`([^`\s]+)`/g)]
  .map((m) => m[1])
  .filter((t) => /[/.]/.test(t))
  .filter((t) => !/^(npm|gh|git)\b/.test(t) && !t.includes("*") && !t.includes("("))
  .filter((t) => /\.(ts|tsx|mjs|js|json|yml|yaml|md)$|\/$|^\./.test(t));

describe("CLAUDE.md § Architecture", () => {
  it("names real paths only", () => {
    expect(paths.length).toBeGreaterThan(5);
    const missing = paths.filter((p) => !existsSync(join(ROOT, p)));
    expect(missing).toEqual([]);
  });
});
