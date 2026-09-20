/**
 * The daily cards: counted checks, the one-a-day toggle, the laundry counter
 * and the three meal slots. Each is a tile; nothing here talks to the API.
 */
import { useState, type JSX } from 'react'
import type { MealSlot } from '../api.ts'
import type { DayRecord } from '../types.ts'
import { FieldForm, type FieldSpec } from './fields.tsx'
import { TIME_FIELD, moneyOf, timeOf, timeValueOf } from './format.ts'
import { IconButton, Tile, TileHead, TimeChip, TimeEditor } from './tile.tsx'

/** Fields one meal slot exposes when edited. */
const MEAL_EDIT_FIELDS: readonly FieldSpec[] = [
  TIME_FIELD,
  { name: 'price', label: '价格', kind: 'number', step: 0.5, min: 0, optional: true, placeholder: '可留空' },
]

/** Props for a counted check tile (washing up, twice a day). */
export interface CheckTileProps {
  readonly label: string
  readonly times: readonly string[]
  readonly max: number
  readonly busy: boolean
  readonly onCheck: () => void
  readonly onEdit: (index: number, time: string) => void
  readonly onRemove: (index: number) => void
}

/** A check habit whose entries are individually retimable and removable. */
export function CheckTile({ label, times, max, busy, onCheck, onEdit, onRemove }: CheckTileProps): JSX.Element {
  const [editing, setEditing] = useState<number | null>(null)
  const done = times.length >= max
  return (
    <Tile tone={done ? 'done' : 'idle'}>
      <TileHead title={label} meta={`${times.length}/${max}`} />
      {editing === null ? (
        <>
          <div className="pt-chips">
            {times.length === 0 ? <span className="pt-muted">未打卡</span> : null}
            {times.map((instant, index) => (
              <TimeChip
                key={`${instant}:${String(index)}`}
                instant={instant}
                busy={busy}
                onEdit={() => setEditing(index)}
                onRemove={() => onRemove(index)}
              />
            ))}
          </div>
          <div className="pt-tile-foot">
            <button type="button" className="pt-primary" disabled={busy || done} onClick={onCheck}>打卡</button>
          </div>
        </>
      ) : (
        <TimeEditor
          instant={times[editing]}
          busy={busy}
          onSubmit={(time) => {
            onEdit(editing, time)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </Tile>
  )
}

/** Props for the shower tile. */
export interface ShowerTileProps {
  readonly at: string | null
  readonly busy: boolean
  readonly onCheck: () => void
  readonly onUndo: () => void
  readonly onEdit: (time: string) => void
}

/** A check habit capped at one entry a day. */
export function ShowerTile({ at, busy, onCheck, onUndo, onEdit }: ShowerTileProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  return (
    <Tile tone={at === null ? 'idle' : 'done'}>
      <TileHead title="洗澡" meta={at === null ? '未打卡' : '已完成'} />
      {editing ? (
        <TimeEditor
          instant={at}
          busy={busy}
          onSubmit={(time) => {
            onEdit(time)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="pt-chips">
            {at === null
              ? <span className="pt-muted">每天至多一次</span>
              : <TimeChip instant={at} busy={busy} onEdit={() => setEditing(true)} onRemove={onUndo} />}
          </div>
          <div className="pt-tile-foot">
            <button type="button" className="pt-primary" disabled={busy || at !== null} onClick={onCheck}>打卡</button>
          </div>
        </>
      )}
    </Tile>
  )
}

/** Props for the laundry tile. */
export interface LaundryTileProps {
  readonly pending: number
  readonly busy: boolean
  /** Gauge adjustment: stock only, no wash event. */
  readonly onDelta: (delta: number) => void
  /** A wash happened: decrement the stock and record the event. */
  readonly onWash: (pieces: number, time?: string) => void
  /** Set the exact stock value: a correction, no event. */
  readonly onSet: (pending: number) => void
}

/**
 * The laundry counter plus its wash action. `＋`/`−` adjust the gauge (piling
 * up clothes, fixing a miscount) and leave no history; only `洗完` records a
 * washing session, with the hour it happened.
 */
export function LaundryTile({ pending, busy, onDelta, onWash, onSet }: LaundryTileProps): JSX.Element {
  const [mode, setMode] = useState<'idle' | 'wash' | 'fix'>('idle')

  return (
    <Tile span={2}>
      <TileHead title="洗衣" meta={`待洗 ${pending}`}>
        <IconButton label="加一件脏衣服" disabled={busy} onClick={() => onDelta(1)}>＋</IconButton>
        <IconButton label="减一件（修正）" disabled={busy || pending <= 0} onClick={() => onDelta(-1)}>−</IconButton>
      </TileHead>
      {mode === 'idle' ? (
        <div className="pt-tile-foot">
          <span className="pt-big">{pending}</span>
          <span className="pt-muted">件待洗</span>
          <span className="pt-grow" />
          <button
            type="button"
            className="pt-primary"
            disabled={busy || pending <= 0}
            onClick={() => setMode('wash')}
          >洗完</button>
          <button type="button" className="pt-ghost" disabled={busy} onClick={() => setMode('fix')}>修正</button>
        </div>
      ) : mode === 'wash' ? (
        <FieldForm
          fields={[
            { name: 'pieces', label: '洗了几件', kind: 'number', min: 1, defaultValue: String(pending) },
            TIME_FIELD,
          ]}
          submitLabel="记下这次洗涤"
          busy={busy}
          onSubmit={(payload) => {
            onWash(Number(payload.pieces), typeof payload.time === 'string' ? payload.time : undefined)
            setMode('idle')
          }}
          onCancel={() => setMode('idle')}
        />
      ) : (
        <FieldForm
          fields={[{ name: 'pending', label: '待洗改为', kind: 'number', min: 0, defaultValue: String(pending) }]}
          submitLabel="修正"
          busy={busy}
          onSubmit={(payload) => {
            onSet(Number(payload.pending))
            setMode('idle')
          }}
          onCancel={() => setMode('idle')}
        />
      )}
    </Tile>
  )
}

/** The three meal slots, in the order the board lists them. */
const MEAL_SLOTS: readonly { readonly slot: MealSlot; readonly label: string }[] = [
  { slot: 'breakfast', label: '早饭' },
  { slot: 'lunch', label: '午饭' },
  { slot: 'dinner', label: '晚饭' },
]

/** Props for the meal board. */
export interface MealBoardProps {
  readonly meals: DayRecord['meals']
  readonly busy: boolean
  readonly onRecord: (slot: MealSlot, options: { time?: string; price?: number }) => void
  readonly onClear: (slot: MealSlot) => void
}

/** Three compact cells: tap to stamp the time now, ✎ to retime or price it. */
export function MealBoard({ meals, busy, onRecord, onClear }: MealBoardProps): JSX.Element {
  const [editing, setEditing] = useState<MealSlot | null>(null)
  const recorded = MEAL_SLOTS.filter(({ slot }) => meals[slot] !== undefined).length

  return (
    <Tile span={2} tone={recorded === MEAL_SLOTS.length ? 'done' : 'idle'}>
      <TileHead title="三餐" meta={`${recorded}/3`} />
      {editing === null ? (
        <div className="pt-cells">
          {MEAL_SLOTS.map(({ slot, label }) => {
            const meal = meals[slot]
            return (
              <div key={slot} className={meal === undefined ? 'pt-cell' : 'pt-cell pt-cell-done'}>
                <span className="pt-cell-label">{label}</span>
                <span className="pt-cell-value">{meal === undefined ? '——' : timeOf(meal.at)}</span>
                <span className="pt-cell-sub">{meal?.price === undefined ? '' : moneyOf(meal.price)}</span>
                <span className="pt-cell-actions">
                  {meal === undefined
                    ? (
                      <button
                        type="button"
                        className="pt-primary pt-small"
                        disabled={busy}
                        onClick={() => onRecord(slot, {})}
                      >打卡</button>
                    )
                    : (
                      <>
                        <IconButton label="修改时间与价格" disabled={busy} onClick={() => setEditing(slot)}>✎</IconButton>
                        <IconButton label="清除这一餐" disabled={busy} onClick={() => onClear(slot)}>×</IconButton>
                      </>
                    )}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <FieldForm
          fields={MEAL_EDIT_FIELDS}
          initial={{ time: timeValueOf(meals[editing]?.at), price: meals[editing]?.price }}
          submitLabel="保存"
          busy={busy}
          onSubmit={(payload) => {
            onRecord(editing, {
              ...(typeof payload.time === 'string' ? { time: payload.time } : {}),
              ...(typeof payload.price === 'number' ? { price: payload.price } : {}),
            })
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </Tile>
  )
}
