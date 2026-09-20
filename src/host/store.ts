/**
 * The habit store: typed access to the `habit` domain plus every mutation the
 * API exposes.
 *
 * Reads come from the domain's authoritative in-memory snapshot, so a view is
 * cheap. Writes use the domain's single per-domain chain; `mutateDay` is an
 * atomic read-modify-write, so concurrent check-ins never interleave. Every
 * write is re-validated by the record schema before it is stored.
 *
 * A day with no entries has **no document** — that is what "empty day" means.
 * Reads therefore never create documents; only a mutation materializes one.
 */
import { randomUUID } from 'node:crypto'
import type { Config, VocabTarget } from './config.ts'
import type {
  CounterRecord,
  DayRecord,
  HabitDomain,
  MediaRecord,
  TaskRecord,
} from './domain.ts'
import { dayRecord } from './domain.ts'
import { cellProgress, dayCells, vocabProgress, type Cell, type VocabProgress } from './derive.ts'
import type { DayKey } from './daykey.ts'

/** The laundry stock's key inside the counters table. */
export const LAUNDRY_KEY = 'laundry'

/** Session-bearing habits (running is single-valued and handled apart). */
export type SessionKind = 'vocab' | 'duolingo' | 'rope' | 'pullup' | 'equipment' | 'washing'

/** Everything the board needs about one habit day. */
export interface DayView {
  readonly date: DayKey
  readonly isToday: boolean
  /** `null` when the day has no stored document yet. */
  readonly day: DayRecord | null
  /** The effective vocabulary target: own snapshot, else inherited, else config. */
  readonly target: VocabTarget
  readonly vocab: VocabProgress
  readonly cells: Cell[]
  readonly progress: { done: number; total: number }
}

/** One complete state slice — what reads and every mutation return. */
export interface StateView {
  readonly day: DayView
  readonly stock: CounterRecord
  readonly media: MediaRecord[]
  readonly tasks: TaskRecord[]
}

/** The store surface the API and the statistics use. */
export interface HabitStore {
  /** The stored document, or undefined for an untouched day. */
  readDay(key: DayKey): DayRecord | undefined
  /** Own target snapshot → carry-forward → config default. */
  resolveTarget(key: DayKey): VocabTarget
  view(key: DayKey, today: DayKey): StateView
  mutateDay(key: DayKey, apply: (day: DayRecord) => Record<string, unknown>): Promise<DayRecord>
  setVocabTarget(key: DayKey, target: VocabTarget): Promise<DayRecord>
  addSession(key: DayKey, kind: SessionKind, entry: Record<string, unknown>): Promise<DayRecord>
  patchSession(key: DayKey, kind: SessionKind, id: string, patch: Record<string, unknown>): Promise<DayRecord>
  removeSession(key: DayKey, kind: SessionKind, id: string): Promise<DayRecord>
  /** Stock down by `pieces` and one washing session appended. */
  wash(key: DayKey, pieces: number, at: string): Promise<{ day: DayRecord; stock: CounterRecord }>
  /** Correction: the stock only — no event, no history. */
  setStock(pending: number, at: string): Promise<CounterRecord>
  putMedia(record: MediaRecord): Promise<void>
  patchMedia(id: string, patch: Partial<Omit<MediaRecord, 'id'>>): Promise<MediaRecord>
  deleteMedia(id: string): Promise<boolean>
  putTask(record: TaskRecord): Promise<void>
  patchTask(id: string, patch: Partial<Omit<TaskRecord, 'id'>>): Promise<TaskRecord>
  deleteTask(id: string): Promise<boolean>
  newId(): string
}

/** Session-array field names for the non-vocabulary kinds. */
const SESSION_FIELD = {
  duolingo: 'duolingo',
  rope: 'rope',
  pullup: 'pullup',
  equipment: 'equipment',
  washing: 'washing',
} as const

/** An empty progress, used only when a record somehow carries no vocabulary. */
const NO_PROGRESS: VocabProgress = {
  doneNew: 0, doneReview: 0, targetNew: 0, targetReview: 0,
  minutes: 0, ratio: 0, surplusNew: 0, surplusReview: 0, met: false,
}

/** Build the store over an opened domain. */
export function createHabitStore(domain: HabitDomain, config: Config): HabitStore {
  const days = domain.table('days')
  const counters = domain.table('counters')
  const media = domain.table('media')
  const tasks = domain.table('tasks')

  /** Copies so callers can never mutate a stored record in place. */
  const copyTarget = (target: VocabTarget): VocabTarget => ({ new: target.new, review: target.review })

  /** Session entries of one habit kind. */
  function sessionsOf(day: DayRecord, kind: SessionKind): readonly Record<string, unknown>[] {
    switch (kind) {
      case 'vocab': return day.vocab?.sessions ?? []
      case 'duolingo': return day.duolingo
      case 'rope': return day.rope
      case 'pullup': return day.pullup
      case 'equipment': return day.equipment
      case 'washing': return day.washing
    }
  }

  /** Rebuild a day with one kind's session array replaced. */
  function withSessions(
    day: DayRecord,
    kind: SessionKind,
    key: DayKey,
    next: readonly Record<string, unknown>[],
  ): Record<string, unknown> {
    if (kind === 'vocab') {
      return { ...day, vocab: { target: day.vocab?.target ?? resolveTarget(key), sessions: next } }
    }
    return { ...day, [SESSION_FIELD[kind]]: next }
  }

  /** The most recent day before `key` that carries a vocabulary target. */
  function carryForward(key: DayKey): VocabTarget | undefined {
    let best: DayKey | undefined
    for (const [candidate, record] of days.entries()) {
      if (candidate >= key || record.vocab === undefined) continue
      if (best === undefined || candidate > best) best = candidate
    }
    if (best === undefined) return undefined
    const found = days.get(best)?.vocab?.target
    return found === undefined ? undefined : copyTarget(found)
  }

  function resolveTarget(key: DayKey): VocabTarget {
    const own = days.get(key)?.vocab?.target
    if (own !== undefined) return copyTarget(own)
    return carryForward(key) ?? copyTarget(config.defaultVocabTarget)
  }

  /** The day as the UI sees it: an absent vocabulary block is filled from the
   *  effective target so progress renders before the first write. */
  function effective(key: DayKey): DayRecord {
    const stored = days.get(key)
    if (stored?.vocab !== undefined) return stored
    const target = resolveTarget(key)
    return stored === undefined
      ? dayRecord.parse({ date: key, vocab: { target, sessions: [] } })
      : dayRecord.parse({ ...stored, vocab: { target, sessions: [] } })
  }

  /** Materialize an untouched day so the atomic RMW below has a document. */
  async function materialize(key: DayKey): Promise<void> {
    if (days.get(key) === undefined) {
      await days.put(key, dayRecord.parse({ date: key, vocab: { target: resolveTarget(key), sessions: [] } }))
    }
  }

  function stock(): CounterRecord {
    return counters.get(LAUNDRY_KEY) ?? { pending: 0, updatedAt: new Date(0).toISOString() }
  }

  const byCreatedAtDesc = <T extends { createdAt: string }>(entries: Iterable<T>): T[] =>
    [...entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))

  const store: HabitStore = {
    readDay: key => days.get(key),

    resolveTarget,

    view(key, today) {
      const record = effective(key)
      return {
        day: {
          date: key,
          isToday: key === today,
          day: days.get(key) ?? null,
          target: copyTarget(record.vocab?.target ?? config.defaultVocabTarget),
          vocab: vocabProgress(record) ?? NO_PROGRESS,
          cells: dayCells(record),
          progress: cellProgress(record),
        },
        stock: stock(),
        media: byCreatedAtDesc([...media.entries()].map(([, record]) => record)),
        tasks: byCreatedAtDesc([...tasks.entries()].map(([, record]) => record)),
      }
    },

    async mutateDay(key, apply) {
      await materialize(key)
      return await days.update(key, current => dayRecord.parse(apply(current)))
    },

    setVocabTarget(key, target) {
      return store.mutateDay(key, day => ({
        ...day,
        vocab: { target: copyTarget(target), sessions: day.vocab?.sessions ?? [] },
      }))
    },

    addSession(key, kind, entry) {
      const id = randomUUID()
      return store.mutateDay(key, day =>
        withSessions(day, kind, key, [...sessionsOf(day, kind), { ...entry, id }]))
    },

    patchSession(key, kind, id, patch) {
      return store.mutateDay(key, day => withSessions(day, kind, key,
        sessionsOf(day, kind).map(session => (session.id === id ? { ...session, ...patch, id } : session))))
    },

    removeSession(key, kind, id) {
      return store.mutateDay(key, day => withSessions(day, kind, key,
        sessionsOf(day, kind).filter(session => session.id !== id)))
    },

    async wash(key, pieces, at) {
      // History first (the fact), then the gauge: a crash in between
      // under-counts the stock rather than inventing a wash that never happened.
      const day = await store.addSession(key, 'washing', { at, pieces })
      const next = { pending: Math.max(0, stock().pending - pieces), updatedAt: at }
      await counters.put(LAUNDRY_KEY, next)
      return { day, stock: next }
    },

    async setStock(pending, at) {
      const next = { pending, updatedAt: at }
      await counters.put(LAUNDRY_KEY, next)
      return next
    },

    putMedia: record => media.put(record.id, record),

    patchMedia: (id, patch) => media.update(id, current => ({ ...current, ...patch, id })),

    deleteMedia: id => media.delete(id),

    putTask: record => tasks.put(record.id, record),

    patchTask: (id, patch) => tasks.update(id, current => ({ ...current, ...patch, id })),

    deleteTask: id => tasks.delete(id),

    newId: () => randomUUID(),
  }

  return store
}
