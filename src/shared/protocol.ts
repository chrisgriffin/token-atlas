/**
 * The typed contract between the extension host and the webview.
 *
 * Both sides import these types so the message channel stays honest. The
 * webview sends *intents* (it never writes files); the host sends *state*.
 */
import type { TokenDocumentModel, TokenNode, TokenType, ValidationResult } from "../core/types";
import type { ContrastTarget } from "../core/color";
import type { ModeCell } from "../core/modes";

/** Webview -> Host. */
export type WebviewToHost =
  | { type: "ready" }
  | { type: "setValue"; path: string[]; value: unknown }
  | { type: "setDescription"; path: string[]; description: string }
  | { type: "setDeprecated"; path: string[]; deprecated: boolean | string | undefined }
  | {
      type: "setType";
      path: string[];
      tokenType: TokenType | undefined;
      /** Written as `$value` after the type, in the same handler. */
      starterValue?: unknown;
    }
  | { type: "addToken"; parentPath: string[]; name: string }
  | { type: "addGroup"; parentPath: string[]; name: string }
  | { type: "deleteNode"; path: string[] }
  | { type: "renameNode"; path: string[]; newName: string }
  | { type: "moveNode"; path: string[]; direction: "up" | "down" }
  /** Full new order of the non-$ keys under `parentPath` (drag and drop). */
  | { type: "reorderNodes"; parentPath: string[]; order: string[] }
  | { type: "openAsText" }
  /** The table's scope changed in the webview (chip cleared). */
  | { type: "setScope"; path: string[] }
  /** Column widths after a resize, saved for every token file. */
  | { type: "setColumnWidths"; widths: ColumnWidths }
  /** Make this context of the file's modifier the active resolution. */
  | { type: "setMode"; context: string }
  /** Write `$value` at `path` in `context`'s own file. */
  | { type: "setModeValue"; context: string; path: string[]; value: unknown }
  /** The toolbar's view toggle; saved as `tokenAtlas.modeView`. */
  | { type: "setModeView"; view: ModeView };

export type ModeView = "single" | "sideBySide";

/** The modes of a file a resolver modifier lists as one (`core/modes.ts`). */
export interface Modes {
  modifier: string;
  /** Every context, in the resolver's order. */
  contexts: string[];
  /** The context this file is the last file of: its cells are the file's own. */
  own: string;
  /** The context the active resolution has chosen, or `own` when it names none. */
  active: string;
  /** Context → dotted token path → cell. */
  values: Record<string, Record<string, ModeCell>>;
}

/** Token-table column widths in px; a missing column keeps its default. */
export type ColumnWidths = Partial<Record<"name" | "value" | "type", number>>;

/** Settings the visual editor needs. Mirrors `contributes.configuration`. */
export interface EditorSettings {
  /** `px` per `rem`, for dimension conversions. */
  rootFontSize: number;
  /** Colour space new colour tokens are created in. */
  defaultColorSpace: string;
  /** Unit new dimension tokens are created in. */
  defaultDimensionUnit: "px" | "rem";
  /** WCAG level the colour preview judges contrast against. */
  contrastTarget: ContrastTarget;
  /** One mode at a time, or every mode side by side. */
  modeView: ModeView;
}

interface State {
  model: TokenDocumentModel;
  validation: ValidationResult;
  /** Tokens defined in other files (for cross-file alias references). */
  externalTokens: TokenNode[];
  settings: EditorSettings;
  /** Group the table is scoped to, chosen in the Tokens panel. */
  scope: string[];
  /** Token the panel asked to open, delivered once on `init`. */
  selected?: string[];
  /** Saved table column widths, shared by every token file. */
  columnWidths: ColumnWidths;
  /** Set when this file is a mode of a resolver modifier. */
  modes?: Modes;
}

/** Host -> Webview. */
export type HostToWebview =
  | ({ type: "init" } & State)
  | ({ type: "update" } & State)
  | { type: "error"; message: string }
  /** The Tokens panel selected a group; scope the table to it, and open the
   *  detail panel on `select` when it picked a token rather than a group. */
  | { type: "scope"; path: string[]; select?: string[] };
