/**
 * Display formatting for the board.
 *
 * Instants travel as ISO strings and are shown in the browser's local zone;
 * habit-day keys are plain calendar dates and are formatted in UTC so a label
 * can never drift a day. `shiftKey` mirrors the host's key arithmetic — the
 * client navigates dates, but the host still decides what "today" is.
 */

/** `09:41` in the browser's local zone, or an em dash when unset. */
export function timeOf(instant: string | null | undefined): string {
  if (instant === null || instant === undefined || instant === '') return '——'
  const date = new Date(instant)
  if (Number.isNaN(date.getTime())) return '——'
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
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

/** Human text for the eight cells, used as dot tooltips. */
export const CELL_LABELS: Record<string, string> = {
  wash1: '洗漱 1',
  wash2: '洗漱 2',
  shower: '洗澡',
  breakfast: '早饭',
  lunch: '午饭',
  dinner: '晚饭',
  vocab: '背单词',
  duolingo: '多邻国',
}
