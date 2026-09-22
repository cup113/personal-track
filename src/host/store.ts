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
import { ApiError } from './api-error.ts'
import { clockOf, type Config, type VocabTarget } from './config.ts'
import type {
  CounterRecord,
  DayRecord,
  HabitDomain,
  MediaRecord,
  TaskRecord,
} from './domain.ts'
import { dayRecord, mediaRecord, taskRecord } from './domain.ts'
import {
  cellProgress,
  dayCells,
  isOverdue,
  isPerfectDay,
  taskState,
  vocabProgress,
  type Cell,
  type DueTask,
  type TaskState,
  type VocabProgress,
} from './derive.ts'
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
  /** `done` is fractional to one decimal; `total` grows with the due tasks. */
  readonly progress: { done: number; total: number }
}

/** One complete state slice — what reads and every mutation return. */
export interface StateView {
  readonly day: DayView
  readonly stock: CounterRecord
  readonly media: MediaRecord[]
  readonly tasks: TaskView[]
}

/**
 * A task plus both states derived from it, computed here so the derivation
 * rules live in exactly one place (docs/adr/0002-derived-state-not-stored.md).
 */
export interface TaskView extends TaskRecord {
  readonly state: TaskState
  readonly overdue: boolean
}

/** Everything derived from one habit day, with its document read once. */
export interface DayFacts {
  readonly date: DayKey
  /** The stored document, or null for an untouched day. */
  readonly stored: DayRecord | null
  /** The day as the UI sees it: an absent vocabulary block is filled in. */
  readonly day: DayRecord
  readonly target: VocabTarget
  readonly vocab: VocabProgress
  /** Habit cells plus one per task due this day (see `dayCells`). */
  readonly cells: Cell[]
  /** `done` is fractional to one decimal; `total` grows with the due tasks. */
  readonly progress: { readonly done: number; readonly total: number }
  readonly perfect: boolean
}

/** The store surface the API and the statistics use. */
export interface HabitStore {
  /** The stored document, or undefined for an untouched day. */
  readDay(key: DayKey): DayRecord | undefined
  /** The stored document plus every value derived from it. */
  dayFacts(key: DayKey): DayFacts
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
  /** Patch fields; `null` clears one (see {@link withoutCleared}). */
  patchMedia(id: string, patch: Record<string, unknown>): Promise<MediaRecord>
  deleteMedia(id: string): Promise<boolean>
  putTask(record: TaskRecord): Promise<void>
  /** Patch fields; `null` clears one, and completion follows progress. */
  patchTask(id: string, patch: Record<string, unknown>): Promise<TaskRecord>
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

/**
 * Drop keys a patch explicitly cleared with `null`.
 *
 * PATCH semantics: an absent key means "leave it", `null` means "remove it" —
 * otherwise a due date, a rating or a note could never be taken back.
 */
function withoutCleared(record: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (value !== null) next[key] = value
  }
  return next
}

/**
 * Keep every checkpoint's `reachedAt` in step with the progress: crossing a
 * threshold stamps the instant, dropping back below it clears the fact, and
 * crossing again re-stamps — the same rule `completedAt` follows. A patch that
 * jumps over several thresholds stamps them all with the same instant, which
 * is honest: one write crossed them.
 */
function syncCheckpoints(task: TaskRecord, now: () => Date): TaskRecord {
  if (task.checkpoints.length === 0) return task
  const current = task.progress.current
  let changed = false
  const checkpoints = task.checkpoints.map((checkpoint) => {
    if (current >= checkpoint.at && checkpoint.reachedAt === undefined) {
      changed = true
      return { ...checkpoint, reachedAt: now().toISOString() }
    }
    if (current < checkpoint.at && checkpoint.reachedAt !== undefined) {
      changed = true
      const { reachedAt: _cleared, ...rest } = checkpoint
      return rest
    }
    return checkpoint
  })
  return changed ? { ...task, checkpoints } : task
}

/**
 * Checkpoints sit on the progress axis, which only a total gives a task — a
 * checkbox task has no stages to mark. Enforced on every write path so an
 * orphaned checkpoint cannot enter storage (nor, via the same rule, a backup
 * file).
 */
function assertCheckpointsFit(task: TaskRecord): void {
  if (task.checkpoints.length > 0 && task.progress.total === undefined) {
    throw new ApiError(
      400,
      'habit/task-checkpoints-need-total',
      'a task with checkpoints needs a progress total',
    )
  }
}

/** Build the store over an opened domain. */
export function createHabitStore(domain: HabitDomain, config: Config): HabitStore {
  const days = domain.table('days')
  const counters = domain.table('counters')
  const media = domain.table('media')
  const tasks = domain.table('tasks')

  /**
   * The clock every derived instant is stamped with.
   *
   * Completion is derived from progress, so the instant it happened is written
   * here rather than trusted from a caller — which means this module is where
   * "now" is actually consulted, and it must be the same clock the API uses.
   * Reaching for `new Date()` directly here would put two clocks in one plugin
   * and make the derived instants untestable.
   */
  const now = clockOf(config)

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

  /**
   * The tasks whose deadline falls on `key`, as the day's bar sees them.
   *
   * Tasks carry no habit day, so the deadline is the only link — and it is the
   * *current* state of those tasks that counts, not how they stood on that day:
   * finishing today's homework fills today's square, just as editing a session
   * retroactively moves that day's progress.
   */
  function dueTasksOn(key: DayKey): DueTask[] {
    const due: DueTask[] = []
    for (const [, record] of tasks.entries()) {
      if (record.due !== key) continue
      due.push({
        id: record.id,
        title: record.title,
        current: record.progress.current,
        total: record.progress.total,
      })
    }
    return due.sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0))
  }

  const byCreatedAtDesc = <T extends { createdAt: string }>(entries: Iterable<T>): T[] =>
    [...entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))

  const store: HabitStore = {
    readDay: key => days.get(key),

    dayFacts(key) {
      const record = effective(key)
      const due = dueTasksOn(key)
      return {
        date: key,
        stored: days.get(key) ?? null,
        day: record,
        target: copyTarget(record.vocab?.target ?? config.defaultVocabTarget),
        vocab: vocabProgress(record) ?? NO_PROGRESS,
        cells: dayCells(record, due),
        progress: cellProgress(record, due),
        perfect: isPerfectDay(record, due),
      }
    },

    resolveTarget,

    view(key, today) {
      const facts = store.dayFacts(key)
      return {
        day: {
          date: key,
          isToday: key === today,
          day: facts.stored,
          target: facts.target,
          vocab: facts.vocab,
          cells: facts.cells,
          progress: facts.progress,
        },
        stock: stock(),
        media: byCreatedAtDesc([...media.entries()].map(([, record]) => record)),
        tasks: byCreatedAtDesc([...tasks.entries()].map(([, record]) => record)).map(record => ({
          ...record,
          state: taskState(record),
          overdue: isOverdue(record, today),
        })),
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

    patchMedia: (id, patch) => media.update(id, (current) => {
      const parsed = mediaRecord.parse(withoutCleared({ ...current, ...patch, id }))
      // Symmetric with tasks: the instant a title was finished is a fact the
      // store keeps in step with the status, not something callers must send.
      if (parsed.status === 'done' && parsed.finishedAt === undefined) {
        return { ...parsed, finishedAt: now().toISOString() }
      }
      if (parsed.status !== 'done' && parsed.finishedAt !== undefined) {
        const { finishedAt: _cleared, ...rest } = parsed
        return rest
      }
      return parsed
    }),

    deleteMedia: id => media.delete(id),

    putTask: async input => {
      // Parsed here rather than trusted: callers hand over a record they
      // built, and the schema is where a task's defaults (empty checkpoints,
      // zero progress) come from — the same treatment `patchTask` gives its
      // merge result.
      const record = taskRecord.parse(input)
      assertCheckpointsFit(record)
      await tasks.put(record.id, syncCheckpoints(record, now))
    },

    patchTask: (id, patch) => tasks.update(id, (current) => {
      const merged: Record<string, unknown> = { ...current, ...patch, id }
      // `progress` merges field by field; every other key replaces wholesale.
      if (patch.progress !== undefined && patch.progress !== null) {
        merged.progress = withoutCleared({
          ...current.progress,
          ...(patch.progress as Record<string, unknown>),
        })
      }
      // A checkpoint's identity to the user is its content — `label` plus
      // `at` — so the wire carries no ids: a line that still exists keeps its
      // id and its reached fact, and a changed or new line starts fresh.
      if (Array.isArray(patch.checkpoints)) {
        merged.checkpoints = (patch.checkpoints as { label: string; at: number }[]).map((line) => {
          const before = current.checkpoints.find(
            checkpoint => checkpoint.label === line.label && checkpoint.at === line.at,
          )
          return before === undefined
            ? { ...line, id: randomUUID() }
            : { ...line, id: before.id, reachedAt: before.reachedAt }
        })
      }
      const parsed = taskRecord.parse(withoutCleared(merged))
      assertCheckpointsFit(parsed)
      // Completion is derived from progress, so the instant it happened is kept
      // in step here rather than trusted from every caller.
      let task: TaskRecord = parsed
      const done = taskState(task) === 'done'
      if (done && task.completedAt === undefined) {
        task = { ...task, completedAt: now().toISOString() }
      } else if (!done && task.completedAt !== undefined) {
        const { completedAt: _cleared, ...rest } = task
        task = rest
      }
      return syncCheckpoints(task, now)
    }),

    deleteTask: id => tasks.delete(id),

    newId: () => randomUUID(),
  }

  return store
}
