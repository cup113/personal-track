/**
 * The completion chip: eight cells as dots plus the `n/8` count.
 */
import type { JSX } from 'react'
import type { Cell } from '../types.ts'
import { CELL_LABELS } from './format.ts'

/** Props for the chip. */
export interface ChipProps {
  readonly cells: readonly Cell[]
  readonly progress: { readonly done: number; readonly total: number }
}

/** Render the chip. */
export function Chip({ cells, progress }: ChipProps): JSX.Element {
  return (
    <div className="pt-chip">
      <div className="pt-dots">
        {cells.map(cell => (
          <span
            key={cell.id}
            className={cell.done ? 'pt-dot pt-dot-on' : 'pt-dot'}
            title={`${CELL_LABELS[cell.id] ?? cell.id}：${cell.done ? '已完成' : '未完成'}`}
          />
        ))}
      </div>
      <span className="pt-chip-count">{progress.done}/{progress.total}</span>
    </div>
  )
}
