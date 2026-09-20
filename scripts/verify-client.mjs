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

const seen = { tabTypes: [], slotRegistrations: [], effects: 0 }

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

assert.equal(seen.effects, 2, 'apply registers two effects (tab type + body)')
assert.equal(appended.length, 1, 'apply injects the stylesheet exactly once')

const [tabType] = seen.tabTypes
assert.ok(tabType, 'a tab type is registered')
assert.equal(tabType.id, 'personal-track-board')
assert.equal(tabType.kind, 'habit-board')
assert.equal(typeof tabType.title, 'function')
assert.equal(tabType.title('/'), '习惯看板')
assert.equal(tabType.guide?.length, 1, 'the board offers one guide entry')
assert.equal(typeof tabType.guide[0].title, 'function')

const [body] = seen.slotRegistrations
assert.ok(body, 'a tab body is registered')
assert.equal(body.spec.name, 'sidebar.right.pane.tab')
assert.equal(body.spec.key, 'personal-track-board')
assert.equal(typeof body.component, 'function', 'the body is a component')

// The board receives its commands through the registration's injection face.
assert.equal(typeof body.spec.inject, 'function', 'the body declares an injection face')
const face = body.spec.inject()
for (const method of [
  'clock', 'state', 'check', 'uncheck', 'setMeal', 'clearMeal', 'setStock', 'wash',
  'addSession', 'patchSession', 'removeSession', 'setVocabTarget', 'setRun', 'clearRun',
]) {
  assert.equal(typeof face.client[method], 'function', `the face exposes ${method}()`)
}

console.log('client bundle ✓  wrapper, exports, tab type, slot body, injection face and styles verified')
