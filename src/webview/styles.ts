/**
 * Base styles, injected at runtime. We lean entirely on VS Code's theme CSS
 * variables (`--vscode-*`) so the UI matches whatever theme the user runs.
 */
export const css = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
  }
  button {
    font-family: inherit;
    font-size: inherit;
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    border: none;
    padding: 4px 10px;
    border-radius: 3px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    line-height: 1.4;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  button.secondary {
    color: var(--vscode-button-secondaryForeground);
    background: var(--vscode-button-secondaryBackground);
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button.ghost {
    color: var(--vscode-foreground);
    background: transparent;
    padding: 4px 6px;
    opacity: 0.8;
  }
  button.ghost:hover { background: var(--vscode-toolbar-hoverBackground); opacity: 1; }
  button.danger { color: var(--vscode-errorForeground); }
  button.danger.armed {
    color: var(--vscode-button-foreground);
    background: var(--vscode-errorForeground);
  }
  button svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; }

  input, textarea, select {
    font-family: inherit;
    font-size: inherit;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    padding: 4px 6px;
    width: 100%;
  }
  input.mono, textarea, input[type="number"] {
    font-family: var(--vscode-editor-font-family, monospace);
  }
  input[type="number"] { width: 96px; }
  input[type="checkbox"] { width: auto; }
  input:focus, textarea:focus, select:focus {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }
  select {
    width: auto;
    color: var(--vscode-dropdown-foreground);
    background: var(--vscode-dropdown-background);
    border-color: var(--vscode-dropdown-border, transparent);
  }

  .row { cursor: pointer; user-select: none; }
  .row:hover { background: var(--vscode-list-hoverBackground); }
  .row.active {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }
  .row.focused, .row.highlighted { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }

  .toolbar .scope-chip {
    display: inline-flex;
    /* The row's height, which the buttons set: same height as + Token. */
    align-self: stretch;
    align-items: center;
    gap: 2px;
    max-width: 320px;
    padding: 2px 4px 2px 12px;
    border-radius: 999px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.9em;
  }
  .toolbar .scope-chip button { padding: 2px; color: inherit; }
  .toolbar .scope-chip svg { width: 12px; height: 12px; }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
  }
  .mode-bar { display: flex; align-items: center; gap: 8px; margin-left: auto; align-self: stretch; }
  .mode-label { display: flex; align-items: center; gap: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--vscode-descriptionForeground); }
  select.mode-select { width: auto; field-sizing: content; padding: 2px 24px 2px 8px; font-size: 13px; text-transform: none; letter-spacing: normal; }
  .seg { display: inline-flex; padding: 2px; gap: 2px; border-radius: 6px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); }
  .seg button { border: 0; border-radius: 4px; padding: 3px 6px; background: transparent; color: var(--vscode-descriptionForeground); }
  .seg button:hover { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground); }
  .seg button.on { background: var(--vscode-button-secondaryBackground); color: var(--vscode-foreground); }
  table.tokens .cell.readonly { cursor: default; }
  /* A mode's name as the resolver writes it: uppercase would garble darkHighContrast. */
  table.tokens th.mode-head { text-transform: none; letter-spacing: normal; }

  .table-wrap:focus { outline: none; }
  table.tokens { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.tokens th {
    position: sticky;
    top: 0;
    z-index: 1;
    text-align: left;
    font-weight: 500;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--vscode-descriptionForeground);
    padding: 6px 10px;
    background: var(--vscode-editor-background);
    /* A shadow, not a border: in a collapsed-border table the border stays
       behind with the rows when the cell sticks, leaving a 1px gap. */
    box-shadow: inset 0 -1px 0 var(--vscode-panel-border);
  }
  /* A fixed header height, so each group's heading can stick right under it. */
  table.tokens thead th { height: 28px; box-sizing: border-box; }
  /* One heading per group, its path below the scope: parents dim, the group
     itself in full (spec 061). Indented to line up with the names under it. */
  table.tokens tr.section th {
    top: 28px;
    text-transform: none;
    letter-spacing: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--vscode-foreground);
    padding: 14px 10px 6px 30px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  table.tokens tr.section .section-parent {
    font-weight: 400;
    color: var(--vscode-descriptionForeground);
  }
  table.tokens .section-sep { margin: 0 6px; }
  /* Column resize handle, straddling a header cell's right border. */
  table.tokens .col-resizer {
    position: absolute;
    top: 0;
    right: -3px;
    width: 6px;
    height: 100%;
    z-index: 2;
    cursor: col-resize;
    touch-action: none;
  }
  table.tokens .col-resizer:hover::after,
  table.tokens .col-resizer:active::after,
  table.tokens .col-resizer:focus-visible::after {
    content: "";
    position: absolute;
    inset: 0 2px;
    background: var(--vscode-sash-hoverBorder, var(--vscode-focusBorder));
  }
  table.tokens .col-resizer:focus-visible { outline: none; }
  table.tokens td {
    padding: 0 10px;
    height: 28px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 50%, transparent);
    vertical-align: middle;
  }
  table.tokens tr.token { cursor: default; user-select: none; }
  table.tokens tr.token:hover td { background: var(--vscode-list-hoverBackground); }
  table.tokens tr.token.active td {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }
  table.tokens tr.focused td:first-child { box-shadow: inset 2px 0 0 var(--vscode-focusBorder); }
  table.tokens .cell { display: block; overflow: hidden; text-overflow: ellipsis; min-height: 1em; cursor: text; }
  table.tokens input.inline {
    width: 100%;
    height: 22px;
    padding: 1px 5px;
    margin: 0;
    border-radius: 2px;
  }
  table.tokens input.inline.bad { outline: 1px solid var(--vscode-errorForeground); }
  table.tokens .cell:focus { outline: none; }
  /* Empty-cell hints only where the pointer or selection is. display, not
     opacity: invisible text would still draw an ellipsis in a narrow cell. */
  table.tokens .cell .placeholder {
    display: none;
    color: var(--vscode-foreground);
    font-style: italic;
  }
  table.tokens tr:hover .cell .placeholder,
  table.tokens tr.active .cell .placeholder { display: inline; }
  /* Secondary text takes the theme's description colour, not an opacity: a
     faded foreground measures under 4.5:1 in Light+. The hint above sits on
     the row hover, where that colour is under 4.5:1 too, so it is italic in
     the full foreground instead. A selected row keeps one colour throughout. */
  table.tokens .cell.dim,
  table.tokens .type-cell { color: var(--vscode-descriptionForeground); }
  /* On the row hover that colour is 4.28:1 in Light+, so it goes full strength. */
  table.tokens tr.token:hover:not(.active) .cell.dim,
  table.tokens tr.token:hover:not(.active) .type-cell { color: var(--vscode-foreground); }
  table.tokens tr.active .cell.dim,
  table.tokens tr.active .type-cell,
  table.tokens tr.active .cell .placeholder { color: inherit; }

  .glyph { display: inline-block; vertical-align: middle; margin-right: 6px; flex-shrink: 0; }
  .glyph > .swatch { display: block; }
  .glyph-card {
    width: 16px;
    height: 11px;
    border-radius: 2px;
    /* The theme backdrop's card surface (Preview.tsx STAGE.theme.surface). */
    background: color-mix(in srgb, var(--vscode-foreground) 12%, var(--vscode-editor-background));
    border: 1px solid var(--vscode-panel-border);
  }
  .glyph-sample {
    font-family: var(--vscode-font-family);
    font-size: 12px;
    line-height: 1;
    min-width: 16px;
  }
  .glyph-curve, .glyph-icon { color: var(--vscode-focusBorder); }
  /* A token type's icon, beside its name: table, alias picker, panel. */
  .type-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    vertical-align: middle;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  table.tokens .type-cell .type-icon { margin-right: 6px; }
  .type-picker { display: inline-flex; align-items: center; gap: 6px; }
  .resolved {
    flex: 0 1 auto;
    /* Arrow, glyph and an ellipsis survive a narrow cell. */
    min-width: 48px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.92em;
    opacity: 0.8;
  }
  .resolved .arrow { opacity: 0.6; margin: 0 6px 0 2px; }
  button.ghost.issue-mark { display: inline-flex; flex-shrink: 0; padding: 0; opacity: 1; background: transparent; }
  button.ghost.issue-mark.sev-error { color: var(--vscode-errorForeground); }
  button.ghost.issue-mark.sev-warning { color: var(--vscode-editorWarning-foreground); }
  .issue-mark svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.6; }
  table.tokens .mono { font-family: var(--vscode-editor-font-family, monospace); font-size: 0.92em; }
  table.tokens .chip {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: middle;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.85em;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--vscode-textCodeBlock-background);
    border: 1px solid var(--vscode-panel-border);
  }
  /* An inline-block is atomic to its cell's ellipsis: once a swatch and chip
     overflow, the whole chip becomes "…". A cell holding a chip is a row
     instead, so the chip shrinks and ellipsizes inside its own pill. */
  table.tokens .cell:has(> .chip) { display: flex; align-items: center; }
  table.tokens .cell > .chip { flex: 0 1 auto; min-width: 0; }
  table.tokens td.edit-cell { padding: 0; text-align: center; }
  table.tokens button.edit { opacity: 0; width: 100%; height: 28px; justify-content: center; border-radius: 0; }
  table.tokens tr:hover button.edit, table.tokens tr.active button.edit, table.tokens button.edit:focus-visible { opacity: 0.8; }

  /* The detail panel floats over the table's right edge rather than taking
     width from it, so the table keeps its columns readable. */
  .panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 3;
    overflow: auto;
    border-left: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    box-shadow: -6px 0 12px -6px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.36));
  }
  /* Straddles the panel's left border; \`right\` is set to the panel width. */
  .panel-resizer {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 4;
    width: 6px;
    margin-right: -3px;
    cursor: col-resize;
    touch-action: none;
  }
  .panel-resizer:hover::after,
  .panel-resizer.dragging::after,
  .panel-resizer:focus-visible::after {
    content: "";
    position: absolute;
    inset: 0 2px;
    background: var(--vscode-sash-hoverBorder, var(--vscode-focusBorder));
  }
  .panel-resizer:focus-visible { outline: none; }

  /* Detail panel header: a bar pinned to the panel top, bleeding past the
     panel's 14px/20px padding so its rule runs edge to edge. Sticky makes it
     the containing block for the corner close button. */
  .node-header {
    position: sticky;
    top: 0;
    z-index: 1;
    margin: -14px -20px 16px;
    padding: 10px 12px 14px 20px;
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  /* The breadcrumb wraps rather than truncating, and keeps clear of close. */
  .node-header-path {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    min-height: 24px;
    margin: 0 36px 0 -5px;
    font-size: 0.9em;
  }
  .node-header-path .crumb {
    font: inherit;
    color: var(--vscode-descriptionForeground);
    background: transparent;
    padding: 1px 5px;
    border-radius: 4px;
  }
  .node-header-path .crumb:hover { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground); }
  .node-header-path .crumb-sep { color: var(--vscode-descriptionForeground); opacity: 0.5; }
  .node-header-close {
    position: absolute;
    top: 10px;
    right: 12px;
    width: 26px;
    height: 24px;
    padding: 0;
    justify-content: center;
    color: var(--vscode-foreground);
    background: transparent;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
  }
  .node-header-close:hover { background: var(--vscode-toolbar-hoverBackground); }
  /* Clear of the top line, so a short path never brings close near the group. */
  .node-header-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; margin-top: 18px; }
  .node-header-name { display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 28px; }
  .node-header-name h2 {
    margin: 0;
    font-size: 1.55em;
    font-weight: 600;
    letter-spacing: -0.015em;
    cursor: text;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-bottom: 1px dashed transparent;
  }
  .node-header-name h2:hover { border-bottom-color: var(--vscode-descriptionForeground); }
  .node-header-name input { font-size: 1.55em; font-weight: 600; max-width: 320px; }
  .node-header-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    margin-top: 6px;
    font-size: 0.9em;
    color: var(--vscode-descriptionForeground);
  }
  .node-header-meta .type-picker {
    padding: 2px 8px 2px 10px;
    border-radius: 999px;
    color: var(--vscode-badge-foreground);
    background: var(--vscode-badge-background);
  }
  /* Sized to the chosen option, not the longest one in the list. */
  .node-header-meta select.type-select { field-sizing: content; border: 0; opacity: 1; padding-left: 0; font-size: 0.95em; }
  .node-header-meta .meta-sep { opacity: 0.5; }
  .node-header-summary {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Move and delete as one filled control; delete stays neutral until hovered. */
  .btn-group {
    display: inline-flex;
    flex-shrink: 0;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    overflow: hidden;
    background: var(--vscode-button-secondaryBackground);
  }
  .btn-group button { border-radius: 0; height: 26px; min-width: 28px; padding: 0 7px; justify-content: center; opacity: 1; }
  .btn-group button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .btn-group button + button { border-left: 1px solid var(--vscode-panel-border); }
  .btn-group button.danger:not(.armed) { color: var(--vscode-foreground); }
  .btn-group button.danger:not(.armed):hover { color: var(--vscode-errorForeground); }

  .section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
  .section-head .eyebrow { margin: 0; }

  .ref-row { display: flex; align-items: center; gap: 8px; min-height: 26px; min-width: 0; }
  /* The reference itself is the control: click it to pick another token. */
  .ref-chip {
    display: inline-flex; align-items: center; min-width: 0; padding: 3px 12px;
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
    border: 1px solid transparent; border-radius: 4px; cursor: pointer;
  }
  .ref-chip:hover { border-color: var(--vscode-focusBorder); background: var(--vscode-badge-background); }
  .ref-chip code { background: none; padding: 0; color: inherit; }
  .ref-row code { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 1; }

  .problems { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .problems li { display: flex; gap: 6px; align-items: flex-start; }
  .problems li span { color: var(--vscode-foreground); }
  .problems svg { width: 13px; height: 13px; margin-top: 2px; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 1.6; }

  code {
    font-family: var(--vscode-editor-font-family, monospace);
    background: var(--vscode-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
  }

  /* Section label: small caps eyebrow above each block of the detail form. */
  .eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0 0 6px;
  }
  /* Inner field label inside a type editor. */
  .field-label { display: block; font-size: 0.85em; opacity: 0.7; margin-bottom: 3px; }

  .pill {
    display: inline-block;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.8em;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid var(--vscode-panel-border);
    opacity: 0.85;
  }

  select.type-select {
    appearance: none;
    -webkit-appearance: none;
    width: auto;
    cursor: pointer;
    background: transparent;
    color: inherit;
    padding-right: 16px;
    /* Chevron from two half-filled squares in the text colour: a data-URI
       SVG cannot read currentColor or a theme variable. */
    background-image:
      linear-gradient(45deg, transparent 50%, currentColor 50%),
      linear-gradient(135deg, currentColor 50%, transparent 50%);
    background-repeat: no-repeat;
    background-position: right 8px center, right 4px center;
    background-size: 4px 4px;
  }
  select.type-select option, select.type-select optgroup { font-family: var(--vscode-font-family); font-size: 13px; }
  .pill.deprecated { color: var(--vscode-editorWarning-foreground); border-color: currentColor; opacity: 1; }
  table.tokens .name-cell { display: flex; align-items: center; gap: 6px; min-width: 0; }
  /* While renaming, the input gets the whole cell, and a name longer than the
     column grows the input over the next one rather than scrolling inside it. */
  table.tokens td:has(input.inline.grow) { overflow: visible; }
  table.tokens .name-cell input.inline.grow {
    flex: 0 0 auto;
    min-width: calc(100% - 40px);
    position: relative;
    z-index: 2;
  }
  table.tokens .grip {
    display: inline-flex;
    width: 14px;
    height: 16px;
    flex-shrink: 0;
    opacity: 0;
    cursor: grab;
    color: var(--vscode-foreground);
  }
  table.tokens .grip svg { width: 14px; height: 14px; }
  table.tokens tr:hover .grip, table.tokens tr.active .grip { opacity: 0.45; }
  table.tokens .grip:hover { opacity: 0.9 !important; }
  table.tokens .grip:active { cursor: grabbing; }
  table.tokens tr.dragging td { opacity: 0.35; }
  table.tokens tr.drop-before td { box-shadow: inset 0 2px 0 var(--vscode-focusBorder); }
  table.tokens tr.drop-after td { box-shadow: inset 0 -2px 0 var(--vscode-focusBorder); }
  table.tokens .value-cell { display: flex; align-items: center; gap: 4px; min-width: 0; }
  table.tokens .value-cell .cell { flex: 0 1 auto; min-width: 0; }
  table.tokens .value-cell input.inline { flex: 1; min-width: 0; width: auto; }
  table.tokens .alias-wrap { position: relative; flex-shrink: 0; display: inline-flex; }
  table.tokens button.alias-trigger { opacity: 0; padding: 2px; }
  table.tokens button.alias-trigger svg { width: 12px; height: 12px; }
  table.tokens tr:hover button.alias-trigger,
  table.tokens tr.active button.alias-trigger,
  table.tokens button.alias-trigger[aria-expanded="true"],
  table.tokens button.alias-trigger:focus-visible { opacity: 0.8; }
  table.tokens .alias-popover {
    position: fixed;
    z-index: 10;
    width: 380px;
    max-width: 80vw;
    margin-top: 4px;
    padding: 8px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    background: var(--vscode-editorWidget-background);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size, 13px);
    white-space: normal;
    text-align: left;
  }
  table.tokens .alias-popover .row { padding: 4px 8px; }
  .mono { font-family: var(--vscode-editor-font-family, monospace); }
  /* The name never shrinks while any prefix is left to give; even a fraction
     of a pixel would ellipsize it. Capped at the cell for a name longer
     than the column. */
  table.tokens .name-cell .cell { flex: 0 0 auto; max-width: 100%; }
  table.tokens .name-cell input.inline { flex: 1; min-width: 0; width: auto; }

  .swatch {
    display: inline-block;
    border-radius: 3px;
    border: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
    background-image:
      linear-gradient(45deg, rgba(128,128,128,.25) 25%, transparent 25%, transparent 75%, rgba(128,128,128,.25) 75%),
      linear-gradient(45deg, rgba(128,128,128,.25) 25%, transparent 25%, transparent 75%, rgba(128,128,128,.25) 75%);
    background-size: 8px 8px;
    background-position: 0 0, 4px 4px;
  }
  .swatch > span { display: block; width: 100%; height: 100%; border-radius: inherit; }
  .swatch.picker { position: relative; cursor: pointer; }
  .swatch.picker input[type="color"] {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    padding: 0;
    border: 0;
    cursor: pointer;
  }

  .preview {
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 14px 16px;
    margin-bottom: 18px;
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 72px;
  }
  .preview .meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    font-size: 0.9em;
    min-width: 0;
  }
  .preview .meta code { font-size: 0.95em; opacity: 0.85; }
  .preview .contrast { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 2px; }
  .preview .level {
    display: inline-block;
    font-size: 0.8em;
    font-weight: 600;
    padding: 0 5px;
    border-radius: 999px;
    border: 1px solid currentColor;
  }
  .preview .level.pass { color: var(--vscode-testing-iconPassed, var(--vscode-charts-green, #3fb950)); }
  .preview .level.fail { color: var(--vscode-errorForeground); }
  .preview.staged { flex-direction: column; align-items: stretch; gap: 8px; }
  .preview .stage {
    flex: 1;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 16px 20px;
    overflow: hidden;
    min-width: 0;
  }
  .backdrop-switch { display: inline-flex; align-self: flex-end; gap: 2px; margin: -6px -8px 0 0; }
  .backdrop-switch button {
    color: var(--vscode-foreground);
    background: transparent;
    padding: 1px 6px;
    font-size: 0.85em;
    opacity: 0.6;
  }
  .backdrop-switch button:hover { background: var(--vscode-toolbar-hoverBackground); opacity: 0.9; }
  .backdrop-switch button.active { opacity: 1; background: var(--vscode-toolbar-activeBackground, var(--vscode-toolbar-hoverBackground)); }

  .layer + .layer { border-top: 1px solid var(--vscode-panel-border); padding-top: 10px; margin-top: 10px; }

  .statusbar {
    border-top: 1px solid var(--vscode-panel-border);
    background: var(--vscode-editorWidget-background);
    font-size: 0.9em;
  }
  /* The summary and each problem are buttons, for the keyboard; they keep the
     look of a status line and list rows. */
  .statusbar button.summary, .statusbar button.issue {
    width: 100%;
    color: var(--vscode-foreground);
    background: transparent;
    border-radius: 0;
    text-align: left;
    user-select: none;
  }
  .statusbar button.summary { padding: 4px 10px; gap: 14px; }
  .statusbar button.issue { padding: 3px 10px; gap: 8px; }
  .statusbar button.summary:hover, .statusbar button.issue:hover {
    background: var(--vscode-list-hoverBackground);
  }
  .statusbar button:focus-visible { outline-offset: -1px; }
  .statusbar .chevron { display: inline-flex; margin-left: auto; opacity: 0.6; }
  .statusbar .chevron.folded svg { transform: rotate(180deg); }
  .statusbar .summary span { display: inline-flex; align-items: center; gap: 4px; }
  .statusbar svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.6; }
  .sev-error { color: var(--vscode-errorForeground); }
  .sev-warning { color: var(--vscode-editorWarning-foreground); }
`;

const style = document.createElement("style");
style.textContent = css;
document.head.appendChild(style);
