/**
 * Color helpers for the webview editors. The implementation lives in the pure
 * core (src/core/color.ts) so the host's DocumentColorProvider shares it; this
 * file just re-exports the webview-facing surface.
 */
export {
  COLOR_SPACES,
  CHANNEL_LABELS,
  isDtcgColor,
  toColor,
  toHex,
  buildFromColor,
  buildFromHex,
  buildFromComponents,
  type DtcgColorSpace,
  type DtcgColor,
} from "../../core/color"
