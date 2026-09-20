/**
 * The habit board's body: the right-sidebar tab's React component.
 *
 * It owns no authoritative state — every read and every mutation answers with a
 * complete slice from the host, and this component simply renders the latest
 * one (docs/adr/0002-derived-state-not-stored.md). Commands arrive through the
 * slot registration's injection face, so the component never sees `ctx`.
 */
import { useCallback, useEffect, useState, type JSX } from 'react'
import { HabitApiError, type HabitClient, type MealSlot } from '../api.ts'
import type { ClockView, Meal, StateView } from '../types.ts'
import { Chip } from './Chip.tsx'
import { DateNav } from './DateNav.tsx'
import { CheckRow, LaundryRow, MealRow, Section, ToggleRow } from './cards.tsx'

/** The meal slots, in the order the board lists them. */
const MEALS: readonly { slot: MealSlot; label: string }[] = [
  { slot: 'breakfast', label: '早饭' },
  { slot: 'lunch', label: '午饭' },
  { slot: 'dinner', label: '晚饭' },
]

/** Props handed in by the slot registration's injection face. */
export interface BoardBodyProps {
  readonly client: HabitClient
}

/** Render the board. */
export function BoardBody({ client }: BoardBodyProps): JSX.Element {
  const [clock, setClock] = useState<ClockView | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const [state, setState] = useState<StateView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const report = useCallback((cause: unknown) => {
    setError(cause instanceof HabitApiError
      ? `${cause.message}（${cause.code}）`
      : cause instanceof Error ? cause.message : String(cause))
  }, [])

  const loadState = useCallback(async (target: string) => {
    try {
      setState(await client.state(target))
      setError(null)
    } catch (cause) {
      report(cause)
    }
  }, [client, report])

  const loadClock = useCallback(async (): Promise<ClockView | null> => {
    try {
      const value = await client.clock()
      setClock(value)
      return value
    } catch (cause) {
      report(cause)
      return null
    }
  }, [client, report])

  // First mount: ask the host what today is, then load that day.
  useEffect(() => {
    let alive = true
    void loadClock().then((value) => {
      if (!alive || value === null) return
      setDate(value.today)
      return loadState(value.today)
    })
    return () => {
      alive = false
    }
  }, [loadClock, loadState])

  // Coming back to the tab may cross the habit-day boundary or see new data.
  useEffect(() => {
    if (date === null) return
    const onFocus = (): void => {
      void loadClock()
      void loadState(date)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [date, loadClock, loadState])

  /** Run one mutation and adopt the slice it answers with. */
  const act = useCallback(async (action: () => Promise<StateView>) => {
    setBusy(true)
    try {
      setState(await action())
      setError(null)
    } catch (cause) {
      report(cause)
    } finally {
      setBusy(false)
    }
  }, [report])

  if (date === null || clock === null) {
    return <div className="pt-board"><div className="pt-muted">加载中…</div></div>
  }

  const day = state?.day
  const record = day?.day
  const pending = state?.stock.pending ?? 0

  const goTo = (target: string): void => {
    setDate(target)
    void loadState(target)
  }

  return (
    <div className="pt-board">
      <DateNav date={date} today={clock.today} night={clock.nightTail} onChange={goTo} />
      {day === undefined ? null : <Chip cells={day.cells} progress={day.progress} />}
      {error === null ? null : <div className="pt-error">{error}</div>}

      <Section title="日常">
        <CheckRow
          label="洗漱"
          times={record?.washes.times ?? []}
          max={2}
          busy={busy}
          onAdd={() => void act(() => client.check(date, 'wash'))}
          onRemove={index => void act(() => client.uncheck(date, 'wash', index))}
        />
        <ToggleRow
          label="洗澡"
          at={record?.shower.at ?? null}
          busy={busy}
          onToggle={next => void act(() => (
            next ? client.check(date, 'shower') : client.uncheck(date, 'shower')
          ))}
        />
        <LaundryRow
          pending={pending}
          busy={busy}
          onDelta={delta => void act(() => client.setStock(Math.max(0, pending + delta)))}
          onWash={pieces => void act(() => client.wash(date, pieces))}
          onSet={value => void act(() => client.setStock(value))}
        />
      </Section>

      <Section title="饮食">
        {MEALS.map(({ slot, label }) => (
          <MealRow
            key={slot}
            label={label}
            meal={record?.meals[slot] as Meal | undefined}
            busy={busy}
            onRecord={options => void act(() => client.setMeal(date, slot, options))}
            onClear={() => void act(() => client.clearMeal(date, slot))}
          />
        ))}
      </Section>
    </div>
  )
}
