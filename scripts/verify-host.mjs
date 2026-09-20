/**
 * End-to-end host verification against the real framework services.
 *
 * Mounts the actual storage hub, the JSON backend, the domain facility, the
 * web server, and the built plugin on a real Cordis context, then drives the
 * plugin's own HTTP API and inspects what actually landed on disk. A second
 * mount over the same root proves the data survives a restart.
 *
 * The storage root lives inside the workspace (`.tmp/`) because the file
 * sandbox grants no writes to the platform temp directory.
 */
import { strict as assert } from 'node:assert'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as storageJson from '@deepseek-ai/dsh-storage-json'
import * as storageDomain from '@deepseek-ai/dsh-storage-domain'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as plugin from '../lib/index.js'

const ROOT = join('.tmp', 'verify-host')
const DATE = '2026-09-16'

await rm(ROOT, { recursive: true, force: true })
await mkdir(ROOT, { recursive: true })

/** Mount the whole stack; returns a request helper plus a teardown. */
async function mount() {
  const ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(storageJson, { root: ROOT })
  await ctx.plugin(storageDomain, { backend: 'json' })
  const server = await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  const app = await ctx.plugin(plugin, { dayStartHour: 4 })

  const deadline = Date.now() + 5000
  while (!ctx.webServer?.port) {
    assert.ok(Date.now() < deadline, 'the web server never reported a listening port')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  const base = `http://127.0.0.1:${ctx.webServer.port}/habit/api`

  return {
    async call(method, path, body) {
      const response = await fetch(`${base}${path}`, {
        method,
        ...(body === undefined ? {} : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      })
      return { status: response.status, body: await response.json() }
    },
    async stop() {
      await app.dispose()
      await server.dispose()
    },
  }
}

const api = await mount()

// --- clock + an untouched day -------------------------------------------------
const clock = await api.call('GET', '/clock')
assert.equal(clock.status, 200)
assert.match(clock.body.today, /^\d{4}-\d{2}-\d{2}$/)
assert.equal(typeof clock.body.nightTail, 'boolean')
assert.equal(clock.body.config.dayStartHour, 4)

const empty = await api.call('GET', `/state?date=${DATE}`)
assert.equal(empty.status, 200)
assert.equal(empty.body.day.day, null, 'an untouched day has no document')
assert.deepEqual(empty.body.day.target, { new: 20, review: 60 }, 'the config default is inherited')
assert.deepEqual(empty.body.day.progress, { done: 0, total: 8 })
assert.equal(empty.body.stock.pending, 0)
console.log('clock + untouched day ✓  (no document, config default target, 0/8)')

// --- vocabulary target snapshot ----------------------------------------------
const targeted = await api.call('PUT', '/vocab-target', { date: DATE, new: 10, review: 5 })
assert.equal(targeted.status, 200)
assert.deepEqual(targeted.body.day.target, { new: 10, review: 5 })

// --- checks (counted, capped, individually removable) -------------------------
await api.call('POST', '/check', { date: DATE, habit: 'wash' })
const two = await api.call('POST', '/check', { date: DATE, habit: 'wash' })
assert.equal(two.body.day.day.washes.times.length, 2)
const third = await api.call('POST', '/check', { date: DATE, habit: 'wash' })
assert.equal(third.status, 409, 'a third wash in one day is refused')
assert.equal(third.body.error.code, 'habit/check-limit')
const undone = await api.call('DELETE', `/check?date=${DATE}&habit=wash`)
assert.equal(undone.body.day.day.washes.times.length, 1)
await api.call('POST', '/check', { date: DATE, habit: 'shower' })
console.log('checks ✓  (counted, capped at two, removable, shower toggles on)')

// --- meal slot ----------------------------------------------------------------
const meal = await api.call('PUT', '/meal', { date: DATE, slot: 'lunch', price: 12.5 })
assert.equal(meal.body.day.day.meals.lunch.price, 12.5)
assert.equal(typeof meal.body.day.day.meals.lunch.at, 'string', 'the server stamps the time')
console.log('meal slot ✓  (server-stamped time + price)')

// --- sessions and derived cells ----------------------------------------------
const vocab = await api.call('POST', '/session', {
  date: DATE,
  kind: 'vocab',
  entry: { new: 10, review: 5, minutes: 30 },
})
assert.equal(vocab.status, 200)
assert.equal(vocab.body.day.vocab.met, true, 'the sessions satisfy the target')
assert.equal(vocab.body.day.vocab.minutes, 30)
const sessionId = vocab.body.day.day.vocab.sessions[0].id
assert.ok(sessionId, 'a session carries a stable id')

const patched = await api.call('PATCH', '/session', {
  date: DATE,
  kind: 'vocab',
  id: sessionId,
  patch: { minutes: 45 },
})
assert.equal(patched.body.day.vocab.minutes, 45, 'editing a session recomputes progress')

const lesson = await api.call('POST', '/session', { date: DATE, kind: 'duolingo', entry: { minutes: 12 } })
assert.equal(lesson.body.day.cells.find(cell => cell.id === 'duolingo').done, true)
assert.equal(lesson.body.day.progress.done, 5, 'wash + shower + lunch + vocab + duolingo')

const removed = await api.call('DELETE', `/session?date=${DATE}&kind=vocab&id=${sessionId}`)
assert.equal(removed.body.day.vocab.met, false, 'removing a session takes the cell back')
assert.equal(removed.body.day.progress.done, 4)
console.log('sessions ✓  (append / patch / delete, cells follow the sessions)')

// --- running (single-valued, default duration) -------------------------------
const run = await api.call('PUT', '/run', { date: DATE, distanceKm: 5, avgHr: 150 })
assert.equal(run.body.day.day.run.minutes, 30, 'the duration defaults from config')
assert.equal(run.body.day.day.run.distanceKm, 5)
console.log('running ✓  (one per day, duration defaulted)')

// --- laundry: stock correction vs a wash event -------------------------------
const stock = await api.call('PATCH', '/laundry/stock', { pending: 5 })
assert.equal(stock.body.stock.pending, 5)
const washed = await api.call('POST', '/laundry/wash', { date: DATE, pieces: 3 })
assert.equal(washed.body.stock.pending, 2, 'the wash decrements the stock')
assert.equal(washed.body.day.day.washing.length, 1, 'and leaves a washing session behind')
assert.equal(washed.body.day.day.washing[0].pieces, 3)
console.log('laundry ✓  (correction leaves no event; a wash decrements and records)')

// --- tasks (progress) and media (hard delete) --------------------------------
const task = await api.call('POST', '/tasks', { title: '线代作业', category: '数学', due: '2026-09-20' })
const taskId = task.body.entry.id
assert.equal(task.body.entry.progress.current, 0)
const progressed = await api.call('PATCH', '/tasks', { id: taskId, patch: { progress: { current: 3, total: 5 } } })
assert.equal(progressed.body.entry.progress.total, 5)

const book = await api.call('POST', '/media', { kind: 'book', title: '设计数据密集型应用' })
const bookId = book.body.entry.id
assert.equal(book.body.entry.status, 'active')
const dropped = await api.call('DELETE', `/media?id=${bookId}`)
assert.equal(dropped.body.removed, true, 'media delete is a hard delete')
assert.equal(dropped.body.media.length, 0)
console.log('tasks + media ✓  (progress, and a hard delete with no residue)')

// --- failure shapes ----------------------------------------------------------
const unknown = await api.call('GET', '/nope')
assert.equal(unknown.status, 404)
assert.equal(unknown.body.error.code, 'habit/unknown-route')
const badBody = await api.call('PUT', '/meal', { date: DATE, slot: 'brunch' })
assert.equal(badBody.status, 400)
assert.equal(badBody.body.error.code, 'habit/bad-request')
console.log('failures ✓  (uniform { error: { code, message } })')

// --- carry-forward of the target ---------------------------------------------
const next = await api.call('GET', '/state?date=2026-09-17')
assert.deepEqual(next.body.day.target, { new: 10, review: 5 }, 'a new day inherits the last snapshot')
assert.equal(next.body.day.day, null, 'inheriting does not create a document')
console.log('carry-forward ✓  (inherited target, still no document)')

// --- on-disk shape -----------------------------------------------------------
const dayFile = join(ROOT, 'habit', 'days', `${DATE}.json`)
const stored = JSON.parse(await readFile(dayFile, 'utf8'))
assert.equal(stored.version, 1)
assert.equal(stored.record.date, DATE)
assert.equal(stored.record.washing.length, 1)
let untouchedExists = true
try {
  await readFile(join(ROOT, 'habit', 'days', '2026-09-17.json'), 'utf8')
} catch {
  untouchedExists = false
}
assert.equal(untouchedExists, false, 'an inherited day stays out of the medium')
console.log(`on disk ✓  (habit/days/${DATE}.json is one readable versioned record)`)

// --- restart: re-open the same root -----------------------------------------
await api.stop()
const restarted = await mount()
const reloaded = await restarted.call('GET', `/state?date=${DATE}`)
assert.equal(reloaded.body.day.day.washes.times.length, 1, 'checks survive a restart')
assert.deepEqual(reloaded.body.day.target, { new: 10, review: 5 })
assert.equal(reloaded.body.stock.pending, 2, 'the laundry stock survives a restart')
assert.equal(reloaded.body.tasks.length, 1)
await restarted.stop()
console.log('restart ✓  (everything re-read from the medium)')

await rm(ROOT, { recursive: true, force: true })
console.log('\nhost half ✓  full API round-trip against real storage')
