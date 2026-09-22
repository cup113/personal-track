/**
 * The board's stylesheet.
 *
 * Hand-written CSS injected once into the document under a data attribute, with
 * every class prefixed `pt-`. Colours are translucent greys plus one green
 * accent and one blue accent, so the board inherits whatever theme the shell is
 * using instead of hard-coding a palette of its own.
 *
 * The visual language: a tile is a rounded surface that lifts on hover, turns
 * green when its habit is complete, and holds its own actions. Buttons come in
 * three weights — primary (a filled accent pill), ghost (an outlined pill) and
 * icon (a bare glyph that gains a surface on hover).
 */
const CSS = `
/* One palette shared by the sidebar board and the main-area statistics panel. */
.pt-board, .pt-panel {
  --pt-surface: rgba(127,127,127,.07);
  --pt-surface-2: rgba(127,127,127,.13);
  --pt-line: rgba(127,127,127,.18);
  --pt-line-strong: rgba(127,127,127,.34);
  --pt-accent: rgba(90,175,120,.95);
  --pt-accent-soft: rgba(90,175,120,.15);
  --pt-accent-line: rgba(90,175,120,.48);
  --pt-info: rgba(96,150,215,.3);
  --pt-info-soft: rgba(96,150,215,.15);
  --pt-info-line: rgba(96,150,215,.45);
  font-size: 13px; line-height: 1.45;
}
.pt-board { display: flex; flex-direction: column; gap: 9px; padding: 10px 10px 26px; }
/*
 * The main panel scrolls itself.
 *
 * The shell's centre column is a flex column with overflow:hidden and provides
 * no scroller of its own — the occupant of the 'main' slot owns that region
 * (the Conversation scrolls inside itself the same way). The slot's anchor is
 * display:contents, so this element is laid out as a direct flex item of that
 * column. min-height:0 is the load-bearing part: a flex item's automatic
 * minimum size is its content, so without it the panel refuses to shrink and
 * simply overflows the clipping column, where overflow-y:auto never engages.
 *
 * The sidebar board needs none of this: a dock pane body is its own
 * overflow:auto scroller.
 */
.pt-panel {
  display: flex; flex-direction: column; gap: 12px; padding: 16px 18px 32px;
  flex: 1 1 auto; min-height: 0; overflow-y: auto;
}

/* ---- shared atoms ---------------------------------------------------- */
.pt-muted { opacity: .6; }
.pt-grow { flex: 1; }
.pt-error { border: 1px solid rgba(220,90,90,.5); background: rgba(220,90,90,.12); border-radius: 9px; padding: 6px 9px; font-size: 12px; }
.pt-big { font-size: 20px; font-weight: 650; font-variant-numeric: tabular-nums; }

.pt-primary {
  appearance: none; border: 1px solid var(--pt-info-line); background: var(--pt-info-soft);
  color: inherit; border-radius: 8px; padding: 4px 10px;
  font: inherit; font-size: 12px; font-weight: 500; cursor: pointer;
  transition: background .12s ease, border-color .12s ease, transform .08s ease;
}
.pt-primary:hover:not(:disabled) { background: var(--pt-info); }
.pt-primary:active:not(:disabled) { transform: scale(.97); }
.pt-primary:disabled { opacity: .4; cursor: default; }

.pt-ghost {
  appearance: none; border: 1px solid var(--pt-line); background: transparent;
  color: inherit; border-radius: 8px; padding: 4px 9px;
  font: inherit; font-size: 12px; opacity: .8; cursor: pointer;
  transition: background .12s ease, opacity .12s ease, transform .08s ease;
}
.pt-ghost:hover:not(:disabled) { background: var(--pt-surface-2); opacity: 1; }
.pt-ghost:active:not(:disabled) { transform: scale(.97); }
.pt-ghost:disabled { opacity: .35; cursor: default; }

.pt-icon {
  appearance: none; width: 22px; height: 22px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid transparent; background: transparent; color: inherit;
  border-radius: 6px; font: inherit; font-size: 13px; line-height: 1; opacity: .7;
  cursor: pointer; transition: background .12s ease, border-color .12s ease, opacity .12s ease;
}
.pt-icon:hover:not(:disabled) { opacity: 1; background: var(--pt-surface-2); border-color: var(--pt-line); }
.pt-icon:disabled { opacity: .3; cursor: default; }

.pt-input {
  border: 1px solid var(--pt-line-strong); background: var(--pt-surface-2); color: inherit;
  border-radius: 7px; padding: 3px 6px; font: inherit; font-size: 12px; min-width: 0;
}
.pt-date { flex: 1; }

/* ---- progress strip -------------------------------------------------- */
.pt-strip {
  display: flex; align-items: center; gap: 12px;
  padding: 9px 11px; border: 1px solid var(--pt-line); border-radius: 12px;
  background: var(--pt-surface);
}
.pt-ring { display: flex; align-items: center; gap: 8px; }
.pt-ring svg { display: block; }
.pt-ring-track { fill: none; stroke: var(--pt-surface-2); stroke-width: 4; }
.pt-ring-fill { fill: none; stroke: var(--pt-accent); stroke-width: 4; stroke-linecap: round; transition: stroke-dashoffset .25s ease; }
.pt-ring-text { display: flex; flex-direction: column; line-height: 1.1; font-weight: 650; font-variant-numeric: tabular-nums; }
.pt-ring-text small { font-weight: 400; font-size: 10px; opacity: .6; }
.pt-chip { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.pt-chip-count { font-size: 11px; opacity: .65; font-variant-numeric: tabular-nums; }
/*
 * One square per cell, filled to that cell's fraction. The fill is itself a
 * gradient, so a partly done cell reads as a green level rather than a step.
 */
.pt-marks { display: flex; flex-wrap: wrap; gap: 3px; }
.pt-mark {
  display: block; width: 10px; height: 10px; overflow: hidden;
  border: 1px solid var(--pt-line-strong); border-radius: 3px;
  background: var(--pt-surface-2);
  transition: border-color .12s ease;
}
.pt-mark-on { border-color: var(--pt-accent-line); }
.pt-mark-fill {
  display: block; height: 100%;
  background: linear-gradient(90deg, rgba(90,175,120,.95), rgba(146,215,170,.9));
  transition: width .18s ease;
}

/* ---- date navigator -------------------------------------------------- */
.pt-nav-wrap { display: flex; flex-direction: column; gap: 6px; }
.pt-nav { display: flex; align-items: center; gap: 5px; }
.pt-nav-label { flex: 1; font-weight: 600; }
.pt-nav-label small { font-weight: 400; opacity: .65; }
.pt-nav-second { display: flex; align-items: center; gap: 6px; }

/* ---- category pills -------------------------------------------------- */
.pt-pills { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 1px; }
.pt-pill {
  appearance: none; border: 1px solid var(--pt-line); background: transparent; color: inherit;
  border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 12px; opacity: .75;
  white-space: nowrap; cursor: pointer; transition: background .12s ease, opacity .12s ease, border-color .12s ease;
}
.pt-pill:hover { opacity: 1; background: var(--pt-surface-2); }
.pt-pill-on { opacity: 1; background: var(--pt-info-soft); border-color: var(--pt-info-line); }

/* ---- the grid of tiles ---------------------------------------------- */
.pt-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
.pt-span-1 { grid-column: span 1; }
.pt-span-2 { grid-column: 1 / -1; }
.pt-group {
  grid-column: 1 / -1; display: flex; align-items: baseline; gap: 6px;
  margin: 3px 0 -2px; font-size: 11px; letter-spacing: .06em; opacity: .55;
}

.pt-tile {
  display: flex; flex-direction: column; gap: 7px;
  padding: 9px 10px; border: 1px solid var(--pt-line); border-radius: 12px;
  background: var(--pt-surface); min-width: 0;
  transition: background .12s ease, border-color .12s ease;
}
.pt-tile:hover { background: var(--pt-surface-2); border-color: var(--pt-line-strong); }
.pt-tone-done { background: var(--pt-accent-soft); border-color: var(--pt-accent-line); }
.pt-tone-done:hover { background: rgba(90,175,120,.2); border-color: var(--pt-accent); }

.pt-tile-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.pt-tile-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-tile-meta { margin-left: auto; font-size: 11px; opacity: .65; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pt-tile-meta + .pt-tile-actions { margin-left: 4px; }
.pt-tile-actions { display: inline-flex; gap: 3px; margin-left: auto; }
.pt-tile-foot { display: flex; align-items: center; gap: 6px; }
.pt-rows { display: flex; flex-direction: column; gap: 5px; }

/* ---- recorded times -------------------------------------------------- */
.pt-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-height: 22px; }
.pt-chip-time {
  display: inline-flex; align-items: stretch; overflow: hidden;
  border: 1px solid var(--pt-accent-line); background: var(--pt-accent-soft); border-radius: 7px;
}
.pt-chip-time-label {
  appearance: none; border: 0; background: none; color: inherit; cursor: pointer;
  font: inherit; font-size: 11px; font-variant-numeric: tabular-nums; padding: 2px 5px;
}
.pt-chip-time-label:hover:not(:disabled) { background: rgba(90,175,120,.22); }
.pt-chip-time-label:disabled { opacity: .5; cursor: default; }
.pt-chip-time-remove {
  appearance: none; border: 0; border-left: 1px solid var(--pt-accent-line); background: none;
  color: inherit; cursor: pointer; font: inherit; font-size: 11px; line-height: 1; padding: 2px 4px; opacity: .55;
}
.pt-chip-time-remove:hover:not(:disabled) { opacity: 1; background: rgba(220,90,90,.22); }
.pt-chip-time-remove:disabled { opacity: .3; cursor: default; }

/* ---- the empty slot -------------------------------------------------- */
.pt-plus {
  appearance: none; cursor: pointer; font: inherit; font-size: 12px; line-height: 1;
  min-width: 34px; min-height: 22px; padding: 2px 9px;
  border: 1px dashed var(--pt-line-strong); border-radius: 7px;
  background: none; color: inherit; opacity: .7;
  transition: opacity .12s ease, border-color .12s ease, background .12s ease;
}
.pt-plus:hover:not(:disabled) { opacity: 1; border-color: var(--pt-accent-line); background: var(--pt-accent-soft); }
.pt-plus:active:not(:disabled) { transform: scale(.97); }
.pt-plus:disabled { opacity: .3; cursor: default; }

/* ---- meal rows ------------------------------------------------------- */
.pt-meals { display: flex; flex-direction: column; gap: 3px; }
.pt-meal { display: flex; align-items: center; gap: 7px; min-height: 24px; }
.pt-meal-label { font-size: 11px; opacity: .7; width: 26px; flex: none; }
.pt-meal-time { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
.pt-meal-price { font-size: 11px; opacity: .65; font-variant-numeric: tabular-nums; }
.pt-meal-actions { margin-left: auto; display: inline-flex; align-items: center; gap: 3px; }
.pt-meal-done .pt-meal-label { opacity: 1; }

/* ---- metrics and bars ------------------------------------------------ */
.pt-metrics { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; font-variant-numeric: tabular-nums; }
.pt-metrics small { opacity: .55; }
.pt-bar { height: 5px; border-radius: 3px; background: var(--pt-surface-2); overflow: hidden; }
.pt-bar-fill {
  height: 100%; border-radius: 3px;
  background: linear-gradient(90deg, rgba(90,175,120,.8), rgba(130,205,155,.95));
  transition: width .18s ease;
}

/* ---- session lists and forms ---------------------------------------- */
.pt-sub-head {
  display: flex; align-items: center; gap: 6px;
  margin-top: 1px; padding-top: 6px; border-top: 1px dashed var(--pt-line);
}
.pt-sub-title { font-size: 11px; opacity: .6; }
.pt-sub-head .pt-icon { margin-left: auto; }
.pt-list-row { display: flex; align-items: center; gap: 4px; }
.pt-list-text {
  flex: 1; min-width: 0; font-size: 12px; font-variant-numeric: tabular-nums;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pt-form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px; padding: 2px 0 1px; }
.pt-field { display: flex; flex-direction: column; gap: 2px; font-size: 11px; }
.pt-form-actions { display: flex; gap: 5px; }

/* ---- registry badges ------------------------------------------------- */
.pt-badge {
  display: inline-block; padding: 0 5px; border-radius: 5px; font-size: 10px;
  border: 1px solid var(--pt-line-strong); background: var(--pt-surface-2);
}
.pt-badge-ok { border-color: var(--pt-accent-line); background: var(--pt-accent-soft); }
.pt-badge-warn { border-color: rgba(220,140,90,.55); background: rgba(220,140,90,.18); }
.pt-badge-dim { opacity: .55; }

/* A deadline's urgency, by whole days from today. */
.pt-due-overdue, .pt-due-today { color: rgba(232,96,96,.95); font-weight: 600; }
.pt-due-soon { color: rgba(232,150,72,.95); font-weight: 600; }
.pt-due-week { color: rgba(214,190,86,.95); }
.pt-due-far { opacity: .6; }

/* ---- tasks: two lines each ------------------------------------------- */
/*
 * A task is two lines. The head says what it is — title, course, deadline —
 * and the foot is what you can do to it: a bar that both shows and sets the
 * completion, then edit and delete. The derived state is not spelled out in
 * words: a full bar with a ✓ is done, a red one is late.
 */
.pt-task { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pt-task + .pt-task { margin-top: 3px; }
.pt-task-head {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 6px;
  font-size: 12px; line-height: 1.5; min-width: 0;
}
.pt-task-title { font-weight: 600; }
.pt-task-due { font-variant-numeric: tabular-nums; white-space: nowrap; }
.pt-task-foot { display: flex; align-items: center; gap: 7px; min-width: 0; }
.pt-task-ok { font-size: 11px; color: rgba(90,175,120,.95); flex: none; }
/* The current/total reading: a bar's length only approximates it. The box is
 * fixed (5ch holds 10/10) so a drag can never re-layout the row — the bar
 * would otherwise shrink under the pointer at the 9-to-10 digit — and idle
 * rows align. */
.pt-task-count {
  flex: none; min-width: 5ch; text-align: center;
  font-size: 11px; opacity: .7;
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
/* While a drag is open, the reading is a live figure, not a stored one. */
.pt-task-count-live { opacity: 1; font-weight: 650; color: var(--pt-accent); }

/*
 * The bar is the whole remaining width: it is the one thing on the line that
 * grows, and the wider it is the finer the drag. It is a button, so it takes
 * focus and arrow keys; the thumb on the fill's edge and the grab cursor are
 * what say it can be dragged. Overflow stays visible so the thumb may stand
 * proud of the track at either end.
 */
.pt-task-bar {
  appearance: none; position: relative; flex: 1; min-width: 40px; height: 8px; padding: 0;
  border: 1px solid var(--pt-line); border-radius: 4px;
  background: var(--pt-surface-2); overflow: visible;
  cursor: grab; touch-action: none;
  transition: border-color .12s ease, background .12s ease;
}
.pt-task-bar:hover:not(:disabled), .pt-task-bar:focus-visible { border-color: var(--pt-line-strong); }
.pt-task-bar:active:not(:disabled) { cursor: grabbing; }
.pt-task-bar:disabled { cursor: default; opacity: .6; }
/* Without a target amount there is nothing to drag: it is a checkbox. */
.pt-task-bar-plain { cursor: pointer; }
.pt-task-bar-plain:active:not(:disabled) { cursor: pointer; }

.pt-task-fill {
  display: block; height: 100%; border-radius: 3px;
  background: linear-gradient(90deg, rgba(90,175,120,.8), rgba(130,205,155,.95));
  transition: width .18s ease;
}
.pt-task-fill-late {
  background: linear-gradient(90deg, rgba(220,96,96,.8), rgba(238,132,118,.95));
}
.pt-task-late .pt-task-bar { border-color: rgba(220,96,96,.45); }

/*
 * The draggable handle, centred on the fill's leading edge. Solid on purpose:
 * a translucent idle thumb washes out against the track, worst at either end
 * where it stands half over the empty rail.
 */
.pt-task-thumb {
  position: absolute; top: 50%; width: 12px; height: 12px; border-radius: 50%;
  transform: translate(-50%, -50%);
  border: 1px solid rgba(64,146,98,1); background: var(--pt-accent);
  pointer-events: none;
  transition: transform .12s ease;
}
.pt-task-bar:hover:not(:disabled) .pt-task-thumb,
.pt-task-bar:focus-visible .pt-task-thumb { transform: translate(-50%, -50%) scale(1.1); }
.pt-task-late .pt-task-thumb { border-color: rgba(198,80,80,1); background: rgba(232,96,96,.95); }
/* Mid-drag: no tween on the fill (the thumb must track the pointer exactly)
 * and the thumb grows to say it has the pointer. */
.pt-task-bar-active .pt-task-fill { transition: none; }
.pt-task-bar-active .pt-task-thumb {
  transform: translate(-50%, -50%) scale(1.15);
}

/* ---- the archive: settled business, out of the way -------------------- */
/*
 * Finished items fold into this collapsed section so the live list carries
 * only what still wants attention: for tasks, done and past due; for media,
 * finished or abandoned. Display-only derivation — nothing is stored or moved.
 */
.pt-archive { border-top: 1px dashed var(--pt-line); margin-top: 4px; padding-top: 3px; }
.pt-archive summary {
  cursor: pointer; font-size: 11px; opacity: .65; user-select: none;
  padding: 1px 0 3px;
}
.pt-archive summary:hover { opacity: 1; }
.pt-archive .pt-task, .pt-archive .pt-list-row { opacity: .78; }

/* ---- the board's last row: the plain-text report ---------------------- */
.pt-board-foot { display: flex; align-items: center; gap: 6px; padding: 0 2px; }

/* ---- the statistics panel (main area) -------------------------------- */
.pt-panel-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.pt-panel-head h2 { margin: 0; font-size: 15px; font-weight: 650; }
.pt-panel-head .pt-input { width: auto; }
.pt-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
.pt-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 8px; }
.pt-facts { display: flex; flex-direction: column; gap: 3px; }
.pt-fact { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
.pt-fact > .pt-muted { flex: 1; }
.pt-fact-value { font-variant-numeric: tabular-nums; font-weight: 600; }

.pt-heat { display: flex; flex-direction: column; gap: 3px; overflow-x: auto; }
.pt-heat-row { display: flex; align-items: center; gap: 8px; }
.pt-heat-label { width: 3.6em; flex-shrink: 0; font-size: 11px; opacity: .75; }
.pt-heat-cells { display: flex; gap: 2px; flex: 1; }
.pt-heat-cell { width: 10px; height: 10px; border-radius: 3px; background: var(--pt-surface-2); flex-shrink: 0; }
.pt-heat-on { background: var(--pt-accent); }
.pt-heat-count { width: 4.2em; text-align: right; font-size: 11px; opacity: .7; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.pt-heat-streak { width: 4.6em; text-align: right; font-size: 11px; opacity: .6; font-variant-numeric: tabular-nums; flex-shrink: 0; }

.pt-curve { width: 100%; height: auto; max-height: 220px; }
.pt-curve-axis { stroke: var(--pt-line-strong); stroke-width: 1; }
.pt-curve-line { fill: none; stroke: var(--pt-info-line); stroke-width: 1.5; }
.pt-curve-dot { fill: var(--pt-accent); }
.pt-curve-tick { fill: currentColor; opacity: .5; font-size: 9px; }

/* ---- narrow fallback ------------------------------------------------- */
@media (max-width: 260px) {
  .pt-grid { grid-template-columns: minmax(0,1fr); }
  .pt-span-1, .pt-span-2 { grid-column: 1 / -1; }
}
`

/**
 * Inject the stylesheet, or bring an already-injected one up to date.
 *
 * Presence alone is not enough to conclude "nothing to do": reloading the
 * client half keeps the document, so a stylesheet injected by the previous
 * build would survive and style the new markup with old rules — which reads as
 * a layout bug in the new code. Comparing the text keeps the hot-reload path
 * honest.
 */
export function ensureBoardStyles(): void {
  const existing = document.querySelector('style[data-personal-track]')
  if (existing !== null) {
    if (existing.textContent !== CSS) existing.textContent = CSS
    return
  }
  const style = document.createElement('style')
  style.setAttribute('data-personal-track', '')
  style.textContent = CSS
  document.head.append(style)
}
