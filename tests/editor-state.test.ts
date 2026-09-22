/**
 * The board's editor and import state machines.
 *
 * These were hand-rolled per component: the `idle | add | edit` union declared
 * twice, plus a four-`useState` dance in the data card whose combinations
 * admitted states that cannot happen. The transitions are pure, so they are
 * asserted here rather than through a rendered component — which is the only
 * way they get asserted at all, since the repo has no DOM test harness.
 *
 * Runs on Node's native type stripping:
 *   node tests/editor-state.test.ts
 */
import { strict as assert } from 'node:assert'
import { createChecker } from './support.ts'
import {
  IDLE,
  IMPORT_IDLE,
  editor,
  editingId,
  importer,
  isAdding,
  isBusy,
  isEditing,
  stagedFile,
} from '../src/client/board/editor-state.ts'

const checker = createChecker('editor and import state machines')
const { check, report } = checker

const IDS = ['a', 'b']

// --- one editor --------------------------------------------------------------

check('a fresh editor is closed', () => {
  assert.deepEqual(IDLE, { kind: 'idle' })
  assert.equal(isAdding(IDLE), false)
  assert.equal(isEditing(IDLE, 'a'), false)
  assert.equal(editingId(IDLE), null)
})

check('opening the add form is its own state, not an edit of nothing', () => {
  const state = editor(IDLE, { kind: 'open-add' }, IDS)
  assert.equal(isAdding(state), true)
  assert.equal(isEditing(state, 'a'), false, 'the add form is not any row\'s editor')
  assert.equal(editingId(state), null, 'and `isEditing` must not mistake it for one')
})

check('editing a listed row opens that row', () => {
  const state = editor(IDLE, { kind: 'edit', id: 'b' }, IDS)
  assert.equal(isEditing(state, 'b'), true)
  assert.equal(isEditing(state, 'a'), false)
  assert.equal(editingId(state), 'b')
})

check('editing a row that is gone closes the editor instead of opening a dead one', () => {
  // Reachable: a registry list refreshes from the host after every write, so a
  // row can disappear between the click and the state update.
  assert.deepEqual(editor(IDLE, { kind: 'edit', id: 'gone' }, IDS), IDLE)
  assert.deepEqual(editor({ kind: 'add' }, { kind: 'edit', id: 'gone' }, IDS), IDLE)
})

check('saving or cancelling returns to closed from either open state', () => {
  for (const state of [{ kind: 'add' }, { kind: 'edit', id: 'a' }] as const) {
    assert.deepEqual(editor(state, { kind: 'close' }, IDS), IDLE)
  }
})

check('closing an already closed editor is harmless', () => {
  assert.deepEqual(editor(IDLE, { kind: 'close' }, IDS), IDLE)
})

check('one action moves straight from add to a row and back', () => {
  const adding = editor(IDLE, { kind: 'open-add' }, IDS)
  const editing = editor(adding, { kind: 'edit', id: 'a' }, IDS)
  assert.deepEqual(editing, { kind: 'edit', id: 'a' }, 'opening a row replaces the add form')
  assert.deepEqual(editor(editing, { kind: 'open-add' }, IDS), { kind: 'add' })
})

check('omitting the id list skips the existence check entirely', () => {
  assert.deepEqual(editor(IDLE, { kind: 'edit', id: 'x' }), { kind: 'edit', id: 'x' })
})

check('an empty list is not the same as no list: nothing can be edited', () => {
  assert.deepEqual(editor(IDLE, { kind: 'edit', id: 'x' }, []), IDLE)
})

// --- the data card -----------------------------------------------------------

check('a fresh data card has nothing staged and is not busy', () => {
  assert.deepEqual(IMPORT_IDLE, { kind: 'idle' })
  assert.equal(stagedFile(IMPORT_IDLE), null)
  assert.equal(isBusy(IMPORT_IDLE), false)
})

check('picking a file goes through a staging state', () => {
  const staging = importer(IMPORT_IDLE, { kind: 'pick' })
  assert.equal(staging.kind, 'staging')
  assert.equal(isBusy(staging), true, 'the card reports itself busy while reading')
  assert.equal(stagedFile(staging), null, 'but nothing is staged until it parses')
})

check('a parsed file is staged and no longer busy', () => {
  const file = { name: 'backup.json', bundle: { days: [] } }
  const staged = importer({ kind: 'staging' }, { kind: 'picked', file })
  assert.equal(staged.kind, 'staged')
  assert.deepEqual(stagedFile(staged), file)
  assert.equal(isBusy(staged), false, 'waiting for a mode choice is not busy')
})

check('a file that cannot be read leaves nothing staged', () => {
  assert.deepEqual(importer({ kind: 'staging' }, { kind: 'pick-failed' }), IMPORT_IDLE)
})

check('applying keeps the file staged while the write is in flight', () => {
  const file = { name: 'backup.json', bundle: {} }
  const importing = importer({ kind: 'staged', file }, { kind: 'apply' })
  assert.equal(importing.kind, 'importing')
  assert.deepEqual(stagedFile(importing), file, 'the file is still known during the write')
  assert.equal(isBusy(importing), true)
})

check('applying from a state with nothing staged does nothing', () => {
  for (const state of [IMPORT_IDLE, { kind: 'staging' }] as const) {
    assert.deepEqual(importer(state, { kind: 'apply' }), state)
  }
})

check('a successful import resets the card', () => {
  const file = { name: 'backup.json', bundle: {} }
  assert.deepEqual(importer({ kind: 'importing', file }, { kind: 'imported' }), IMPORT_IDLE)
})

check('a failed import keeps the file, so the attempt is retryable', () => {
  const file = { name: 'backup.json', bundle: {} }
  const after = importer({ kind: 'importing', file }, { kind: 'import-failed' })
  assert.equal(after.kind, 'staged', 'back to staged rather than idle')
  assert.deepEqual(stagedFile(after), file, 'the file is not thrown away by a failure')
})

check('cancelling drops a staged file from any staged state', () => {
  const file = { name: 'backup.json', bundle: {} }
  for (const state of [{ kind: 'staging' }, { kind: 'staged', file }, { kind: 'importing', file }] as const) {
    assert.deepEqual(importer(state, { kind: 'cancel' }), IMPORT_IDLE)
  }
})

check('a failure while nothing is importing changes nothing', () => {
  // The reducer never invents a staged file out of a stray failure.
  assert.deepEqual(importer(IMPORT_IDLE, { kind: 'import-failed' }), IMPORT_IDLE)
  const staged = { kind: 'staged', file: { name: 'x', bundle: {} } } as const
  assert.deepEqual(importer(staged, { kind: 'import-failed' }), staged)
})

report()
