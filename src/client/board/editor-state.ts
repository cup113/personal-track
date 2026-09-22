/**
 * Which editor is open, and what a data import is doing.
 *
 * These are the two state machines the board re-rolled by hand: `registry.tsx`
 * and `session-cards.tsx` each declared the same `idle | add | edit` union and
 * their own transitions, and `data.tsx` tracked a staged file with four
 * separate `useState` calls whose combinations included states that cannot
 * happen. Pulling the transitions out makes them testable without a DOM, and
 * expressing the import as one value makes its illegal states unrepresentable.
 *
 * Pure and framework-free: no JSX, no DOM, no API types.
 */

/** Which editor is open for one list or card. */
export type EditorState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'add' }
  | { readonly kind: 'edit'; readonly id: string }

/** What happened to that editor. */
export type EditorAction =
  /** The `＋` was pressed. */
  | { readonly kind: 'open-add' }
  /** A row's `✎` was pressed. */
  | { readonly kind: 'edit'; readonly id: string }
  /** Saved, cancelled, or the editor was dismissed. */
  | { readonly kind: 'close' }

/** Nothing open. */
export const IDLE: EditorState = { kind: 'idle' }

/**
 * One transition, for the shared shape of every editor on the board.
 *
 * @param state - the current editor.
 * @param action - what happened.
 * @param ids - the ids currently listed. Omit it when the caller has no list to
 *   check against; an empty array means "the list is empty", so an edit of any
 *   id then closes the editor. The distinction matters — an empty default would
 *   quietly reject every edit.
 * @returns the next editor state.
 */
export function editor(
  state: EditorState,
  action: EditorAction,
  ids?: readonly string[],
): EditorState {
  switch (action.kind) {
    case 'open-add':
      return { kind: 'add' }
    case 'edit':
      return ids === undefined || ids.includes(action.id) ? { kind: 'edit', id: action.id } : IDLE
    case 'close':
      return IDLE
  }
}

/** Whether the add form should be showing. */
export function isAdding(state: EditorState): boolean {
  return state.kind === 'add'
}

/** Whether `id`'s row is currently the open editor. */
export function isEditing(state: EditorState, id: string): boolean {
  return state.kind === 'edit' && state.id === id
}

/** The id of the open editor, or `null` when the add form or nothing is open. */
export function editingId(state: EditorState): string | null {
  return state.kind === 'edit' ? state.id : null
}

/** A file picked but not yet applied. */
export interface StagedFile {
  readonly name: string
  readonly bundle: unknown
}

/**
 * What the data card is doing.
 *
 * `error` deliberately does not appear here: a failure is reported *alongside*
 * whatever is staged, because the next attempt must still have the file. The
 * earlier shape tracked `staged`, `busy`, `note` and `error` separately, which
 * made "staged and failed at once" representable and rendered it as an error
 * line *instead of* the staged row, losing the file the user had just picked.
 */
export type ImportState =
  | { readonly kind: 'idle' }
  /** A file is being read and validated. */
  | { readonly kind: 'staging' }
  | { readonly kind: 'staged'; readonly file: StagedFile }
  /** A staged file is being written to the domain. */
  | { readonly kind: 'importing'; readonly file: StagedFile }

/** What happened to an import. */
export type ImportAction =
  /** The file picker returned a file. */
  | { readonly kind: 'pick' }
  /** Reading the file failed; nothing is staged. */
  | { readonly kind: 'pick-failed' }
  /** The file parsed; it is now staged for a mode choice. */
  | { readonly kind: 'picked'; readonly file: StagedFile }
  /** A staged file is being written to the domain. */
  | { readonly kind: 'apply' }
  /** A staged file was applied successfully; the card resets. */
  | { readonly kind: 'imported' }
  /** An apply failed; the file stays staged so it can be retried. */
  | { readonly kind: 'import-failed' }
  /** The user dismissed the staged file. */
  | { readonly kind: 'cancel' }

/** Nothing picked. */
export const IMPORT_IDLE: ImportState = { kind: 'idle' }

/**
 * One transition of the data card.
 *
 * @param state - the current import state.
 * @param action - what happened.
 * @returns the next import state.
 */
export function importer(state: ImportState, action: ImportAction): ImportState {
  switch (action.kind) {
    case 'pick':
      return { kind: 'staging' }
    case 'pick-failed':
      return IMPORT_IDLE
    case 'picked':
      return { kind: 'staged', file: action.file }
    case 'apply':
      return state.kind === 'staged' ? { kind: 'importing', file: state.file } : state
    case 'imported':
      return IMPORT_IDLE
    case 'import-failed':
      // Keep the file: a failed import must be retryable without re-picking.
      return state.kind === 'importing' ? { kind: 'staged', file: state.file } : state
    case 'cancel':
      return IMPORT_IDLE
  }
}

/** The staged file, whatever stage it is in, or `null` when there is none. */
export function stagedFile(state: ImportState): StagedFile | null {
  return state.kind === 'staged' || state.kind === 'importing' ? state.file : null
}

/** Whether a read or a write is in flight. */
export function isBusy(state: ImportState): boolean {
  return state.kind === 'staging' || state.kind === 'importing'
}
