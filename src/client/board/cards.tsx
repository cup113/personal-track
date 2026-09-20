/**
 * The board's card primitives: a labelled section, a counted check row, a
 * one-per-day toggle row, the laundry row, and one meal row per slot.
 *
 * All of them are presentational: they render the slice they are given and
 * report intent through callbacks. Nothing here talks to the API or holds the
 * authoritative state.
 */
import { useState, type JSX, type ReactNode } from 'react'
import type { Meal } from '../types.ts'
import { moneyOf, timeOf } from './format.ts'

/** A titled group of rows. */
export function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="pt-section">
      <div className="pt-section-title">{title}</div>
      <div className="pt-card">{children}</div>
    </div>
  )
}

/** Props for a counted check row (washing up, twice a day). */
export interface CheckRowProps {
  readonly label: string
  readonly times: readonly string[]
  readonly max: number
  readonly busy: boolean
  readonly onAdd: () => void
  readonly onRemove: (index: number) => void
}

/** A check habit whose entries are individually removable. */
export function CheckRow({ label, times, max, busy, onAdd, onRemove }: CheckRowProps): JSX.Element {
  return (
    <div className="pt-row">
      <span className="pt-row-label">{label}</span>
      <span className="pt-times">
        {times.length === 0 ? <span className="pt-muted">未打卡</span> : null}
        {times.map((time, index) => (
          <span className="pt-time" key={`${time}:${String(index)}`}>
            {timeOf(time)}
            <button title="撤销这一条" onClick={() => onRemove(index)}>×</button>
          </span>
        ))}
      </span>
      <button
        className="pt-btn pt-btn-primary"
        disabled={busy || times.length >= max}
        onClick={onAdd}
      >打卡</button>
    </div>
  )
}

/** Props for a one-per-day toggle row (showering). */
export interface ToggleRowProps {
  readonly label: string
  readonly at: string | null
  readonly busy: boolean
  readonly onToggle: (next: boolean) => void
}

/** A check habit capped at one entry per day. */
export function ToggleRow({ label, at, busy, onToggle }: ToggleRowProps): JSX.Element {
  const done = at !== null
  return (
    <div className="pt-row">
      <span className="pt-row-label">{label}</span>
      <span className={done ? 'pt-time' : 'pt-muted'}>{done ? timeOf(at) : '未打卡'}</span>
      <button
        className={done ? 'pt-btn' : 'pt-btn pt-btn-primary'}
        disabled={busy}
        onClick={() => onToggle(!done)}
      >{done ? '撤销' : '打卡'}</button>
    </div>
  )
}

/** Props for the laundry row. */
export interface LaundryRowProps {
  readonly pending: number
  readonly busy: boolean
  /** Gauge adjustment: stock only, no wash event. */
  readonly onDelta: (delta: number) => void
  /** A wash happened: decrement the stock and record the event. */
  readonly onWash: (pieces: number) => void
  /** Set the exact stock value: a correction, no event. */
  readonly onSet: (pending: number) => void
}

/**
 * The laundry counter plus its wash action. `＋`/`−` are gauge adjustments
 * (piling up clothes, fixing a miscount) and leave no history; only `洗完`
 * records a washing session.
 */
export function LaundryRow({ pending, busy, onDelta, onWash, onSet }: LaundryRowProps): JSX.Element {
  const [mode, setMode] = useState<'idle' | 'wash' | 'fix'>('idle')
  const [value, setValue] = useState('')

  const open = (next: 'wash' | 'fix'): void => {
    setMode(next)
    setValue(String(pending))
  }

  const confirm = (): void => {
    const entered = Number(value)
    if (Number.isFinite(entered)) {
      const pieces = Math.trunc(entered)
      if (mode === 'wash' && pieces > 0) onWash(pieces)
      if (mode === 'fix' && pieces >= 0) onSet(pieces)
    }
    setMode('idle')
  }

  return (
    <>
      <div className="pt-row">
        <span className="pt-row-label">洗衣</span>
        <span className="pt-muted">待洗</span>
        <span className="pt-count">{pending}</span>
        <span className="pt-stepper">
          <button
            className="pt-btn pt-btn-icon"
            title="减一件（修正，不留记录）"
            disabled={busy || pending <= 0}
            onClick={() => onDelta(-1)}
          >−</button>
          <button
            className="pt-btn pt-btn-icon"
            title="加一件脏衣服（不留记录）"
            disabled={busy}
            onClick={() => onDelta(1)}
          >＋</button>
        </span>
        <button className="pt-btn pt-btn-primary" disabled={busy} onClick={() => open('wash')}>洗完</button>
        <button className="pt-btn" disabled={busy} title="直接设定待洗件数" onClick={() => open('fix')}>修正</button>
      </div>
      {mode === 'idle' ? null : (
        <div className="pt-inline-form">
          <span className="pt-muted">{mode === 'wash' ? '本次洗了几件' : '待洗改为'}</span>
          <input
            className="pt-input"
            type="number"
            min={mode === 'wash' ? 1 : 0}
            value={value}
            onChange={event => setValue(event.target.value)}
          />
          <button className="pt-btn pt-btn-primary" onClick={confirm}>确认</button>
          <button className="pt-btn" onClick={() => setMode('idle')}>取消</button>
        </div>
      )}
    </>
  )
}

/** Props for one meal slot row. */
export interface MealRowProps {
  readonly label: string
  readonly meal: Meal | undefined
  readonly busy: boolean
  /** Record or re-record the slot; `at` preserves the time when editing. */
  readonly onRecord: (options: { at?: string; price?: number }) => void
  readonly onClear: () => void
}

/** One meal slot: tap to stamp the time now, optionally with a price. */
export function MealRow({ label, meal, busy, onRecord, onClear }: MealRowProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [price, setPrice] = useState('')

  if (editing) {
    const submit = (): void => {
      const text = price.trim()
      if (text === '') {
        onRecord(meal?.at === undefined ? {} : { at: meal.at })
      } else {
        const parsed = Number(text)
        if (Number.isFinite(parsed)) {
          onRecord(meal?.at === undefined ? { price: parsed } : { at: meal.at, price: parsed })
        }
      }
      setEditing(false)
    }
    return (
      <div className="pt-inline-form">
        <span className="pt-muted">{label}价格</span>
        <input
          className="pt-input"
          type="number"
          min={0}
          step={0.5}
          placeholder="留空即清除"
          value={price}
          onChange={event => setPrice(event.target.value)}
        />
        <button className="pt-btn pt-btn-primary" onClick={submit}>确认</button>
        <button className="pt-btn" onClick={() => setEditing(false)}>取消</button>
      </div>
    )
  }

  return (
    <div className="pt-row">
      <span className="pt-row-label">{label}</span>
      {meal === undefined
        ? <span className="pt-muted">未打卡</span>
        : (
          <>
            <span className="pt-time">{timeOf(meal.at)}</span>
            {meal.price === undefined ? null : <span className="pt-muted">{moneyOf(meal.price)}</span>}
          </>
        )}
      {meal === undefined
        ? (
          <button className="pt-btn pt-btn-primary" disabled={busy} onClick={() => onRecord({})}>打卡</button>
        )
        : (
          <>
            <button
              className="pt-btn"
              disabled={busy}
              title="记录或清除价格"
              onClick={() => {
                setPrice(meal.price === undefined ? '' : String(meal.price))
                setEditing(true)
              }}
            >价格</button>
            <button className="pt-btn" disabled={busy} title="清除本槽" onClick={onClear}>×</button>
          </>
        )}
    </div>
  )
}
