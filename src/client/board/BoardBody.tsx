/**
 * The habit board's body: the right-sidebar tab's React component.
 *
 * It owns no authoritative state — every read and every mutation answers with a
 * complete slice from the host, and this component renders the latest one
 * (docs/adr/0002-derived-state-not-stored.md). Commands arrive through the slot
 * registration's injection face, so the component never sees `ctx`.
 *
 * Layout: a progress strip, the date navigator, category pills, then a two
 * column grid of tiles. Picking a category collapses the board to that group,
 * which is what keeps a long habit list readable in a ~300px column.
 */
import { useCallback, useEffect, useState, type JSX } from 'react'
import {
  HabitApiError,
  type HabitClient,
  type MediaInput,
  type MediaPatch,
  type SessionKind,
  type TaskInput,
  type TaskPatch,
} from '../api.ts'
import type { ClockView, StateView, VocabProgress } from '../types.ts'
import { CheckTile, LaundryTile, MealBoard, ShowerTile } from './cards.tsx'
import { Chip } from './Chip.tsx'
import { DateNav } from './DateNav.tsx'
import { EquipmentCard, PullupCard, RopeCard, RunTile } from './fitness.tsx'
import { MediaTile, TaskTile } from './registry.tsx'
import { DuolingoCard, VocabCard } from './study.tsx'
import { GroupHeader, Pills, ProgressRing, Tile, TileHead } from './tile.tsx'

/** Shown until the first slice arrives. */
const EMPTY_VOCAB: VocabProgress = {
  doneNew: 0, doneReview: 0, targetNew: 0, targetReview: 0,
  minutes: 0, ratio: 0, surplusNew: 0, surplusReview: 0, met: false,
}

/** The board's category filter. */
type Category = 'all' | 'daily' | 'food' | 'study' | 'fitness' | 'records'

const CATEGORIES: readonly { readonly value: Category; readonly label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'daily', label: '日常' },
  { value: 'food', label: '饮食' },
  { value: 'study', label: '学习' },
  { value: 'fitness', label: '健身' },
  { value: 'records', label: '记录' },
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
  const [category, setCategory] = useState<Category>('all')

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
  const record = day?.day ?? null
  const pending = state?.stock.pending ?? 0
  const show = (group: Category): boolean => category === 'all' || category === group

  const goTo = (target: string): void => {
    setDate(target)
    void loadState(target)
  }

  /** The handlers every session list shares, bound to one habit kind. */
  const sessionHandlers = (kind: SessionKind) => ({
    busy,
    onAdd: (payload: Record<string, unknown>) => void act(() => client.addSession(date, kind, payload)),
    onPatch: (id: string, payload: Record<string, unknown>) =>
      void act(() => client.patchSession(date, kind, id, payload)),
    onRemove: (id: string) => void act(() => client.removeSession(date, kind, id)),
  })
  const vocabSessions = sessionHandlers('vocab')

  /** Registry writes answer with the list, so re-read the shown day after. */
  const registryAct = (action: () => Promise<unknown>): void => void act(async () => {
    await action()
    return await client.state(date)
  })

  return (
    <div className="pt-board">
      <div className="pt-strip">
        <ProgressRing
          ratio={day === undefined || day.progress.total === 0 ? 0 : day.progress.done / day.progress.total}
          label={`${day?.progress.done ?? 0}/${day?.progress.total ?? 8}`}
          sub="今日"
        />
        {day === undefined ? null : <Chip cells={day.cells} progress={day.progress} />}
      </div>

      <DateNav date={date} today={clock.today} night={clock.nightTail} onChange={goTo} />
      {error === null ? null : <div className="pt-error">{error}</div>}
      <Pills value={category} options={CATEGORIES} onChange={setCategory} />

      <div className="pt-grid">
        {show('daily') ? (
          <>
            <GroupHeader label="日常" hint="每日重置" />
            <CheckTile
              label="洗漱"
              times={record?.washes.times ?? []}
              max={2}
              busy={busy}
              onCheck={() => void act(() => client.check(date, 'wash'))}
              onEdit={(index, time) => void act(() => client.editCheck(date, 'wash', index, time))}
              onRemove={index => void act(() => client.uncheck(date, 'wash', index))}
            />
            <ShowerTile
              at={record?.shower.at ?? null}
              busy={busy}
              onCheck={() => void act(() => client.check(date, 'shower'))}
              onUndo={() => void act(() => client.uncheck(date, 'shower'))}
              onEdit={time => void act(() => client.editCheck(date, 'shower', undefined, time))}
            />
            <LaundryTile
              pending={pending}
              busy={busy}
              onDelta={delta => void act(() => client.setStock(Math.max(0, pending + delta)))}
              onWash={(pieces, time) => void act(() => client.wash(date, pieces, time))}
              onSet={value => void act(() => client.setStock(value))}
            />
          </>
        ) : null}

        {show('food') ? (
          <>
            <GroupHeader label="饮食" hint="每日重置" />
            <MealBoard
              meals={record?.meals ?? {}}
              busy={busy}
              onRecord={(slot, options) => void act(() => client.setMeal(date, slot, options))}
              onClear={slot => void act(() => client.clearMeal(date, slot))}
            />
          </>
        ) : null}

        {show('study') ? (
          <>
            <GroupHeader label="学习" hint="目标每日重置" />
            <VocabCard
              target={day?.target ?? clock.config.defaultVocabTarget}
              progress={day?.vocab ?? EMPTY_VOCAB}
              sessions={record?.vocab?.sessions ?? []}
              busy={busy}
              onTarget={target => void act(() => client.setVocabTarget(date, target))}
              onAdd={vocabSessions.onAdd}
              onPatch={vocabSessions.onPatch}
              onRemove={vocabSessions.onRemove}
            />
            <DuolingoCard lessons={record?.duolingo ?? []} {...sessionHandlers('duolingo')} />
          </>
        ) : null}

        {show('fitness') ? (
          <>
            <GroupHeader label="健身" />
            <RunTile
              run={record?.run ?? null}
              defaultMinutes={clock.config.defaultRunMinutes}
              busy={busy}
              onSet={payload => void act(() => client.setRun(date, {
                distanceKm: Number(payload.distanceKm),
                ...(payload.minutes === undefined ? {} : { minutes: Number(payload.minutes) }),
                ...(payload.avgHr === undefined ? {} : { avgHr: Number(payload.avgHr) }),
                ...(typeof payload.time === 'string' ? { time: payload.time } : {}),
              }))}
              onClear={() => void act(() => client.clearRun(date))}
            />
            <RopeCard sessions={record?.rope ?? []} {...sessionHandlers('rope')} />
            <PullupCard sessions={record?.pullup ?? []} {...sessionHandlers('pullup')} />
            <EquipmentCard sessions={record?.equipment ?? []} {...sessionHandlers('equipment')} />
          </>
        ) : null}

        {show('records') ? (
          <>
            <GroupHeader label="记录" hint="跨日保留" />
            <MediaTile
              media={state?.media ?? []}
              busy={busy}
              onAdd={(input: MediaInput) => registryAct(() => client.addMedia(input))}
              onPatch={(id, patch: MediaPatch) => registryAct(() => client.patchMedia(id, patch))}
              onRemove={id => registryAct(() => client.removeMedia(id))}
            />
            <TaskTile
              tasks={state?.tasks ?? []}
              busy={busy}
              onAdd={(input: TaskInput) => registryAct(() => client.addTask(input))}
              onPatch={(id, patch: TaskPatch) => registryAct(() => client.patchTask(id, patch))}
              onRemove={id => registryAct(() => client.removeTask(id))}
            />
          </>
        ) : null}

        {record === null ? (
          <Tile span={2}>
            <TileHead title="这一天还没有记录" />
            <div className="pt-tile-foot">
              <span className="pt-muted">从上面任意一项开始打卡即可</span>
            </div>
          </Tile>
        ) : null}
      </div>
    </div>
  )
}
