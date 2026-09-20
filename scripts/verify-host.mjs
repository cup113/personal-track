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
const lessonId = lesson.body.day.day.duolingo[0].id

const removed = await api.call('DELETE', `/session?date=${DATE}&kind=vocab&id=${sessionId}`)
assert.equal(removed.body.day.vocab.met, false, 'removing a session takes the cell back')
assert.equal(removed.body.day.progress.done, 4)
console.log('sessions ✓  (append / patch / delete, cells follow the sessions)')

// --- editing recorded times --------------------------------------------------
// A clock time must be resolved inside the *habit* day, so the host decides the
// calendar date: 01:30 on habit day 2026-09-16 is 2026-09-17T01:30 locally.
const clockOf = iso => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
const localDateOf = iso => new Date(iso).toLocaleDateString('en-CA')

const retimedShower = await api.call('PATCH', '/check', { date: DATE, habit: 'shower', time: '07:05' })
assert.equal(retimedShower.status, 200)
assert.equal(clockOf(retimedShower.body.day.day.shower.at), '07:05', 'a shower time can be corrected')

const nightWash = await api.call('PATCH', '/check', { date: DATE, habit: 'wash', index: 0, time: '01:30' })
assert.equal(clockOf(nightWash.body.day.day.washes.times[0]), '01:30')
assert.equal(localDateOf(nightWash.body.day.day.washes.times[0]), '2026-09-17',
  'a night-tail time lands on the next calendar date …')
assert.equal(nightWash.body.day.cells.find(cell => cell.id === 'wash1').done, true,
  '… while still counting inside the habit day')

const retimedMeal = await api.call('PUT', '/meal', { date: DATE, slot: 'lunch', time: '12:20', price: 12.5 })
assert.equal(clockOf(retimedMeal.body.day.day.meals.lunch.at), '12:20', 'a meal time can be corrected')

const retimedLesson = await api.call('PATCH', '/session', {
  date: DATE, kind: 'duolingo', id: lessonId, patch: { time: '21:15' },
})
assert.equal(clockOf(retimedLesson.body.day.day.duolingo[0].at), '21:15', 'a session time can be corrected')

const addedAtTime = await api.call('POST', '/check', { date: DATE, habit: 'wash', time: '22:40' })
assert.equal(clockOf(addedAtTime.body.day.day.washes.times[1]), '22:40', 'a check can be backfilled at a known hour')

const badTime = await api.call('PATCH', '/check', { date: DATE, habit: 'wash', index: 0, time: '25:00' })
assert.equal(badTime.status, 400, 'an impossible clock time is refused')
const noTime = await api.call('PATCH', '/check', { date: DATE, habit: 'wash', index: 0 })
assert.equal(noTime.status, 400, 'a retime without a time is refused')
console.log('time editing ✓  (checks, meals and sessions retimed; night tail stays in the day)')

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

// --- training session kinds (M3) --------------------------------------------
const rope = await api.call('POST', '/session', {
  date: DATE, kind: 'rope', entry: { preset: 90, seconds: 45, avgHr: 130 },
})
assert.equal(rope.status, 200)
assert.equal(rope.body.day.day.rope.length, 1)
assert.equal(rope.body.day.day.rope[0].preset, 90, 'the preset stays a number, not a string')
const rope180 = await api.call('POST', '/session', {
  date: DATE, kind: 'rope', entry: { preset: 180, seconds: 95 },
})
assert.equal(rope180.body.day.day.rope.length, 2, 'several sets a day are allowed')

const pullup = await api.call('POST', '/session', { date: DATE, kind: 'pullup', entry: { seconds: 32 } })
assert.equal(pullup.body.day.day.pullup[0].seconds, 32)

const equipment = await api.call('POST', '/session', {
  date: DATE, kind: 'equipment', entry: { name: '划船机', reps: 30, weight: 40 },
})
assert.equal(equipment.body.day.day.equipment[0].name, '划船机')

const badKind = await api.call('POST', '/session', { date: DATE, kind: 'swimming', entry: {} })
assert.equal(badKind.status, 400, 'an unknown session kind is refused')
assert.equal(badKind.body.error.code, 'habit/bad-request')
console.log('training sessions ✓  (rope presets stay numeric, any number of sets, unknown kinds refused)')

const changedRun = await api.call('PUT', '/run', { date: DATE, minutes: 25, distanceKm: 5 })
assert.equal(changedRun.body.day.day.run.minutes, 25, 'an explicit duration wins over the default')
const clearedRun = await api.call('DELETE', `/run?date=${DATE}`)
assert.equal(clearedRun.body.day.day.run, null, 'the running entry can be cleared')
console.log('running edit ✓  (explicit duration, then cleared)')

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
assert.equal(reloaded.body.day.day.washes.times.length, 2, 'checks survive a restart')
assert.equal(clockOf(reloaded.body.day.day.washes.times[0]), '01:30', 'including an edited night-tail time')
assert.deepEqual(reloaded.body.day.target, { new: 10, review: 5 })
assert.equal(reloaded.body.stock.pending, 2, 'the laundry stock survives a restart')
assert.equal(reloaded.body.tasks.length, 1)
await restarted.stop()
console.log('restart ✓  (everything re-read from the medium)')

await rm(ROOT, { recursive: true, force: true })
console.log('\nhost half ✓  full API round-trip against real storage')
