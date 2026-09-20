/**
 * Backup: the whole `habit` domain as one portable JSON document, and the way
 * back in.
 *
 * A backup holds **stored facts only** — days, the laundry counter, media and
 * tasks (docs/adr/0002-derived-state-not-stored.md). No cell, ratio, streak or
 * overdue flag appears in it, so importing one recomputes all of them from the
 * records themselves; there is nothing in the file that can disagree with the
 * data it came from.
 *
 * The file is validated in full *before* anything is written, so a truncated
 * or hand-edited backup is refused as a whole instead of landing half-applied.
 */
import { z } from 'zod'
import { counterRecord, dayRecord, mediaRecord, taskRecord } from './domain.ts'
import type { HabitDomain } from './domain.ts'
import type { DayKey } from './daykey.ts'

/** Format marker: a file that does not carry it is not a backup of ours. */
export const BACKUP_FORMAT = 'personal-track/backup'

/** Layout version of the file itself; a shape change bumps this. */
export const BACKUP_VERSION = 1

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/** The file layout. Arrays, not maps: each record already carries its own key. */
export const backupBundle = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  /** When the file was written; informational, never applied on import. */
  exportedAt: z.string().min(1),
  days: z.array(dayRecord.extend({ date: z.string().regex(DATE_KEY, 'date must be YYYY-MM-DD') })),
  counters: z.record(z.string(), counterRecord),
  media: z.array(mediaRecord),
  tasks: z.array(taskRecord),
})

/** One parsed backup file. */
export type BackupBundle = z.infer<typeof backupBundle>

/** How an import treats what is already stored. */
export type ImportMode = 'merge' | 'replace'

/** What one import did. */
export interface ImportReport {
  readonly mode: ImportMode
  readonly days: number
  readonly media: number
  readonly tasks: number
  readonly counters: number
  /** Records dropped because `replace` cleared keys the file did not carry. */
  readonly removed: number
}

/** The backup surface the API serves. */
export interface Backup {
  /** Every stored record, ready to be written to a file. */
  exportAll(exportedAt: string): BackupBundle
  /** Validate and apply one bundle; throws {@link BackupFormatError} if invalid. */
  importAll(value: unknown, mode: ImportMode): Promise<ImportReport>
}

/** A bundle that is not a readable backup. Carries the field that gave it away. */
export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupFormatError'
  }
}

/**
 * Parse a candidate backup, or explain why it is not one.
 *
 * @param value - Whatever arrived (a parsed file, a request body).
 * @returns the validated bundle.
 * @throws {BackupFormatError} naming the first offending field.
 */
export function readBackup(value: unknown): BackupBundle {
  const result = backupBundle.safeParse(value)
  if (result.success) return result.data

  // Identity first: "not our file at all" and "a newer layout" deserve their own
  // words, not a field path from the middle of the schema.
  const shape = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
  if (shape === null) throw new BackupFormatError('这不是本插件的备份文件')
  if (shape.format !== BACKUP_FORMAT) {
    throw new BackupFormatError('这不是本插件的备份文件（缺少 format 标记）')
  }
  if (shape.version !== BACKUP_VERSION) {
    throw new BackupFormatError(`备份版本 ${String(shape.version)} 无法读取（当前支持 ${BACKUP_VERSION}）`)
  }

  const issue = result.error.issues[0]
  const path = issue?.path.join('.') ?? ''
  throw new BackupFormatError(
    `备份文件无效：${path === '' ? '' : `${path} `}${issue?.message ?? '格式不符'}`.trim(),
  )
}

/** Build the backup surface over an opened domain. */
export function createBackup(domain: HabitDomain): Backup {
  const days = domain.table('days')
  const counters = domain.table('counters')
  const media = domain.table('media')
  const tasks = domain.table('tasks')

  const byCreatedAt = <T extends { createdAt: string }>(records: T[]): T[] =>
    records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))

  /** Drop every key the incoming set does not carry; count what went. */
  async function prune<K extends string, V>(
    table: { keys(): IterableIterator<K>; delete(key: K): Promise<boolean> },
    incoming: ReadonlySet<K>,
  ): Promise<number> {
    let removed = 0
    for (const key of [...table.keys()]) {
      if (incoming.has(key)) continue
      if (await table.delete(key)) removed += 1
    }
    return removed
  }

  return {
    exportAll(exportedAt) {
      return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt,
        days: [...days.entries()]
          .map(([, record]) => record)
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
        counters: Object.fromEntries(counters.entries()),
        media: byCreatedAt([...media.entries()].map(([, record]) => record)),
        tasks: byCreatedAt([...tasks.entries()].map(([, record]) => record)),
      }
    },

    async importAll(value, mode) {
      // Validation first, and in full: a bad file must not land partially.
      const bundle = readBackup(value)
      const dayKeys = new Set(bundle.days.map(record => record.date as DayKey))
      const counterKeys = new Set(Object.keys(bundle.counters))
      const mediaIds = new Set(bundle.media.map(record => record.id))
      const taskIds = new Set(bundle.tasks.map(record => record.id))

      let removed = 0
      if (mode === 'replace') {
        removed += await prune(days, dayKeys)
        removed += await prune(counters, counterKeys)
        removed += await prune(media, mediaIds)
        removed += await prune(tasks, taskIds)
      }

      for (const record of bundle.days) await days.put(record.date as DayKey, record)
      for (const [key, record] of Object.entries(bundle.counters)) {
        await counters.put(key as 'laundry', record)
      }
      for (const record of bundle.media) await media.put(record.id, record)
      for (const record of bundle.tasks) await tasks.put(record.id, record)

      return {
        mode,
        days: bundle.days.length,
        media: bundle.media.length,
        tasks: bundle.tasks.length,
        counters: counterKeys.size,
        removed,
      }
    },
  }
}
