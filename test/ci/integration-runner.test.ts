/** A failed integration run says why: a VS Code startup hang is named and exits apart from a test failure (#2). */
import { describe, it, expect } from "vitest";
import { classifyRun, EXIT, runIntegration } from "../integration/run.mjs";

// The tail of a real hang on `build / ci`, VS Code 1.142.0: no mocha output at all.
const HANG_TAIL = [
  "Found existing install in /home/runner/work/token-atlas/.vscode-test/vscode-linux-x64-1.142.0",
  "[main 2026-10-21T09:12:03.411Z] CodeWindow: detected unresponsive",
  "Exit code:   1",
].join("\n");

const FAILING_TAIL = ["  131 passing (41s)", "  1 failing", "", "Exit code:   1"].join("\n");

describe("classifyRun", () => {
  it("passes a clean run through", () => {
    expect(classifyRun("  132 passing (40s)\nExit code:   0", 0)).toMatchObject({
      kind: "passed",
      exitCode: 0,
    });
  });

  it("names a startup hang and gives it its own exit code", () => {
    const result = classifyRun(HANG_TAIL, 1);
    expect(result.kind).toBe("startup-hang");
    expect(result.exitCode).toBe(EXIT.startupHang);
    expect(result.message).toContain("detected unresponsive");
    expect(result.message).toContain("not a test failure");
  });

  it("reads through the colour codes VS Code and mocha print", () => {
    const coloured =
      "\u001b[90m[main 2026-10-21T09:12:03.411Z]\u001b[0m CodeWindow: detected unresponsive";
    expect(classifyRun(coloured, 1).kind).toBe("startup-hang");
    expect(classifyRun("\u001b[31m  1 failing\u001b[0m", 1).kind).toBe("test-failure");
  });

  it("keeps a test failure on exit 1, apart from the hang", () => {
    const result = classifyRun(FAILING_TAIL, 1);
    expect(result.kind).toBe("test-failure");
    expect(result.exitCode).toBe(1);
    expect(result.exitCode).not.toBe(EXIT.startupHang);
  });

  it("calls a hang after a mocha summary a test failure, since tests did report", () => {
    expect(classifyRun(`${FAILING_TAIL}\nCodeWindow: detected unresponsive`, 1).kind).toBe(
      "test-failure",
    );
  });

  it("names any other exit before a test reported, without calling it a hang", () => {
    const result = classifyRun("Error: Failed to download VS Code\nExit code:   1", 1);
    expect(result.kind).toBe("no-tests-ran");
    expect(result.exitCode).toBe(EXIT.noTestsRan);
    expect(new Set([1, EXIT.startupHang, EXIT.noTestsRan]).size).toBe(3);
  });

  it("treats a run killed by a signal as one that never reported", () => {
    expect(classifyRun("", null).kind).toBe("no-tests-ran");
  });
});

describe("runIntegration", () => {
  /** A stand-in for `vscode-test` that prints `out` and exits with `code`. */
  const fake = (out: string, code: number) => [
    "-e",
    `process.stdout.write(${JSON.stringify(out)}); process.exit(${code});`,
  ];

  it("labels a hung run in its own output and exits with the hang's code", async () => {
    const lines: string[] = [];
    const code = await runIntegration({
      command: process.execPath,
      args: fake(HANG_TAIL, 1),
      write: (line: string) => lines.push(line),
      quiet: true,
    });
    expect(code).toBe(EXIT.startupHang);
    expect(lines.join("\n")).toMatch(/startup-hang/);
    expect(lines.join("\n")).toMatch(/^::error /m);
  });

  it("exits 1 for a run whose tests failed", async () => {
    const code = await runIntegration({
      command: process.execPath,
      args: fake(FAILING_TAIL, 1),
      write: () => {},
      quiet: true,
    });
    expect(code).toBe(1);
  });

  it("exits 0 and prints no label for a passing run", async () => {
    const lines: string[] = [];
    const code = await runIntegration({
      command: process.execPath,
      args: fake("  132 passing (40s)\n", 0),
      write: (line: string) => lines.push(line),
      quiet: true,
    });
    expect(code).toBe(0);
    expect(lines).toEqual([]);
  });
});
