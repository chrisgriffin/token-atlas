/**
 * Editor settings pushed by the host. Held in a module so the small pure
 * helpers (defaults, inline parsing, preview) can read them without threading
 * a prop through every component; App updates it on each host message.
 */
import type { EditorSettings } from "../../shared/protocol";

export const DEFAULT_SETTINGS: EditorSettings = {
  rootFontSize: 16,
  defaultColorSpace: "srgb",
  defaultDimensionUnit: "px",
  contrastTarget: "AA",
  modeView: "single",
};

let current: EditorSettings = DEFAULT_SETTINGS;

export const settings = (): EditorSettings => current;
export function setSettings(next: EditorSettings | undefined): void {
  current = next ?? DEFAULT_SETTINGS;
}
