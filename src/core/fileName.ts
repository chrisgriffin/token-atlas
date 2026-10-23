/**
 * The file name "New Token File" creates from what the user typed. Always the
 * DTCG format's own `.tokens.json` extension, which is what marks an empty
 * file as a token file before it holds any `$value`.
 */
export function tokenFileName(input: string): { name: string } | { error: string } {
  const stem = input
    .trim()
    .replace(/(\.tokens\.json|\.tokens|\.json)$/i, "")
    .replace(/[.\s]+$/, ""); // `a.` would give `a..tokens.json`
  if (!stem) return { error: "Enter a name for the token file." };
  if (/[/\\:*?"<>|\u0000-\u001f]/.test(stem)) {
    return { error: "A file name can't contain / \\ : * ? \" < > | or control characters." };
  }
  // Windows reserves these device names, whatever extension follows.
  const device = stem.split(".")[0];
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(device)) {
    return { error: `"${device}" is a name Windows reserves for a device.` };
  }
  return { name: `${stem}.tokens.json` };
}
