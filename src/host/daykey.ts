/**
 * Habit-day arithmetic.
 *
 * A **habit day** runs from `dayStartHour` local time to the same hour the next
 * calendar day, so 00:00–04:00 belongs to the previous day (the **night tail**).
 * Keys are plain `YYYY-MM-DD` calendar dates and carry no zone of their own:
 * only the moment a key is *derived* depends on the timezone.
 */
import type { DayBoundary } from './config.ts'

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/** A `YYYY-MM-DD` habit-day key. */
export type DayKey = string

/** Formatter for one zone (undefined = host local zone). */
function dateFormatter(timezone: string | undefined): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA', {
    ...(timezone === undefined ? {} : { timeZone: timezone }),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function hourFormatter(timezone: string | undefined): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-GB', {
    ...(timezone === undefined ? {} : { timeZone: timezone }),
    hour: '2-digit',
    hourCycle: 'h23',
  })
}

/** The habit day an instant belongs to. */
export function habitDayKey(instant: Date, boundary: DayBoundary): DayKey {
  const shifted = new Date(instant.getTime() - boundary.dayStartHour * 3_600_000)
  const parts = dateFormatter(boundary.timezone).formatToParts(shifted)
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find(part => part.type === type)?.value ?? ''
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

/** True while the instant sits in the night tail (before the boundary hour). */
export function isNightTail(instant: Date, boundary: DayBoundary): boolean {
  if (boundary.dayStartHour <= 0) return false
  const hour = Number(hourFormatter(boundary.timezone).format(instant))
  return hour < boundary.dayStartHour
}

/** Reject anything that is not a `YYYY-MM-DD` key. */
export function assertDayKey(key: string): DayKey {
  if (!KEY_RE.test(key)) throw new Error(`invalid habit-day key: ${key}`)
  return key
}

/** Shift a key by whole days — pure calendar arithmetic, zone-free. */
export function shiftDayKey(key: DayKey, days: number): DayKey {
  assertDayKey(key)
  const [year, month, day] = key.split('-').map(Number) as [number, number, number]
  const moved = new Date(Date.UTC(year, month - 1, day) + days * 86_400_000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`
}

/** Ascending key order; negative when `a` is earlier. */
export function compareDayKeys(a: DayKey, b: DayKey): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Every key from `from` to `to`, inclusive and ascending (empty when reversed). */
export function dayKeyRange(from: DayKey, to: DayKey): DayKey[] {
  assertDayKey(from)
  assertDayKey(to)
  const keys: DayKey[] = []
  for (let key = from; compareDayKeys(key, to) <= 0; key = shiftDayKey(key, 1)) {
    keys.push(key)
    if (keys.length > 4000) throw new Error('day range too large')
  }
  return keys
}

/** Whether `key` lies within `[from, to]`. */
export function isWithin(key: DayKey, from: DayKey, to: DayKey): boolean {
  return compareDayKeys(key, from) >= 0 && compareDayKeys(key, to) <= 0
}
