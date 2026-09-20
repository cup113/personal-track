/**
 * The completion bar: one small square per cell plus the `n/m` count.
 *
 * A cell is a fraction, not a flag — vocabulary and the tasks due today fill
 * theirs by how far along they are — so each square shows a green fill at that
 * level, and the count keeps a decimal when it needs one.
 */
import type { JSX } from 'react'
import type { Cell } from '../types.ts'
import { fractionText } from './format.ts'

/** Props for the chip. */
export interface ChipProps {
  readonly cells: readonly Cell[]
  readonly progress: { readonly done: number; readonly total: number }
}

/** What one cell reads as in its tooltip. */
function describe(cell: Cell): string {
  const percent = Math.round(cell.value * 100)
  if (percent <= 0) return '未完成'
  if (percent >= 100) return '已完成'
  return `进行中 ${percent}%`
}

/** Render the chip. */
export function Chip({ cells, progress }: ChipProps): JSX.Element {
  return (
    <div className="pt-chip">
      <div className="pt-marks">
        {cells.map(cell => {
          const percent = Math.max(0, Math.min(100, Math.round(cell.value * 100)))
          return (
            <span
              key={cell.id}
              className={percent >= 100 ? 'pt-mark pt-mark-on' : 'pt-mark'}
              title={`${cell.label}：${describe(cell)}`}
            >
              <span className="pt-mark-fill" style={{ width: `${percent}%` }} />
            </span>
          )
        })}
      </div>
      <span className="pt-chip-count">{fractionText(progress.done)}/{progress.total}</span>
    </div>
  )
}
