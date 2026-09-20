/**
 * The browser half's view of the wire contract.
 *
 * These are display shapes, deliberately declared here rather than imported
 * from the host program: the two halves are separate TypeScript programs (the
 * host one owns Node and zod, the browser one owns JSX and the DOM), and the
 * JSON on the wire is the real interface between them.
 */

/** One of the eight completion cells. */
export interface Cell {
  readonly id: string
  readonly done: boolean
}

/** Vocabulary target progress for a day. */
export interface VocabProgress {
  readonly doneNew: number
  readonly doneReview: number
  readonly targetNew: number
  readonly targetReview: number
  readonly minutes: number
  readonly ratio: number
  readonly surplusNew: number
  readonly surplusReview: number
  readonly met: boolean
}

/** One meal slot. */
export interface Meal {
  readonly at: string
  readonly price?: number
}

/** A vocabulary study session. Declared as a type alias (not an interface) so
 *  it stays assignable to the generic session-entry shape. */
export type VocabSession = {
  readonly id: string
  readonly at: string
  readonly new: number
  readonly review: number
  readonly minutes: number
}

/** A duolingo lesson. */
export type Lesson = {
  readonly id: string
  readonly at: string
  readonly minutes: number
}

/** A washing session (the history half of the laundry counter). */
export interface Washing {
  readonly id: string
  readonly at: string
  readonly pieces: number
}

/** A jump-rope session. */
export type RopeSession = {
  readonly id: string
  readonly at: string
  readonly preset: 90 | 180
  readonly seconds: number
  readonly avgHr?: number
}

/** A pull-up session (metric = support time). */
export type PullupSession = {
  readonly id: string
  readonly at: string
  readonly seconds: number
}

/** A gym-equipment session. */
export type EquipmentSession = {
  readonly id: string
  readonly at: string
  readonly name: string
  readonly reps: number
  readonly weight?: number
}

/** The stored document for one habit day, as the UI reads it. */
export interface DayRecord {
  readonly date: string
  readonly washes: { readonly times: readonly string[] }
  readonly shower: { readonly at: string | null }
  readonly meals: {
    readonly breakfast?: Meal
    readonly lunch?: Meal
    readonly dinner?: Meal
  }
  readonly vocab?: {
    readonly target: { readonly new: number; readonly review: number }
    readonly sessions: readonly VocabSession[]
  }
  readonly duolingo: readonly Lesson[]
  readonly rope: readonly RopeSession[]
  readonly pullup: readonly PullupSession[]
  readonly equipment: readonly EquipmentSession[]
  readonly run: {
    readonly at: string
    readonly minutes: number
    readonly distanceKm: number
    readonly avgHr?: number
  } | null
  readonly washing: readonly Washing[]
}

/** One habit day plus everything derived from it. */
export interface DayView {
  readonly date: string
  readonly isToday: boolean
  readonly day: DayRecord | null
  readonly target: { readonly new: number; readonly review: number }
  readonly vocab: VocabProgress
  readonly cells: readonly Cell[]
  readonly progress: { readonly done: number; readonly total: number }
}

/** The laundry stock. */
export interface Stock {
  readonly pending: number
  readonly updatedAt: string
}

/** One media log entry. */
export interface MediaEntry {
  readonly id: string
  readonly kind: 'film' | 'book'
  readonly title: string
  readonly status: 'active' | 'done' | 'dropped'
  readonly rating?: number
  readonly startedAt?: string
  readonly finishedAt?: string
  readonly notes?: string
  readonly createdAt: string
}

/** A task's lifecycle state, derived by the host from its progress. */
export type TaskState = 'todo' | 'doing' | 'done'

/** One task entry: the record plus both states the host derives from it. */
export interface TaskEntry {
  readonly id: string
  readonly title: string
  readonly category?: string
  readonly due?: string
  readonly progress: { readonly current: number; readonly total?: number }
  readonly completedAt?: string
  readonly notes?: string
  readonly createdAt: string
  /** Derived: 待办 / 进行中 / 完成. */
  readonly state: TaskState
  /** Derived: past its due date and not finished. */
  readonly overdue: boolean
}

/** The full state slice every read and mutation answers with. */
export interface StateView {
  readonly day: DayView
  readonly stock: Stock
  readonly media: readonly MediaEntry[]
  readonly tasks: readonly TaskEntry[]
}

/** Host facts about the habit day, fetched once per board mount. */
export interface ClockView {
  readonly today: string
  readonly nightTail: boolean
  readonly now: string
  readonly config: {
    readonly dayStartHour: number
    readonly defaultVocabTarget: { readonly new: number; readonly review: number }
    readonly defaultRunMinutes: number
  }
}
