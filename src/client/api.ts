/**
 * The browser half's client for the plugin's own HTTP API.
 *
 * Every mutation answers with the refreshed state slice, so the board never has
 * to re-read after a write. Failures arrive as `HabitApiError`, carrying the
 * host's own code so the UI can say something specific.
 */
import type { ClockView, StateView } from './types.ts'

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

/** Meal edit options: `at` preserves the recorded time when only the price changes. */
export interface MealOptions {
  readonly at?: string
  readonly price?: number
}

/** The command surface the board receives through slot injection. */
export interface HabitClient {
  clock(): Promise<ClockView>
  state(date?: string): Promise<StateView>
  check(date: string, habit: CheckHabit): Promise<StateView>
  /** Remove one recorded check; `index` defaults to the most recent. */
  uncheck(date: string, habit: CheckHabit, index?: number): Promise<StateView>
  setMeal(date: string, slot: MealSlot, options?: MealOptions): Promise<StateView>
  clearMeal(date: string, slot: MealSlot): Promise<StateView>
  setStock(pending: number): Promise<StateView>
  wash(date: string, pieces: number): Promise<StateView>
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
  return {
    clock: () => request<ClockView>('/clock'),
    state: date => request<StateView>(`/state${query({ date })}`),
    check: (date, habit) => request<StateView>('/check', body('POST', { date, habit })),
    uncheck: (date, habit, index) => request<StateView>(
      `/check${query({ date, habit, index })}`,
      { method: 'DELETE' },
    ),
    setMeal: (date, slot, options) => request<StateView>('/meal', body('PUT', {
      date,
      slot,
      ...(options?.at === undefined ? {} : { at: options.at }),
      ...(options?.price === undefined ? {} : { price: options.price }),
    })),
    clearMeal: (date, slot) => request<StateView>(`/meal${query({ date, slot })}`, { method: 'DELETE' }),
    setStock: pending => request<StateView>('/laundry/stock', body('PATCH', { pending })),
    wash: (date, pieces) => request<StateView>('/laundry/wash', body('POST', { date, pieces })),
  }
}
