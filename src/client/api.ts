/**
 * The browser half's client for the plugin's own HTTP API.
 *
 * Every mutation answers with the refreshed state slice, so the board never has
 * to re-read after a write. Failures arrive as `HabitApiError`, carrying the
 * host's own code so the UI can say something specific.
 */
import type { ClockView, MediaEntry, StateView, StatsView, TaskEntry } from './types.ts'

/** The API prefix this plugin owns on the GUI host. */
const BASE = '/habit/api'

/** One API failure as the host reported it. */
export class HabitApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'HabitApiError'
  }
}

/** Our own view of a habit, as the check endpoints name it. */
export type CheckHabit = 'wash' | 'shower'

/** One meal slot. */
export type MealSlot = 'breakfast' | 'lunch' | 'dinner'

/** Meal edit options: `time` retimes the slot, `price` sets or clears it. */
export interface MealOptions {
  /** `HH:mm`; the host resolves it inside the habit day. */
  readonly time?: string
  readonly price?: number
}

/** Session-bearing habits (running is single-valued and handled apart). */
export type SessionKind = 'vocab' | 'duolingo' | 'rope' | 'pullup' | 'equipment' | 'washing'

/** The vocabulary target for one habit day. */
export interface VocabTarget {
  readonly new: number
  readonly review: number
}

/** Running entry options; the host defaults the duration. */
export interface RunOptions {
  readonly minutes?: number
  readonly distanceKm: number
  readonly avgHr?: number
}

/** The command surface the board receives through slot injection. */
export interface HabitClient {
  clock(): Promise<ClockView>
  state(date?: string): Promise<StateView>
  check(date: string, habit: CheckHabit): Promise<StateView>
  /** Remove one recorded check; `index` defaults to the most recent. */
  uncheck(date: string, habit: CheckHabit, index?: number): Promise<StateView>
  /** Retime one recorded check; `index` defaults to the most recent. */
  editCheck(date: string, habit: CheckHabit, index: number | undefined, time: string): Promise<StateView>
  setMeal(date: string, slot: MealSlot, options?: MealOptions): Promise<StateView>
  clearMeal(date: string, slot: MealSlot): Promise<StateView>
  setStock(pending: number): Promise<StateView>
  /** A wash happened: record it, optionally at a known hour. */
  wash(date: string, pieces: number, time?: string): Promise<StateView>
  /** Append one session; the host stamps `at` and assigns the id. */
  addSession(date: string, kind: SessionKind, entry: Record<string, unknown>): Promise<StateView>
  patchSession(date: string, kind: SessionKind, id: string, patch: Record<string, unknown>): Promise<StateView>
  removeSession(date: string, kind: SessionKind, id: string): Promise<StateView>
  setVocabTarget(date: string, target: VocabTarget): Promise<StateView>
  setRun(date: string, options: RunOptions): Promise<StateView>
  clearRun(date: string): Promise<StateView>
  /** Registries: the lists are global, so these answer with the list itself. */
  addMedia(input: MediaInput): Promise<MediaResult>
  patchMedia(id: string, patch: MediaPatch): Promise<MediaResult>
  removeMedia(id: string): Promise<MediaResult>
  addTask(input: TaskInput): Promise<TaskResult>
  patchTask(id: string, patch: TaskPatch): Promise<TaskResult>
  removeTask(id: string): Promise<TaskResult>
  /** Range aggregates, computed on the host. */
  stats(from: string, to: string): Promise<StatsView>
}

/** Fields a new media entry carries. */
export interface MediaInput {
  readonly kind: 'film' | 'book'
  readonly title: string
  readonly status?: 'active' | 'done' | 'dropped'
  readonly rating?: number
  readonly notes?: string
}

/** A media patch; `null` clears an optional field. */
export interface MediaPatch {
  readonly kind?: 'film' | 'book'
  readonly title?: string
  readonly status?: 'active' | 'done' | 'dropped'
  readonly rating?: number | null
  readonly notes?: string | null
  readonly startedAt?: string | null
  readonly finishedAt?: string | null
}

/** Fields a new task carries. */
export interface TaskInput {
  readonly title: string
  readonly category?: string
  readonly due?: string
  readonly progress?: { readonly current?: number; readonly total?: number }
  readonly notes?: string
}

/** A task patch; `null` clears an optional field, `progress` merges. */
export interface TaskPatch {
  readonly title?: string
  readonly category?: string | null
  readonly due?: string | null
  readonly progress?: { readonly current?: number; readonly total?: number | null }
  readonly notes?: string | null
}

/** The media list a registry call answers with. */
export interface MediaResult {
  readonly ok: true
  readonly media: readonly MediaEntry[]
  readonly entry?: MediaEntry
}

/** The task list a registry call answers with. */
export interface TaskResult {
  readonly ok: true
  readonly tasks: readonly TaskEntry[]
  readonly entry?: TaskEntry
}

/** Build a query string, dropping absent values. */
function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const text = search.toString()
  return text === '' ? '' : `?${text}`
}

/** A JSON request body. */
function body(method: string, payload: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }
}

/** Perform one call, turning a failure payload into a `HabitApiError`. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, init)
  } catch (cause) {
    throw new HabitApiError(0, 'habit/unreachable', `无法连接插件服务：${String(cause)}`)
  }
  const payload = await response.json().catch(() => null) as
    | { error?: { code?: string; message?: string } }
    | null
  if (!response.ok) {
    throw new HabitApiError(
      response.status,
      payload?.error?.code ?? 'habit/unknown',
      payload?.error?.message ?? `HTTP ${response.status}`,
    )
  }
  return payload as T
}

/** Create the command surface handed to the board through slot injection. */
export function createHabitClient(): HabitClient {
  /**
   * The host half is only replaced by a `dsh` restart, while this bundle hot
   * reloads on its own. A board running against an older host would otherwise
   * fail silently on a missing field, so say what to do instead.
   */
  const staleHost = (): never => {
    throw new HabitApiError(0, 'habit/stale-host', '插件宿主半身未更新：请重启 dsh --profile web')
  }

  return {
    clock: async () => {
      const value = await request<ClockView>('/clock')
      if (typeof value.today !== 'string') staleHost()
      return value
    },
    state: async (date) => {
      const value = await request<StateView>(`/state${query({ date })}`)
      if (value.day === undefined || typeof value.day.date !== 'string') staleHost()
      return value
    },
    check: (date, habit) => request<StateView>('/check', body('POST', { date, habit })),
    uncheck: (date, habit, index) => request<StateView>(
      `/check${query({ date, habit, index })}`,
      { method: 'DELETE' },
    ),
    editCheck: (date, habit, index, time) => request<StateView>('/check', body('PATCH', {
      date,
      habit,
      ...(index === undefined ? {} : { index }),
      time,
    })),
    setMeal: (date, slot, options) => request<StateView>('/meal', body('PUT', {
      date,
      slot,
      ...(options?.time === undefined ? {} : { time: options.time }),
      ...(options?.price === undefined ? {} : { price: options.price }),
    })),
    clearMeal: (date, slot) => request<StateView>(`/meal${query({ date, slot })}`, { method: 'DELETE' }),
    setStock: pending => request<StateView>('/laundry/stock', body('PATCH', { pending })),
    wash: (date, pieces, time) => request<StateView>('/laundry/wash', body('POST', {
      date,
      pieces,
      ...(time === undefined ? {} : { time }),
    })),
    addSession: (date, kind, entry) => request<StateView>('/session', body('POST', { date, kind, entry })),
    patchSession: (date, kind, id, patch) => request<StateView>('/session', body('PATCH', { date, kind, id, patch })),
    removeSession: (date, kind, id) => request<StateView>(
      `/session${query({ date, kind, id })}`,
      { method: 'DELETE' },
    ),
    setVocabTarget: (date, target) => request<StateView>(
      '/vocab-target',
      body('PUT', { date, new: target.new, review: target.review }),
    ),
    setRun: (date, options) => request<StateView>('/run', body('PUT', { date, ...options })),
    clearRun: date => request<StateView>(`/run${query({ date })}`, { method: 'DELETE' }),
    addMedia: input => request<MediaResult>('/media', body('POST', input)),
    patchMedia: (id, patch) => request<MediaResult>('/media', body('PATCH', { id, patch })),
    removeMedia: id => request<MediaResult>(`/media${query({ id })}`, { method: 'DELETE' }),
    addTask: input => request<TaskResult>('/tasks', body('POST', input)),
    patchTask: (id, patch) => request<TaskResult>('/tasks', body('PATCH', { id, patch })),
    removeTask: id => request<TaskResult>(`/tasks${query({ id })}`, { method: 'DELETE' }),
    stats: (from, to) => request<StatsView>(`/stats${query({ from, to })}`),
  }
}
