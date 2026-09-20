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
.pt-board {
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
  display: flex; flex-direction: column; gap: 9px;
  padding: 10px 10px 26px;
  font-size: 13px; line-height: 1.45;
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
.pt-small { padding: 2px 7px; font-size: 11px; }

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
.pt-dots { display: flex; flex-wrap: wrap; gap: 4px; }
.pt-dot { width: 9px; height: 9px; border-radius: 50%; border: 1px solid var(--pt-line-strong); transition: background .12s ease; }
.pt-dot-on { background: var(--pt-accent); border-color: var(--pt-accent); }

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

/* ---- meal cells ------------------------------------------------------ */
.pt-cells { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 6px; }
.pt-cell {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 7px 4px; border: 1px solid var(--pt-line); border-radius: 9px;
  transition: background .12s ease, border-color .12s ease;
}
.pt-cell-done { border-color: var(--pt-accent-line); background: var(--pt-accent-soft); }
.pt-cell-label { font-size: 11px; opacity: .7; }
.pt-cell-value { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
.pt-cell-sub { font-size: 11px; opacity: .6; min-height: 14px; }
.pt-cell-actions { display: flex; gap: 3px; margin-top: 2px; min-height: 22px; align-items: center; }

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

/* ---- narrow fallback ------------------------------------------------- */
@media (max-width: 260px) {
  .pt-grid { grid-template-columns: minmax(0,1fr); }
  .pt-span-1, .pt-span-2 { grid-column: 1 / -1; }
  .pt-cells { grid-template-columns: minmax(0,1fr); }
}
`

/** Inject the stylesheet once. */
export function ensureBoardStyles(): void {
  if (document.querySelector('style[data-personal-track]') !== null) return
  const style = document.createElement('style')
  style.setAttribute('data-personal-track', '')
  style.textContent = CSS
  document.head.append(style)
}
