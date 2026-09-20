/**
 * The board's date navigator: previous/next habit day, a jump-to-date control
 * for backfill, and the way back to the current habit day.
 *
 * It cannot reach the future — the host decides what "today" is, and a future
 * habit day has nothing to record.
 */
import { useState, type JSX } from 'react'
import { dayLabelOf, shiftKey } from './format.ts'

/** Props for the navigator. */
export interface DateNavProps {
  readonly date: string
  readonly today: string
  /** True while the host sits in the night tail (00:00–boundary). */
  readonly night: boolean
  readonly onChange: (date: string) => void
}

/** Render the navigator. */
export function DateNav({ date, today, night, onChange }: DateNavProps): JSX.Element {
  const [jump, setJump] = useState('')
  const atToday = date >= today
  const isNight = night && date === today

  return (
    <div className="pt-section">
      <div className="pt-nav">
        <button
          className="pt-btn pt-btn-icon"
          title="前一天"
          onClick={() => onChange(shiftKey(date, -1))}
        >‹</button>
        <div className="pt-nav-label">
          {dayLabelOf(date, isNight)}
          {isNight ? <small className="pt-muted"> · 凌晨时段</small> : null}
        </div>
        <button
          className="pt-btn pt-btn-icon"
          title="后一天"
          disabled={atToday}
          onClick={() => onChange(shiftKey(date, 1))}
        >›</button>
        <button
          className="pt-btn"
          disabled={atToday}
          title="回到当前习惯日"
          onClick={() => onChange(today)}
        >今天</button>
      </div>
      <div className="pt-row">
        <input
          className="pt-input pt-grow"
          type="date"
          value={jump === '' ? date : jump}
          max={today}
          onChange={(event) => {
            setJump(event.target.value)
            if (event.target.value !== '') onChange(event.target.value)
          }}
          title="跳转到某一天补卡"
        />
        <span className="pt-muted">{date === today ? '当前习惯日' : '补卡中'}</span>
      </div>
    </div>
  )
}
