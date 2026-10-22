/** A handful of inline 16px stroke icons, so the webview ships no icon font. */
import type { TokenType } from "../core/types";

const base = { viewBox: "0 0 16 16", "aria-hidden": true } as const;

export const ChevronDown = () => (
  <svg {...base}>
    <path d="M4 6l4 4 4-4" />
  </svg>
);
export const ArrowUp = () => (
  <svg {...base}>
    <path d="M8 13V3M4 7l4-4 4 4" />
  </svg>
);
export const ArrowDown = () => (
  <svg {...base}>
    <path d="M8 3v10M4 9l4 4 4-4" />
  </svg>
);
export const Trash = () => (
  <svg {...base}>
    <path d="M3 4.5h10M6.5 4.5v-1h3v1M4.5 4.5l.7 8.5h5.6l.7-8.5M6.8 7v4M9.2 7v4" />
  </svg>
);
export const Pencil = () => (
  <svg {...base}>
    <path d="M11.5 2.5l2 2L5 13H3v-2z" />
  </svg>
);
export const Braces = () => (
  <svg {...base}>
    <path d="M6 2.5c-1.5 0-2 .7-2 2v2c0 .8-.6 1.5-1.5 1.5C3.4 8 4 8.7 4 9.5v2c0 1.3.5 2 2 2M10 2.5c1.5 0 2 .7 2 2v2c0 .8.6 1.5 1.5 1.5-.9 0-1.5.7-1.5 1.5v2c0 1.3-.5 2-2 2" />
  </svg>
);
export const ErrorIcon = () => (
  <svg {...base}>
    <circle cx="8" cy="8" r="6" />
    <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" />
  </svg>
);
export const WarningIcon = () => (
  <svg {...base}>
    <path d="M8 2.5L14 13H2zM8 6.5v3M8 11.2v.3" />
  </svg>
);
export const Close = () => (
  <svg {...base}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);
/** The mode view toggle: one column, or several side by side. */
export const ModeSingle = () => (
  <svg {...base}>
    <rect x="3" y="2.5" width="10" height="11" rx="1.5" />
  </svg>
);
export const ModeColumns = () => (
  <svg {...base}>
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
    <path d="M6 2.5v11M10 2.5v11" />
  </svg>
);
export const Grip = () => (
  <svg {...base}>
    <circle cx="6" cy="4" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="10" cy="4" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="6" cy="8" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="10" cy="8" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="10" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);
/** Link a token's value to another token. */
export const Link = () => (
  <svg {...base}>
    <path d="M6.5 9.5a3 3 0 0 0 4.24 0l1.77-1.77a3 3 0 0 0-4.24-4.24l-.88.88" />
    <path d="M9.5 6.5a3 3 0 0 0-4.24 0L3.49 8.27a3 3 0 0 0 4.24 4.24l.88-.88" />
  </svg>
);
/** Break the link, keeping the value it resolved to. */
export const Unlink = () => (
  <svg {...base}>
    <path d="M9.5 6.5a3 3 0 0 0-4.24 0L3.49 8.27a3 3 0 0 0 4.24 4.24" />
    <path d="M6.5 9.5a3 3 0 0 0 4.24 0l1.77-1.77a3 3 0 0 0-1.4-5" />
    <path d="M2.5 2.5l11 11" />
  </svg>
);

/** One icon per DTCG type, drawn beside the type's name wherever it is shown.
 *  Keyed by `TokenType`, so a new type fails typecheck until it has one. */
export const TYPE_ICON_PATHS: Record<TokenType, string> = {
  color: "M8 2.5s4 4.3 4 7a4 4 0 0 1-8 0c0-2.7 4-7 4-7z",
  dimension: "M1.5 5h13v6h-13z M4.5 5v3 M8 5v3 M11.5 5v3",
  fontFamily:
    "M2.5 13L6 3.5 9.5 13 M3.8 9.5h4.4 M11 8.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z M12.8 8.5V13",
  fontWeight: "M4.5 3h4a2.5 2.5 0 0 1 0 5h-4z M4.5 8h4.8a2.5 2.5 0 0 1 0 5H4.5z",
  duration: "M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13z M8 4.5V8l2.5 1.5",
  cubicBezier: "M2.5 13.5C9 13.5 7 2.5 13.5 2.5 M2.5 13.5h4 M13.5 2.5h-4",
  number: "M6.5 2.5l-1.5 11 M11 2.5l-1.5 11 M3 6h10.5 M2.5 10h10.5",
  strokeStyle: "M2 5h12 M2 11h2.5 M6.75 11h2.5 M11.5 11h2.5",
  border: "M3 3h10v10H3z M5.5 5.5h5v5h-5z",
  transition: "M2 8h11 M10 5l3 3-3 3 M2 4.5h3 M2 11.5h3",
  shadow: "M2.5 2.5h8v8h-8z M10.5 5.5h3v8h-8v-3",
  gradient: "M2.5 2.5h11v11h-11z M2.5 9.5l7-7 M2.5 13.5l11-11 M6.5 13.5l7-7",
  typography: "M2.5 3.5h7 M6 3.5v9 M10.5 8.5h4 M12.5 8.5v4",
};

/** The type's icon, or nothing for an untyped token. Decorative: the type's
 *  name is always visible beside it. */
export function TypeIcon({ type }: { type: TokenType | undefined }) {
  if (!type) return null;
  return (
    <svg {...base} className="type-icon" data-type={type}>
      <path d={TYPE_ICON_PATHS[type]} />
    </svg>
  );
}
