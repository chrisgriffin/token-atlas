// `npm run test:integration`: runs `vscode-test` and says why it failed (#2).
//
// VS Code's window sometimes hangs at startup on a loaded CI runner — its main
// process logs "CodeWindow: detected unresponsive" and exits 1 before mocha
// reports a single test. Unwrapped, that looks exactly like a failing test.
// This names it in the step's output and gives it an exit code of its own,
// and since no test ran, it tries once more before failing.
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export const EXIT = { startupHang: 3, noTestsReported: 4 };

const HANG = "detected unresponsive";
// The spec reporter's per-test lines (`✔ title`, `1) title`) and its summary.
const TEST_REPORTED = /^\s*(✔|✓|\d+\) \S)|^\s*\d+ (passing|failing|pending)\b/m;

/** @returns {"passed" | "test-failure" | "startup-hang" | "no-tests-reported"} */
export function classify(code, output) {
  if (code === 0) return "passed";
  // A coloured reporter wraps each mark in escape codes.
  if (TEST_REPORTED.test(output.replace(/\x1b\[[0-9;]*m/g, ""))) {
    return "test-failure";
  }
  if (output.includes(HANG)) return "startup-hang";
  return "no-tests-reported";
}

const HANG_TEXT = `VS Code logged "CodeWindow: ${HANG}" and exited before any test ran`;

/**
 * @param {() => Promise<{ code: number, output: string }>} launch
 * @param {(line: string) => void} log
 */
export async function runIntegration(launch, log) {
  let { code, output } = await launch();
  if (classify(code, output) === "startup-hang") {
    log(`::warning title=VS Code startup hang::${HANG_TEXT}; retrying once.`);
    ({ code, output } = await launch());
  }
  switch (classify(code, output)) {
    case "passed":
      return 0;
    case "test-failure":
      log(
        `::error title=Integration tests failed::vscode-test exited ${code} after mocha reported results.`,
      );
      return code;
    case "startup-hang":
      log(
        `::error title=VS Code startup hang::${HANG_TEXT}, twice — no test ran, so this is not a test failure.`,
      );
      return EXIT.startupHang;
    default:
      log(
        `::error title=No integration tests reported::vscode-test exited ${code} before mocha reported any test, with no startup hang logged.`,
      );
      return EXIT.noTestsReported;
  }
}

/** One `vscode-test` run, its output streamed through and kept. */
function launchVscodeTest() {
  return new Promise((resolve) => {
    let output = "";
    const child = spawn("vscode-test", process.argv.slice(2), {
      shell: process.platform === "win32",
    });
    child.stdout.on("data", (d) => {
      process.stdout.write(d);
      output += d;
    });
    child.stderr.on("data", (d) => {
      process.stderr.write(d);
      output += d;
    });
    child.on("error", (err) => {
      output += String(err);
    });
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runIntegration(launchVscodeTest, (line) => console.log(line));
}
