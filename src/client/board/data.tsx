/**
 * Data in and out: download the whole habit domain as one JSON file, or read
 * one back.
 *
 * Import is two-step on purpose. Picking a file only *parses* it and shows what
 * it holds; nothing is written until a mode is chosen, and the destructive mode
 * (`replace`, which also drops every record the file omits) is labelled as such.
 * The file is validated by the host before any of it is applied.
 */
import { useRef, useState, type JSX } from 'react'
import { HabitApiError, type HabitClient } from '../api.ts'
import type { BackupBundle, ImportMode } from '../types.ts'
import { IconButton, Tile, TileHead } from './tile.tsx'

/** A file bigger than this is refused before it is parsed. */
const MAX_FILE_BYTES = 16 * 1024 * 1024

/** What a parsed file looks like before it is imported. */
interface Staged {
  readonly name: string
  readonly bundle: BackupBundle
}

/** `YYY-MM-DD` from an ISO instant, for the download's name. */
function fileStamp(iso: string): string {
  return iso.slice(0, 10)
}

/** Read a picked file and check it looks like one of ours. */
async function stage(file: File): Promise<Staged> {
  if (file.size > MAX_FILE_BYTES) throw new Error('文件超过 16 MB，可能不是本插件的备份')
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new Error('文件不是合法的 JSON')
  }
  const shape = parsed as Partial<BackupBundle> | null
  if (shape === null || typeof shape !== 'object' || !Array.isArray(shape.days)) {
    throw new Error('这不是本插件的备份文件')
  }
  return { name: file.name, bundle: shape as BackupBundle }
}

/** Props for the data card. */
export interface DataCardProps {
  readonly client: HabitClient
  /** Called after a successful import so the panel can re-read its range. */
  readonly onImported: () => void
}

/** Export the domain, or import one back. */
export function DataCard({ client, onImported }: DataCardProps): JSX.Element {
  const picker = useRef<HTMLInputElement | null>(null)
  const [staged, setStaged] = useState<Staged | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const report = (cause: unknown): void => {
    setError(cause instanceof HabitApiError
      ? `${cause.message}（${cause.code}）`
      : cause instanceof Error ? cause.message : String(cause))
  }

  /** Download the backup the host just built. */
  const download = async (): Promise<void> => {
    setBusy(true)
    try {
      const backup = await client.exportAll()
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `personal-track-${fileStamp(backup.exportedAt)}.json`
      link.click()
      URL.revokeObjectURL(url)
      setError(null)
      setNote(`已导出 ${backup.days.length} 天记录`)
    } catch (cause) {
      report(cause)
    } finally {
      setBusy(false)
    }
  }

  /** Pick a file: parse it, but write nothing yet. */
  const pick = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    setBusy(true)
    try {
      setStaged(await stage(file))
      setError(null)
      setNote(null)
    } catch (cause) {
      setStaged(null)
      report(cause)
    } finally {
      setBusy(false)
    }
  }

  const apply = async (mode: ImportMode): Promise<void> => {
    if (staged === null) return
    setBusy(true)
    try {
      const result = await client.importAll(mode, staged.bundle)
      const { report: done } = result
      setStaged(null)
      setError(null)
      setNote(`导入完成：${done.days} 天、${done.media} 影视书籍、${done.tasks} 任务`
        + (done.removed === 0 ? '' : `，清掉 ${done.removed} 条本地多余记录`))
      onImported()
    } catch (cause) {
      report(cause)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Tile span={2}>
      <TileHead title="数据" meta={staged === null ? undefined : `待导入 ${staged.name}`} />
      <div className="pt-rows">
        <div className="pt-tile-foot">
          <button type="button" className="pt-primary" disabled={busy} onClick={() => void download()}>导出</button>
          <button type="button" className="pt-ghost" disabled={busy} onClick={() => picker.current?.click()}>
            选择备份…
          </button>
          <input
            ref={picker}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0]
              // Reset so picking the same file twice fires again.
              event.target.value = ''
              void pick(file)
            }}
          />
        </div>

        {staged === null ? null : (
          <div className="pt-tile-foot">
            <span className="pt-muted">
              {staged.bundle.days?.length ?? 0} 天、{staged.bundle.media?.length ?? 0} 影视书籍、
              {staged.bundle.tasks?.length ?? 0} 任务
            </span>
            <span className="pt-grow" />
            <button type="button" className="pt-primary" disabled={busy} onClick={() => void apply('merge')}>合并</button>
            <button type="button" className="pt-ghost" disabled={busy} onClick={() => void apply('replace')}>
              覆盖（清空现有）
            </button>
            <IconButton label="取消导入" disabled={busy} onClick={() => setStaged(null)}>×</IconButton>
          </div>
        )}

        {error !== null
          ? <div className="pt-error">{error}</div>
          : (
            <span className="pt-muted">
              {note ?? '合并：文件中的记录覆盖同键项；覆盖：文件里没有的本地记录会被删除'}
            </span>
          )}
      </div>
    </Tile>
  )
}
