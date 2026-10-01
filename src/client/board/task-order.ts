/**
 * The one order the task registry is read in.
 *
 * The board's tile and the daily report's remaining-task list both sort with
 * this comparator, so the export can never read in an order the screen does not
 * show. It is a pure function of the entries — no day, no clock — because a
 * task belongs to the registry rather than to a habit day.
 */
import type { TaskEntry } from '../types.ts'

/**
 * Unfinished first, each group by deadline ascending, and whatever has no
 * deadline last. What is due soonest is what you must look at, and finished
 * items sink out of the way without disappearing.
 */
export function byDeadline(a: TaskEntry, b: TaskEntry): number {
  const finished = (task: TaskEntry): number => (task.state === 'done' ? 1 : 0)
  if (finished(a) !== finished(b)) return finished(a) - finished(b)
  if (a.due === undefined || b.due === undefined) {
    if (a.due !== b.due) return a.due === undefined ? 1 : -1
    // Two undated tasks: newest first, as the list arrives.
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
  }
  return a.due < b.due ? -1 : a.due > b.due ? 1 : 0
}
