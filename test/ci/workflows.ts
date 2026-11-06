/** What every test that lists `.github/workflows/` shares, so the extension rule is written once. */

/** GitHub runs both extensions from `.github/workflows/`, so a listing reads both. */
export function isWorkflowFile(name: string): boolean {
  return /\.ya?ml$/.test(name)
}
