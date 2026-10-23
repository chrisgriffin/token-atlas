/** `npm run test:integration` names a VS Code startup hang instead of failing silently (#2). */
import { describe, it, expect } from "vitest";
import { EXIT, classify, runIntegration } from "../integration-run.mjs";

const HANG = [
  "[main 2026-10-21T14:02:11.004Z] update#setState idle",
  "Failed to connect to the bus: Could not parse server address",
  "[main 2026-10-21T14:02:27.311Z] CodeWindow: detected unresponsive",
  "Exit code:   1",
].join("\n");

const TEST_FAILED = [
  "  detection",
  "    ✔ sniffs a token document (41ms)",
  "    1) ignores plain JSON",
  "",
  "  131 passing (12s)",
  "  1 failing",
  "Exit code:   1",
].join("\n");

const PASSED = [
  "  detection",
  "    ✔ sniffs a token document",
  "",
  "  132 passing (12s)",
  "Exit code:   0",
].join("\n");

const SILENT = [
  "Failed to connect to the bus: Could not parse server address",
  "Exit code:   1",
].join("\n");

describe("classify", () => {
  it("passes a clean run", () => {
    expect(classify(0, PASSED)).toBe("passed");
  });

  it("names a window that went unresponsive before any test ran", () => {
    expect(classify(1, HANG)).toBe("startup-hang");
  });

  it("leaves a failing test a test failure, whatever else the log says", () => {
    expect(classify(1, TEST_FAILED)).toBe("test-failure");
    expect(classify(1, `${TEST_FAILED}\nCodeWindow: detected unresponsive`)).toBe("test-failure");
  });

  it("reads a coloured reporter's marks", () => {
    const coloured = "\x1b[32m  ✔\x1b[0m\x1b[90m sniffs\x1b[0m\nCodeWindow: detected unresponsive";
    expect(classify(1, coloured)).toBe("test-failure");
  });

  it("names a launch that reported no test and no hang", () => {
    expect(classify(1, SILENT)).toBe("no-tests-reported");
  });
});

/** A launcher that replays one log per attempt. */
function replay(...runs: Array<[number, string]>) {
  let attempts = 0;
  const launch = async () => {
    const [code, output] = runs[Math.min(attempts, runs.length - 1)];
    attempts++;
    return { code, output };
  };
  return { launch, attempts: () => attempts };
}

function collect() {
  const lines: string[] = [];
  return { log: (line: string) => lines.push(line), lines };
}

describe("runIntegration", () => {
  it("passes a test failure through with its own exit code and no retry", async () => {
    const runs = replay([1, TEST_FAILED]);
    const { log, lines } = collect();
    expect(await runIntegration(runs.launch, log)).toBe(1);
    expect(runs.attempts()).toBe(1);
    expect(lines.join("\n")).toMatch(/::error title=Integration tests failed::/);
  });

  it("gives a startup hang its own exit path, named in the output", async () => {
    const runs = replay([1, HANG], [1, HANG]);
    const { log, lines } = collect();
    const code = await runIntegration(runs.launch, log);
    expect(code).toBe(EXIT.startupHang);
    expect(code).not.toBe(1);
    expect(runs.attempts()).toBe(2);
    expect(lines.join("\n")).toMatch(
      /::error title=VS Code startup hang::.*detected unresponsive.*no test ran/,
    );
  });

  it("recovers from one startup hang and still leaves a trace of it", async () => {
    const runs = replay([1, HANG], [0, PASSED]);
    const { log, lines } = collect();
    expect(await runIntegration(runs.launch, log)).toBe(0);
    expect(runs.attempts()).toBe(2);
    expect(lines.join("\n")).toMatch(/::warning title=VS Code startup hang::/);
  });

  it("names a silent launch failure with an exit code of its own", async () => {
    const runs = replay([1, SILENT]);
    const { log, lines } = collect();
    expect(await runIntegration(runs.launch, log)).toBe(EXIT.noTestsReported);
    expect(runs.attempts()).toBe(1);
    expect(lines.join("\n")).toMatch(/::error title=No integration tests reported::/);
  });

  it("keeps the three failure kinds on distinct exit codes", () => {
    expect(new Set([1, EXIT.startupHang, EXIT.noTestsReported]).size).toBe(3);
  });
});
