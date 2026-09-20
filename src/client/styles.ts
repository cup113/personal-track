/**
 * The board's stylesheet.
 *
 * Hand-written CSS injected once into the document under a data attribute,
 * with every class prefixed `pt-`. Surfaces and borders are translucent greys
 * so the board inherits whatever theme the shell is using instead of hard-coding
 * colours of its own.
 */

/** The stylesheet text. */
const CSS = `
.pt-board { display: flex; flex-direction: column; gap: 10px; padding: 10px 10px 28px; font-size: 13px; line-height: 1.5; }
.pt-muted { opacity: .62; }
.pt-error { border: 1px solid rgba(220,90,90,.5); background: rgba(220,90,90,.12); border-radius: 8px; padding: 6px 8px; font-size: 12px; }
.pt-nav { display: flex; align-items: center; gap: 6px; }
.pt-nav-label { flex: 1; font-weight: 600; }
.pt-nav-label small { font-weight: 400; }
.pt-btn { appearance: none; border: 1px solid rgba(127,127,127,.34); background: rgba(127,127,127,.10); color: inherit; border-radius: 7px; padding: 3px 8px; font: inherit; font-size: 12px; cursor: pointer; }
.pt-btn:hover:not(:disabled) { background: rgba(127,127,127,.2); }
.pt-btn:disabled { opacity: .4; cursor: default; }
.pt-btn-primary { border-color: rgba(90,150,220,.55); background: rgba(90,150,220,.18); }
.pt-btn-icon { padding: 2px 7px; }
.pt-dots { display: flex; align-items: center; gap: 3px; }
.pt-dot { width: 9px; height: 9px; border-radius: 50%; border: 1px solid rgba(127,127,127,.5); }
.pt-dot-on { background: rgba(90,180,120,.95); border-color: rgba(90,180,120,.95); }
.pt-chip { display: flex; align-items: center; gap: 8px; }
.pt-chip-count { font-variant-numeric: tabular-nums; font-weight: 600; }
.pt-section { display: flex; flex-direction: column; gap: 6px; }
.pt-section-title { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; opacity: .55; }
.pt-card { border: 1px solid rgba(127,127,127,.26); border-radius: 9px; background: rgba(127,127,127,.06); overflow: hidden; }
.pt-row { display: flex; align-items: center; gap: 6px; padding: 7px 9px; }
.pt-row + .pt-row { border-top: 1px solid rgba(127,127,127,.18); }
.pt-row-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-times { display: flex; flex-wrap: wrap; gap: 4px; }
.pt-time { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-variant-numeric: tabular-nums; border: 1px solid rgba(127,127,127,.3); border-radius: 6px; padding: 1px 4px; }
.pt-time button { appearance: none; border: 0; background: none; color: inherit; opacity: .6; cursor: pointer; font: inherit; line-height: 1; padding: 0; }
.pt-time button:hover { opacity: 1; }
.pt-stepper { display: inline-flex; align-items: center; gap: 4px; }
.pt-count { font-variant-numeric: tabular-nums; font-weight: 600; min-width: 1.4em; text-align: center; }
.pt-input { width: 4.5em; border: 1px solid rgba(127,127,127,.4); background: rgba(127,127,127,.08); color: inherit; border-radius: 6px; padding: 2px 5px; font: inherit; font-size: 12px; }
.pt-inline-form { display: flex; align-items: center; gap: 5px; padding: 7px 9px; border-top: 1px solid rgba(127,127,127,.18); }
.pt-grow { flex: 1; }
.pt-form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px; padding: 7px 9px; border-top: 1px solid rgba(127,127,127,.18); }
.pt-field { display: flex; flex-direction: column; gap: 2px; font-size: 11px; }
.pt-form-actions { display: flex; gap: 5px; }
.pt-bar { height: 4px; margin: 0 9px 7px; border-radius: 3px; background: rgba(127,127,127,.22); overflow: hidden; }
.pt-bar-fill { height: 100%; background: rgba(90,180,120,.9); transition: width .15s ease; }
.pt-entry { background: rgba(127,127,127,.05); }
`

/** Inject the stylesheet once. */
export function ensureBoardStyles(): void {
  if (document.querySelector('style[data-personal-track]') !== null) return
  const style = document.createElement('style')
  style.setAttribute('data-personal-track', '')
  style.textContent = CSS
  document.head.append(style)
}
