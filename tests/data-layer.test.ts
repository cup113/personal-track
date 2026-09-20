/**
 * Data-layer tests: habit-day arithmetic and every derived value.
 *
 * Runs on Node's native type stripping — no bundler, no test runner:
 *   node tests/data-layer.test.ts
 *
 * (vitest/vite transform TypeScript through esbuild's JS API, whose piped child
 *  spawn the file sandbox rejects; Node 24 strips types in-process instead.)
 */
import { strict as assert } from 'node:assert'
import {
  assertDayKey,
  compareDayKeys,
  dayKeyRange,
  habitDayKey,
  isNightTail,
  shiftDayKey,
} from '../src/host/daykey.ts'
import {
  CELL_TOTAL,
  cellProgress,
  dayCells,
  duolingoMet,
  formatPace,
  isOverdue,
  isPerfectDay,
  paceMinPerKm,
  streakFor,
  taskState,
  vocabProgress,
} from '../src/host/derive.ts'
import { dayRecord, taskRecord, type DayRecord, type TaskRecord } from '../src/host/domain.ts'

let passed = 0

/** Run one labelled case. */
function check(label: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ✓ ${label}`)
}

/** Parse a partial day so schema defaults apply (also tests those defaults). */
function day(partial: Record<string, unknown> = {}): DayRecord {
  return dayRecord.parse({ date: '2026-09-16', ...partial })
}

/** Parse a partial task. */
function task(partial: Record<string, unknown> = {}): TaskRecord {
  return taskRecord.parse({ id: 't1', title: '作业', createdAt: '2026-09-16T00:00:00Z', ...partial })
}

const local = { dayStartHour: 4 }
const shanghai = { dayStartHour: 4, timezone: 'Asia/Shanghai' }

console.log('habit day (4h boundary, host local zone)')
check('03:59 belongs to the previous habit day', () => {
  assert.equal(habitDayKey(new Date('2026-09-16T03:59:00'), local), '2026-09-15')
})
check('04:00 starts the new habit day', () => {
  assert.equal(habitDayKey(new Date('2026-09-16T04:00:00'), local), '2026-09-16')
})
check('midday and late evening stay on the same habit day', () => {
  assert.equal(habitDayKey(new Date('2026-09-16T12:00:00'), local), '2026-09-16')
  assert.equal(habitDayKey(new Date('2026-09-16T23:59:00'), local), '2026-09-16')
})
check('night tail is reported for 00:00–03:59 only', () => {
  assert.equal(isNightTail(new Date('2026-09-16T00:30:00'), local), true)
  assert.equal(isNightTail(new Date('2026-09-16T03:59:00'), local), true)
  assert.equal(isNightTail(new Date('2026-09-16T04:00:00'), local), false)
  assert.equal(isNightTail(new Date('2026-09-16T12:00:00'), local), false)
})
check('a zero boundary has no night tail', () => {
  assert.equal(isNightTail(new Date('2026-09-16T00:30:00'), { dayStartHour: 0 }), false)
})

console.log('habit day (fixed timezone override)')
check('03:00 in Shanghai belongs to the previous day', () => {
  // 2026-09-15T19:00Z = 2026-09-16 03:00 in CST → minus 4h → 2026-09-15 23:00 CST
  assert.equal(habitDayKey(new Date('2026-09-15T19:00:00Z'), shanghai), '2026-09-15')
})
check('04:00 in Shanghai starts the new day', () => {
  // 2026-09-15T20:00Z = 2026-09-16 04:00 in CST
  assert.equal(habitDayKey(new Date('2026-09-15T20:00:00Z'), shanghai), '2026-09-16')
})

console.log('key arithmetic')
check('shifting crosses month and year boundaries', () => {
  assert.equal(shiftDayKey('2026-09-30', 1), '2026-10-01')
  assert.equal(shiftDayKey('2026-01-01', -1), '2025-12-31')
  assert.equal(shiftDayKey('2024-02-28', 1), '2024-02-29')
})
check('ranges are inclusive and ascending', () => {
  assert.deepEqual(dayKeyRange('2026-09-28', '2026-10-02'), [
    '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
  ])
  assert.deepEqual(dayKeyRange('2026-09-30', '2026-09-28'), [])
})
check('comparison and validation', () => {
  assert.equal(compareDayKeys('2026-09-15', '2026-09-16'), -1)
  assert.equal(compareDayKeys('2026-09-16', '2026-09-16'), 0)
  assert.equal(compareDayKeys('2026-09-17', '2026-09-16'), 1)
  assert.equal(assertDayKey('2026-09-16'), '2026-09-16')
  assert.throws(() => assertDayKey('2026-9-16'))
  assert.throws(() => assertDayKey('tomorrow'))
})

console.log('schema defaults')
check('an empty day parses into an empty, well-formed record', () => {
  const empty = day()
  assert.deepEqual(empty.washes.times, [])
  assert.equal(empty.shower.at, null)
  assert.deepEqual(empty.meals, {})
  assert.equal(empty.vocab, undefined)
  assert.deepEqual(empty.duolingo, [])
  assert.equal(empty.run, null)
  assert.deepEqual(empty.rope, [])
  assert.deepEqual(empty.pullup, [])
  assert.deepEqual(empty.equipment, [])
  assert.deepEqual(empty.washing, [])
})
check('a task defaults to zero progress with no total', () => {
  const fresh = task()
  assert.equal(fresh.progress.current, 0)
  assert.equal(fresh.progress.total, undefined)
  assert.equal(fresh.completedAt, undefined)
})

console.log('cells (the n/8 chip)')
check('an absent day completes nothing', () => {
  assert.equal(dayCells(undefined).length, CELL_TOTAL)
  assert.deepEqual(cellProgress(undefined), { done: 0, total: 8 })
  assert.equal(isPerfectDay(undefined), false)
})
check('washes fill one cell per hit, capped at two', () => {
  assert.equal(cellProgress(day({ washes: { times: ['a'] } })).done, 1)
  assert.equal(cellProgress(day({ washes: { times: ['a', 'b'] } })).done, 2)
})
check('a perfect day completes all eight cells', () => {
  const perfect = day({
    washes: { times: ['a', 'b'] },
    shower: { at: '2026-09-16T07:00:00' },
    meals: {
      breakfast: { at: '2026-09-16T07:30:00', price: 6 },
      lunch: { at: '2026-09-16T12:00:00' },
      dinner: { at: '2026-09-16T18:30:00', price: 15 },
    },
    vocab: { target: { new: 10, review: 10 }, sessions: [{ id: 'v1', at: 'x', new: 10, review: 10, minutes: 30 }] },
    duolingo: [{ id: 'd1', at: 'x', minutes: 12 }],
  })
  assert.deepEqual(cellProgress(perfect), { done: 8, total: 8 })
  assert.equal(isPerfectDay(perfect), true)
  assert.deepEqual(dayCells(perfect).map(cell => cell.done), Array(8).fill(true))
})
check('a day with only a meal is not perfect', () => {
  assert.equal(isPerfectDay(day({ meals: { lunch: { at: 'x' } } })), false)
})

console.log('vocabulary target progress')
check('progress accumulates across sessions and never exceeds 100%', () => {
  const progress = vocabProgress(day({
    vocab: {
      target: { new: 10, review: 10 },
      sessions: [
        { id: 'v1', at: 'x', new: 6, review: 6, minutes: 20 },
        { id: 'v2', at: 'y', new: 20, review: 5, minutes: 25 },
      ],
    },
  }))
  assert.ok(progress)
  assert.equal(progress.doneNew, 26)
  assert.equal(progress.doneReview, 11)
  assert.equal(progress.minutes, 45)
  assert.equal(progress.ratio, 1)
  assert.equal(progress.met, true)
  assert.equal(progress.surplusNew, 16)
  assert.equal(progress.surplusReview, 1)
})
check('partial progress reports a capped-down ratio', () => {
  const progress = vocabProgress(day({
    vocab: { target: { new: 10, review: 10 }, sessions: [{ id: 'v1', at: 'x', new: 6, review: 6, minutes: 20 }] },
  }))
  assert.ok(progress)
  assert.equal(progress.ratio, 0.6)
  assert.equal(progress.met, false)
  assert.equal(progress.surplusNew, 0)
})
check('a zero target counts as met as soon as anything is studied', () => {
  const studied = vocabProgress(day({
    vocab: { target: { new: 0, review: 0 }, sessions: [{ id: 'v1', at: 'x', new: 1, review: 0, minutes: 5 }] },
  }))
  const untouched = vocabProgress(day({ vocab: { target: { new: 0, review: 0 } } }))
  assert.equal(studied?.met, true)
  assert.equal(untouched?.met, false)
})
check('a day without a vocabulary block has no progress', () => {
  assert.equal(vocabProgress(day()), undefined)
})

console.log('duolingo presence target')
check('one lesson satisfies the day', () => {
  assert.equal(duolingoMet(day({ duolingo: [{ id: 'd1', at: 'x', minutes: 10 }] })), true)
  assert.equal(duolingoMet(day()), false)
})

console.log('task state and overdue (both derived)')
check('progress derives the three states', () => {
  assert.equal(taskState(task({ progress: { current: 0 } })), 'todo')
  assert.equal(taskState(task({ progress: { current: 1 } })), 'done')
  assert.equal(taskState(task({ progress: { current: 0, total: 5 } })), 'todo')
  assert.equal(taskState(task({ progress: { current: 3, total: 5 } })), 'doing')
  assert.equal(taskState(task({ progress: { current: 5, total: 5 } })), 'done')
})
check('overdue needs a past due date and an unfinished task', () => {
  assert.equal(isOverdue(task({ due: '2026-09-15' }), '2026-09-16'), true)
  assert.equal(isOverdue(task({ due: '2026-09-16' }), '2026-09-16'), false)
  assert.equal(isOverdue(task({ due: '2026-09-17' }), '2026-09-16'), false)
  assert.equal(isOverdue(task({ due: '2026-09-15', progress: { current: 1 } }), '2026-09-16'), false)
  assert.equal(isOverdue(task(), '2026-09-16'), false)
})

console.log('pace (derived from duration and distance)')
check('pace is minutes per kilometre', () => {
  assert.equal(paceMinPerKm(30, 5), 6)
  assert.equal(paceMinPerKm(30, 0), undefined)
  assert.equal(paceMinPerKm(0, 5), undefined)
})
check('pace formatting', () => {
  assert.equal(formatPace(6), `6'00"/km`)
  assert.equal(formatPace(5.5), `5'30"/km`)
  assert.equal(formatPace(5.999), `6'00"/km`)
  assert.equal(formatPace(undefined), undefined)
})

console.log('streaks (derived, backfill-aware)')
check('consecutive satisfied days accumulate', () => {
  const done = new Set(['2026-09-14', '2026-09-15', '2026-09-16'])
  assert.equal(streakFor('2026-09-16', key => done.has(key)), 3)
})
check('a missing day breaks the run', () => {
  const done = new Set(['2026-09-14', '2026-09-16'])
  assert.equal(streakFor('2026-09-16', key => done.has(key)), 1)
})
check('backfilling a gap immediately extends the run', () => {
  const done = new Set(['2026-09-14', '2026-09-16'])
  done.add('2026-09-15')
  assert.equal(streakFor('2026-09-16', key => done.has(key)), 3)
})
check('an unsatisfied anchor day means no streak', () => {
  assert.equal(streakFor('2026-09-16', () => false), 0)
})

console.log(`\n${passed} checks passed`)
