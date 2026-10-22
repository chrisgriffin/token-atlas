/** Every job sets timeout-minutes: GitHub's default is six hours, so one hung step would bill 360 minutes. */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = join(here, "../../.github/workflows");

const FILES = readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml"));

interface Job {
  name: string;
  body: string;
}

/** Every job block in one workflow file, comments stripped. */
function jobsIn(file: string): Job[] {
  const afterJobs = readFileSync(join(WORKFLOWS, file), "utf8").split(/\njobs:\n/)[1];
  if (!afterJobs) return [];

  const jobs: Job[] = [];
  let current: Job | undefined;

  for (const line of afterJobs.split("\n")) {
    if (line.trim().startsWith("#")) continue;

    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header) {
      current = { name: header[1], body: "" };
      jobs.push(current);
      continue;
    }

    // A non-blank line at column zero is the next top-level key — `jobs:` is over.
    if (line.trim() !== "" && !line.startsWith(" ")) break;

    if (current) current.body += `${line}\n`;
  }

  return jobs;
}

/**
 * A job that delegates to a reusable workflow, i.e. `uses:` at job level.
 *
 * Anchored to the line start on purpose: an unanchored ` {4}uses:` also matches
 * the tail of a deeper-indented step (`        uses: actions/checkout@v5`),
 * which misreads an ordinary build job as a stub and inverts its assertion.
 */
function delegates(job: Job): boolean {
  return /^ {4}uses:/m.test(job.body);
}

describe("workflow timeouts — an uncapped job inherits a 6h ceiling", () => {
  // Anti-vacuity: if `jobsIn` ever stops matching, every assertion below
  // silently disappears and the suite goes green while guarding nothing.
  it("parses at least one job out of every workflow file", () => {
    expect(FILES.length).toBeGreaterThan(0);
    for (const file of FILES) {
      expect(jobsIn(file).length, `${file} parsed to zero jobs`).toBeGreaterThan(0);
    }
  });

  for (const file of FILES) {
    for (const job of jobsIn(file)) {
      if (delegates(job)) {
        it(`${file} → ${job.name} sets no timeout (GitHub rejects it on a \`uses:\` job)`, () => {
          expect(job.body).not.toMatch(/^ {4}timeout-minutes:/m);
        });
      } else {
        it(`${file} → ${job.name} caps its runtime`, () => {
          expect(job.body).toMatch(/^ {4}timeout-minutes: \d+$/m);
        });
      }
    }
  }
});
