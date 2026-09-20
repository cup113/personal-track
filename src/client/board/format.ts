/**
 * Display formatting for the board.
 *
 * Instants travel as ISO strings and are shown in the browser's local zone;
 * habit-day keys are plain calendar dates and are formatted in UTC so a label
 * can never drift a day. `shiftKey` mirrors the host's key arithmetic — the
 * client navigates dates, but the host still decides what "today" is.
 */
import type { FieldSpec } from './fields.tsx'

/** `09:41` in the browser's local zone, or an em dash when unset. */
export function timeOf(instant: string | null | undefined): string {
  if (instant === null || instant === undefined || instant === '') return '——'
  const date = new Date(instant)
  if (Number.isNaN(date.getTime())) return '——'
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * The `HH:mm` value an `<input type="time">` needs for a stored instant.
 *
 * The board only ever sends a clock time back; the host resolves it inside the
 * habit day, so nothing here has to know about dates or the night tail.
 */
export function timeValueOf(instant: string | null | undefined): string {
  if (instant === null || instant === undefined || instant === '') return ''
  const date = new Date(instant)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** A standard time input, described once for every editable entry. */
export const TIME_FIELD = { name: 'time', label: '时间', kind: 'time' } as const

/** The browser's clock as `HH:mm`. */
export function clockTimeOf(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/**
 * The time field with the current clock time filled in.
 *
 * A new entry is normally recorded at the moment it happened, so "now" is the
 * value worth showing — and it is the instant the host would stamp anyway.
 * Call this while rendering: a module-level constant would freeze at import,
 * and `initial` still wins whenever an existing entry is being edited.
 */
export function timeField(): FieldSpec {
  return { ...TIME_FIELD, defaultValue: clockTimeOf() }
}

/** `9月16日` for a habit-day key. */
export function monthDayOf(key: string): string {
  const [, month, day] = key.split('-')
  return `${Number(month)}月${Number(day)}日`
}

/** `周三` for a habit-day key (computed in UTC, so it cannot drift). */
export function weekdayOf(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString('zh-CN', { weekday: 'short', timeZone: 'UTC' })
}

/** The date chip's text, marking the night tail the way the domain names it. */
export function dayLabelOf(key: string, night: boolean): string {
  const weekday = weekdayOf(key)
  return `${monthDayOf(key)} ${night ? `${weekday}夜` : weekday}`
}

/** `¥12.5` — the currency symbol plus a trimmed amount. */
export function moneyOf(price: number | undefined): string {
  if (price === undefined) return ''
  return `¥${Number.isInteger(price) ? price : price.toFixed(2).replace(/0$/, '')}`
}

/** Shift a habit-day key by whole days (pure calendar arithmetic). */
export function shiftKey(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number]
  const moved = new Date(Date.UTC(year, month - 1, day) + days * 86_400_000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`
}

/**
 * The Sunday that ends the week containing `key`.
 *
 * Weeks start on Monday, the same convention the statistics ranges use, so
 * "本周末" is that Sunday — the deadline a new task defaults to. Parsed at noon
 * UTC and read back in UTC, so no local zone can shift the weekday.
 */
export function weekEndKey(key: string): string {
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay()
  const fromMonday = (weekday + 6) % 7
  return shiftKey(key, 6 - fromMonday)
}

/** Whole days from `from` to `to`: 0 for the same day, negative when `to` is past. */
export function daysBetweenKeys(from: string, to: string): number {
  const at = (key: string): number => {
    const [year, month, day] = key.split('-').map(Number) as [number, number, number]
    return Date.UTC(year, month - 1, day)
  }
  return Math.round((at(to) - at(from)) / 86_400_000)
}

/** How close a deadline is, as the board colours it. */
export type DueLevel = 'overdue' | 'today' | 'soon' | 'week' | 'far'

/**
 * The band a deadline falls in: past, today, within three days, within a week,
 * or beyond. Bands are counted in whole days from the current habit day.
 */
export function dueLevelOf(due: string, today: string): DueLevel {
  const days = daysBetweenKeys(today, due)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 3) return 'soon'
  if (days <= 7) return 'week'
  return 'far'
}

/**
 * A count that may be fractional, with at most one decimal and no trailing
 * `.0` — the completion bar sums partial cells, so `4.5/9` and `5/9` are both
 * ordinary readings.
 */
export function fractionText(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** Pace in minutes per kilometre; undefined when it cannot be computed. */
export function paceOf(minutes: number, distanceKm: number): number | undefined {
  if (!(minutes > 0) || !(distanceKm > 0)) return undefined
  return minutes / distanceKm
}

/** `6'00"/km` for a pace, or an em dash when there is none. */
export function paceLabel(pace: number | undefined): string {
  if (pace === undefined) return '——'
  let whole = Math.floor(pace)
  let seconds = Math.round((pace - whole) * 60)
  if (seconds === 60) {
    seconds = 0
    whole += 1
  }
  return `${whole}'${String(seconds).padStart(2, '0')}"/km`
}
