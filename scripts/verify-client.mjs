/**
 * Verify the built browser half the way the Web shell loads it.
 *
 * Loads `lib/client.js`, plays the module-loader facade, materializes the
 * closure factory with the frozen platform `require` table, then drives the
 * exported `apply` against a recording context. This proves the bundle's
 * contract — wrapper, exports, tab type, slot body, injection face, style
 * injection — without a browser; React's actual mounting is the GUI's job.
 */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const code = readFileSync('lib/client.js', 'utf8')

/** What the facade captured. */
let loaded
globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      loaded = spec
    },
  },
}

/** The bare minimum DOM the board's style injection touches. */
const appended = []
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ setAttribute() {}, textContent: '' }),
  head: {
    append(node) {
      appended.push(node)
    },
  },
}

// The bundle is a script, exactly as the shell runs it.
new Function(code)()

assert.ok(loaded, 'the bundle must call window.__ModuleLoader__.load')
assert.equal(loaded.id, 'personal-track', 'browser module id must be the package name')
assert.equal(typeof loaded.factory, 'function', 'the facade receives a factory')

const exports_ = loaded.factory(require)

assert.equal(typeof exports_.apply, 'function', 'the client half exports apply')
assert.deepEqual(exports_.inject, ['slots', 'sidebarRightTabs'], 'client half injects the two services it uses')

const seen = { tabTypes: [], slotRegistrations: [], effects: 0, selectedPanels: [] }

const ctx = {
  effect(fn) {
    seen.effects += 1
    return fn() ?? (() => {})
  },
  sidebarRightTabs: {
    register(definition) {
      seen.tabTypes.push(definition)
      return () => {}
    },
  },
  layout: {
    selectPanel(id) {
      seen.selectedPanels.push(id)
    },
  },
  slots: {
    inject(_name, callback) {
      callback()
      return () => {}
    },
    register(spec, component) {
      seen.slotRegistrations.push({ spec, component })
      return () => {}
    },
  },
}

exports_.apply(ctx)

assert.equal(seen.effects, 4, 'apply registers four effects (tab type, board, stats panel, sidebar entry)')
assert.equal(appended.length, 1, 'apply injects the stylesheet exactly once')

const [tabType] = seen.tabTypes
assert.ok(tabType, 'a tab type is registered')
assert.equal(tabType.id, 'personal-track-board')
assert.equal(tabType.kind, 'habit-board')
assert.equal(typeof tabType.title, 'function')
assert.equal(tabType.title('/'), '习惯看板')
assert.equal(tabType.guide?.length, 1, 'the board offers one guide entry')
assert.equal(typeof tabType.guide[0].title, 'function')

const registrationFor = name => seen.slotRegistrations.find(entry => entry.spec.name === name)

const body = registrationFor('sidebar.right.pane.tab')
assert.ok(body, 'a tab body is registered')
assert.equal(body.spec.key, 'personal-track-board')
assert.equal(typeof body.component, 'function', 'the body is a component')

// The board receives its commands through the registration's injection face.
assert.equal(typeof body.spec.inject, 'function', 'the body declares an injection face')
const face = body.spec.inject()
for (const method of [
  'clock', 'state', 'check', 'uncheck', 'editCheck', 'setMeal', 'clearMeal', 'setStock', 'wash',
  'addSession', 'patchSession', 'removeSession', 'setVocabTarget', 'setRun', 'clearRun',
  'addMedia', 'patchMedia', 'removeMedia', 'addTask', 'patchTask', 'removeTask', 'stats',
]) {
  assert.equal(typeof face.client[method], 'function', `the face exposes ${method}()`)
}

// …and a way out of the sidebar, into the statistics page.
assert.equal(typeof face.openStats, 'function', 'the face exposes openStats()')
face.openStats()
assert.deepEqual(seen.selectedPanels, ['personal-track-stats'], 'openStats selects the stats panel')

const main = registrationFor('main')
assert.ok(main, 'a main-area panel is registered')
assert.equal(main.spec.key, 'personal-track-stats')
assert.equal(typeof main.component, 'function', 'the stats panel is a component')

const panellist = registrationFor('sidebar.panellist')
assert.ok(panellist, 'a sidebar panel entry is registered')
assert.equal(panellist.spec.id, 'personal-track-stats')
assert.equal(panellist.spec.label(), '习惯统计')
assert.equal(typeof panellist.component, 'function', 'the sidebar entry has an icon component')

console.log('client bundle ✓  wrapper, exports, tab type, slot body, injection face and styles verified')
