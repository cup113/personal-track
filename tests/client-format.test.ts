/**
 * Client-side pure helpers: the date arithmetic and form defaults the board
 * computes before the host ever sees a value.
 *
 * Runs on Node's native type stripping, like the data-layer tests:
 *   node tests/client-format.test.ts
 *
 * Only modules free of JSX and of the DOM are imported here, so the browser
 * half's pure logic can be tested without a browser.
 */
import { strict as assert } from 'node:assert'
import {
  clockTimeOf,
  daysBetweenKeys,
  dueLevelOf,
  fractionText,
  shiftKey,
  TIME_FIELD,
  timeField,
  weekEndKey,
} from '../src/client/board/format.ts'

let passed = 0

/** Run one labelled case. */
function check(label: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ✓ ${label}`)
}

console.log('habit-day key arithmetic (client mirror)')
check('shifting crosses a month boundary', () => {
  assert.equal(shiftKey('2026-09-30', 4), '2026-10-04')
  assert.equal(shiftKey('2026-10-01', -1), '2026-09-30')
})

console.log('the end of the week (Monday-first, as the ranges are)')
check('every weekday resolves to the Sunday of its own week', () => {
  // 2026-09-14 is a Monday and 2026-09-20 the Sunday that closes that week.
  assert.equal(weekEndKey('2026-09-14'), '2026-09-20', 'Monday reaches the coming Sunday')
  assert.equal(weekEndKey('2026-09-16'), '2026-09-20', 'midweek')
  assert.equal(weekEndKey('2026-09-19'), '2026-09-20', 'Saturday')
  assert.equal(weekEndKey('2026-09-20'), '2026-09-20', 'Sunday is its own week end')
  assert.equal(weekEndKey('2026-09-21'), '2026-09-27', 'the next Monday starts a new week')
})
check('the week end can fall in the next month', () => {
  assert.equal(weekEndKey('2026-09-30'), '2026-10-04', 'a Wednesday in September ends in October')
})

console.log('new-entry time defaults')
check('the current clock time is a well-formed HH:mm', () => {
  assert.match(clockTimeOf(), /^([01]\d|2[0-3]):[0-5]\d$/)
})
check('the time field carries the current clock time as its default', () => {
  const field = timeField()
  assert.equal(field.name, 'time')
  assert.equal(field.kind, 'time')
  assert.match(String(field.defaultValue), /^([01]\d|2[0-3]):[0-5]\d$/)
  assert.equal(field.optional, undefined, 'time stays required, now that it arrives filled in')
})
check('the shared constant stays empty, so no default is frozen at import', () => {
  assert.equal(Object.hasOwn(TIME_FIELD, 'defaultValue'), false)
  assert.match(String(timeField().defaultValue), /^([01]\d|2[0-3]):[0-5]\d$/)
})

console.log('deadline proximity (the board colours it)')
check('day differences count whole days either way', () => {
  assert.equal(daysBetweenKeys('2026-09-16', '2026-09-16'), 0)
  assert.equal(daysBetweenKeys('2026-09-16', '2026-09-19'), 3)
  assert.equal(daysBetweenKeys('2026-09-16', '2026-09-15'), -1)
  assert.equal(daysBetweenKeys('2026-09-30', '2026-10-02'), 2, 'across a month boundary')
})
check('the bands are today, three days, a week, then beyond', () => {
  const today = '2026-09-16'
  assert.equal(dueLevelOf('2026-09-15', today), 'overdue', 'yesterday')
  assert.equal(dueLevelOf('2026-09-16', today), 'today')
  assert.equal(dueLevelOf('2026-09-17', today), 'soon')
  assert.equal(dueLevelOf('2026-09-19', today), 'soon', 'three days out is still soon')
  assert.equal(dueLevelOf('2026-09-20', today), 'week', 'four days out moves to a week')
  assert.equal(dueLevelOf('2026-09-23', today), 'week', 'seven days out is the edge')
  assert.equal(dueLevelOf('2026-09-24', today), 'far', 'eight days out is unremarkable')
})
check('a fractional count keeps one decimal and drops a trailing .0', () => {
  assert.equal(fractionText(5), '5')
  assert.equal(fractionText(5.25), '5.3', 'rounded to one decimal, not truncated')
  assert.equal(fractionText(4.0), '4')
  assert.equal(fractionText(0.5), '0.5')
})

console.log(`\n${passed} checks passed`)
