/**
 * The plugin config, and the clock seam it carries.
 *
 * The production shape of that seam is "no `now` supplied", which no other test
 * covers — the portless harness and the real-stack verification both pass an
 * explicit clock, so a default that resolved to the wrong thing would look
 * perfectly healthy everywhere except a real deployment.
 *
 * Two things make these assertions worth writing rather than trusting:
 *
 * - `Schema.function().default(fn)` resolves a function default by *calling it
 *   once*, so the default has to be a clock rather than a factory returning one.
 *   Getting it wrong yields `() => new Date` — callable, and returning a function
 *   instead of a Date — which only fails at the first stamp.
 * - The schema's declared type is the *resolved* config, while the loader hands
 *   it a partial one, so every partial input below is cast exactly once here
 *   (`partial`) rather than scattered through the assertions.
 *
 * Runs on Node's native type stripping:
 *   node tests/config.test.ts
 */
import { strict as assert } from 'node:assert'
import { createChecker } from './support.ts'
import { Config, boundaryOf, clockOf, type Config as ConfigShape } from '../src/host/config.ts'

const checker = createChecker('plugin config and the clock seam')
const { check, report } = checker

/**
 * Validate a partial configuration, the way the loader does.
 *
 * @param input - whatever `cordis.yml` carried (or nothing).
 * @returns the resolved, defaulted configuration.
 */
const partial = (input: Record<string, unknown> = {}): ConfigShape =>
  Config(input as unknown as ConfigShape)

check('an omitted configuration takes every documented default', () => {
  const config = partial()
  assert.equal(config.dayStartHour, 4)
  assert.deepEqual(config.defaultVocabTarget, { new: 20, review: 60 })
  assert.equal(config.defaultRunMinutes, 30)
  assert.equal(config.timezone, undefined, 'no timezone means "follow the host"')
})

check('with nothing configured, the clock is a real clock', () => {
  const clock = clockOf(partial())
  const instant = clock()
  assert.ok(instant instanceof Date, `the default clock must return a Date, got ${typeof instant}`)
  assert.ok(!Number.isNaN(instant.getTime()), 'and a usable one')
  assert.ok(Math.abs(Date.now() - instant.getTime()) < 5000, 'reading close to now')
})

check('an injected clock is used verbatim', () => {
  const pinned = (): Date => new Date(2026, 8, 16, 12, 0, 0)
  const config = partial({ now: pinned })
  assert.equal(clockOf(config), pinned, 'the injected clock is not wrapped or copied')
  assert.equal(clockOf(config)().getTime(), pinned().getTime())
})

check('every configured field is validated, and the boundary follows', () => {
  const config = partial({
    dayStartHour: 6,
    timezone: 'Asia/Shanghai',
    defaultVocabTarget: { new: 5, review: 5 },
    defaultRunMinutes: 45,
  })
  assert.equal(config.dayStartHour, 6)
  assert.equal(config.timezone, 'Asia/Shanghai')
  assert.deepEqual(config.defaultVocabTarget, { new: 5, review: 5 })
  assert.equal(config.defaultRunMinutes, 45)
  // The boundary is the projection the day-key arithmetic consumes; an
  // unconfigured timezone must stay absent so those helpers follow the host.
  assert.deepEqual(boundaryOf(config), { dayStartHour: 6, timezone: 'Asia/Shanghai' })
  assert.deepEqual(boundaryOf(partial()), { dayStartHour: 4 })
})

check('a bad configuration is refused rather than silently patched', () => {
  assert.throws(() => partial({ dayStartHour: 24 }), 'an hour past the end of the day')
  assert.throws(() => partial({ dayStartHour: -1 }))
  assert.throws(() => partial({ now: 'not a function' }), 'a non-callable clock is refused')
  assert.throws(() => partial({ defaultRunMinutes: 0 }), 'a zero-minute default run is not a run')
})

check('a partial vocab target still fills in its other half', () => {
  // The two halves default independently, so configuring one is not a typo trap.
  const config = partial({ defaultVocabTarget: { new: 7 } })
  assert.deepEqual(config.defaultVocabTarget, { new: 7, review: 60 })
})

report()
