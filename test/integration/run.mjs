// `npm run test:integration` runs `vscode-test` through this file so a failed run
// says why (#2). VS Code sometimes hangs at startup on CI (`CodeWindow: detected
// unresponsive`), and `vscode-test` exits 1 for that exactly as it does for a failed
// test; this reads the output and gives each kind its own label and exit code.
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Exit codes past 1, which stays a test failure. */
export const EXIT = { startupHang: 75, noTestsRan: 70 };

const HANG = /detected unresponsive/;
const ANSI = /\u001b\[[0-9;]*m/g;
// Mocha's summary line: present once any test has reported, pass or fail.
const MOCHA_SUMMARY = /^\s*\d+ (passing|failing|pending)\b/m;

/**
 * Names what a finished `vscode-test` run was, from its output and exit code
 * (`null` when a signal killed it).
 * @param {string} output
 * @param {number | null} code
 * @returns {{ kind: "passed" | "test-failure" | "startup-hang" | "no-tests-ran", exitCode: number, message: string }}
 */
export function classifyRun(output, code) {
  // VS Code colours its log prefixes; read the text without the escapes.
  output = output.replace(ANSI, "");
  if (code === 0) return { kind: "passed", exitCode: 0, message: "" };
  if (MOCHA_SUMMARY.test(output)) {
    return {
      kind: "test-failure",
      exitCode: 1,
      message: "an integration test failed; mocha's summary above names it.",
    };
  }
  if (HANG.test(output)) {
    return {
      kind: "startup-hang",
      exitCode: EXIT.startupHang,
      message:
        "the VS Code window went unresponsive (CodeWindow: detected unresponsive) before any test reported, so this is not a test failure. Re-run the job.",
    };
  }
  return {
    kind: "no-tests-ran",
    exitCode: EXIT.noTestsRan,
    message: `vscode-test exited ${code ?? "on a signal"} before any test reported, with no VS Code hang in its output.`,
  };
}

/**
 * Runs `command` (`vscode-test` by default), passing its output through, then
 * prints the label for a failed run and resolves with that kind's exit code.
 * @param {{ command?: string, args?: string[], write?: (line: string) => void, quiet?: boolean }} [options]
 * @returns {Promise<number>}
 */
export function runIntegration({
  command = "vscode-test",
  args = [],
  write = (line) => console.error(line),
  quiet = false,
} = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: process.platform === "win32" });
    let output = "";
    const keep = (sink) => (chunk) => {
      output += chunk;
      if (!quiet) sink.write(chunk);
    };
    child.stdout.on("data", keep(process.stdout));
    child.stderr.on("data", keep(process.stderr));
    child.on("error", (error) => {
      output += String(error);
    });
    child.on("close", (code) => {
      const result = classifyRun(output, code);
      if (result.kind !== "passed") {
        write(`::error title=Integration ${result.kind}::${result.message}`);
        write(`token-atlas integration: ${result.kind}: ${result.message}`);
      }
      resolve(result.exitCode);
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runIntegration({ args: process.argv.slice(2) });
}
