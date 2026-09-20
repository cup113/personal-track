/**
 * The registry tiles: media (a consumption log) and tasks (a task-shaped
 * registry whose lifecycle state the host derives from progress).
 *
 * Both lists are global — they do not belong to a habit day — so their editor
 * patches a record and the board then re-reads the day it is showing.
 *
 * Editing rule: an optional field the user empties is sent as `null` **only
 * when the record actually had it**, so a patch that leaves a field alone can
 * never silently clear it.
 */
import { useState, type JSX } from 'react'
import type { MediaInput, MediaPatch, TaskInput, TaskPatch } from '../api.ts'
import type { MediaEntry, TaskEntry } from '../types.ts'
import { FieldForm, type FieldSpec } from './fields.tsx'
import { weekEndKey } from './format.ts'
import { IconButton, Tile, TileHead } from './tile.tsx'

/** Which editor, if any, is open. */
type Mode =
  | { readonly kind: 'idle' }
  | { readonly kind: 'add' }
  | { readonly kind: 'edit'; readonly id: string }

/** Fields a media entry exposes. */
const MEDIA_FIELDS: readonly FieldSpec[] = [
  {
    name: 'kind',
    label: '类型',
    kind: 'select',
    defaultValue: 'film',
    options: [{ value: 'film', label: '电影' }, { value: 'book', label: '书' }],
  },
  { name: 'title', label: '名称', kind: 'text' },
  {
    name: 'status',
    label: '状态',
    kind: 'select',
    defaultValue: 'active',
    options: [
      { value: 'active', label: '在看/在读' },
      { value: 'done', label: '完成' },
      { value: 'dropped', label: '弃' },
    ],
  },
  { name: 'rating', label: '评分', kind: 'number', min: 1, max: 5, optional: true, placeholder: '1-5' },
  { name: 'notes', label: '备注', kind: 'text', optional: true },
]

/** Fields a task exposes (progress is flattened for the form). */
const TASK_FIELDS: readonly FieldSpec[] = [
  { name: 'title', label: '事项', kind: 'text' },
  { name: 'category', label: '分类', kind: 'text', optional: true, placeholder: '课程名等' },
  { name: 'due', label: '截止', kind: 'date', optional: true },
  { name: 'current', label: '当前', kind: 'number', min: 0, optional: true },
  { name: 'total', label: '目标量', kind: 'number', min: 1, optional: true },
  { name: 'notes', label: '备注', kind: 'text', optional: true },
]

/**
 * Task fields for a *new* task, whose deadline starts at this week's end.
 *
 * Most homework and chores are due by the weekend, so that is the value worth
 * pre-filling; it stays an ordinary optional date field, freely changed or
 * cleared. Built per render — a module-level default would freeze at import.
 */
function newTaskFields(today: string): readonly FieldSpec[] {
  const weekend = weekEndKey(today)
  return TASK_FIELDS.map(field => (field.name === 'due' ? { ...field, defaultValue: weekend } : field))
}

/** Display text for a media status. */
const MEDIA_STATUS: Record<string, string> = { active: '在列', done: '完成', dropped: '弃' }

/** Display text for a derived task state. */
const TASK_STATE: Record<string, string> = { todo: '待办', doing: '进行中', done: '完成' }

/** A payload for a new media entry; empty optional fields are omitted. */
function mediaInput(payload: Record<string, unknown>): MediaInput {
  return {
    kind: payload.kind === 'book' ? 'book' : 'film',
    title: String(payload.title ?? ''),
    ...(typeof payload.status === 'string' ? { status: payload.status as NonNullable<MediaInput['status']> } : {}),
    ...(typeof payload.rating === 'number' ? { rating: payload.rating } : {}),
    ...(typeof payload.notes === 'string' ? { notes: payload.notes } : {}),
  }
}

/** A media patch; a field the record had and the form emptied is cleared. */
function mediaPatch(payload: Record<string, unknown>, original: MediaEntry): MediaPatch {
  const patch: Record<string, unknown> = {}
  if (typeof payload.kind === 'string') patch.kind = payload.kind
  if (typeof payload.title === 'string') patch.title = payload.title
  if (typeof payload.status === 'string') patch.status = payload.status
  if (typeof payload.rating === 'number') patch.rating = payload.rating
  else if (original.rating !== undefined) patch.rating = null
  if (typeof payload.notes === 'string') patch.notes = payload.notes
  else if (original.notes !== undefined) patch.notes = null
  return patch as MediaPatch
}

/** A payload for a new task; empty optional fields are omitted. */
function taskInput(payload: Record<string, unknown>): TaskInput {
  const progress: { current?: number; total?: number } = {}
  if (typeof payload.current === 'number') progress.current = payload.current
  if (typeof payload.total === 'number') progress.total = payload.total
  return {
    title: String(payload.title ?? ''),
    ...(typeof payload.category === 'string' ? { category: payload.category } : {}),
    ...(typeof payload.due === 'string' ? { due: payload.due } : {}),
    ...(typeof payload.notes === 'string' ? { notes: payload.notes } : {}),
    ...(Object.keys(progress).length === 0 ? {} : { progress }),
  }
}

/** A task patch; emptied fields the record had are cleared, progress merges. */
function taskPatch(payload: Record<string, unknown>, original: TaskEntry): TaskPatch {
  const patch: Record<string, unknown> = {}
  if (typeof payload.title === 'string') patch.title = payload.title
  for (const key of ['category', 'due', 'notes'] as const) {
    const value = payload[key]
    if (typeof value === 'string') patch[key] = value
    else if (original[key] !== undefined) patch[key] = null
  }
  const progress: Record<string, unknown> = {}
  if (typeof payload.current === 'number') progress.current = payload.current
  if (typeof payload.total === 'number') progress.total = payload.total
  else if (original.progress.total !== undefined) progress.total = null
  if (Object.keys(progress).length > 0) patch.progress = progress
  return patch as TaskPatch
}

/** Props for the media tile. */
export interface MediaTileProps {
  readonly media: readonly MediaEntry[]
  readonly busy: boolean
  readonly onAdd: (input: MediaInput) => void
  readonly onPatch: (id: string, patch: MediaPatch) => void
  readonly onRemove: (id: string) => void
}

/** What has been watched and read: a log, written after the fact. */
export function MediaTile({ media, busy, onAdd, onPatch, onRemove }: MediaTileProps): JSX.Element {
  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  const active = media.filter(entry => entry.status === 'active').length

  return (
    <Tile span={2}>
      <TileHead title="影视 / 书籍" meta={media.length === 0 ? '空' : `在列 ${active} · 共 ${media.length}`}>
        <IconButton label="新增记录" disabled={busy} onClick={() => setMode({ kind: 'add' })}>＋</IconButton>
      </TileHead>

      {media.length === 0 && mode.kind === 'idle'
        ? <span className="pt-muted">看完一部、读完一本，随时补记</span>
        : null}

      {media.map(entry => (mode.kind === 'edit' && mode.id === entry.id
        ? (
          <FieldForm
            key={entry.id}
            fields={MEDIA_FIELDS}
            initial={{
              kind: entry.kind,
              title: entry.title,
              status: entry.status,
              rating: entry.rating,
              notes: entry.notes,
            }}
            submitLabel="保存"
            busy={busy}
            onSubmit={(payload) => {
              onPatch(entry.id, mediaPatch(payload, entry))
              setMode({ kind: 'idle' })
            }}
            onCancel={() => setMode({ kind: 'idle' })}
          />
        )
        : (
          <div className="pt-list-row" key={entry.id}>
            <span className="pt-list-text">
              <span className={entry.status === 'done' ? 'pt-badge pt-badge-ok' : 'pt-badge'}>
                {entry.kind === 'film' ? '影' : '书'}
              </span>
              {' '}
              {entry.title}
              {entry.rating === undefined ? null : <span className="pt-muted"> ★{entry.rating}</span>}
              <span className="pt-muted"> · {MEDIA_STATUS[entry.status] ?? entry.status}</span>
            </span>
            <IconButton label="编辑" disabled={busy} onClick={() => setMode({ kind: 'edit', id: entry.id })}>✎</IconButton>
            <IconButton label="删除" disabled={busy} onClick={() => onRemove(entry.id)}>×</IconButton>
          </div>
        )))}

      {mode.kind === 'add'
        ? (
          <FieldForm
            fields={MEDIA_FIELDS}
            submitLabel="记下"
            busy={busy}
            onSubmit={(payload) => {
              onAdd(mediaInput(payload))
              setMode({ kind: 'idle' })
            }}
            onCancel={() => setMode({ kind: 'idle' })}
          />
        )
        : null}
    </Tile>
  )
}

/** Props for the task tile. */
export interface TaskTileProps {
  readonly tasks: readonly TaskEntry[]
  /** The current habit day: what "this week's end" is measured from. */
  readonly today: string
  readonly busy: boolean
  readonly onAdd: (input: TaskInput) => void
  readonly onPatch: (id: string, patch: TaskPatch) => void
  readonly onRemove: (id: string) => void
}

/** Tasks and homework: open items first, with the derived state shown. */
export function TaskTile({ tasks, today, busy, onAdd, onPatch, onRemove }: TaskTileProps): JSX.Element {
  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  const open = tasks.filter(task => task.state !== 'done').length
  const overdue = tasks.filter(task => task.overdue).length
  const ordered = [...tasks].sort((a, b) => {
    const rank = (task: TaskEntry): number => (task.state === 'done' ? 2 : task.overdue ? 0 : 1)
    return rank(a) - rank(b)
  })

  return (
    <Tile span={2}>
      <TileHead title="任务 / 作业" meta={`未完成 ${open}${overdue === 0 ? '' : ` · 逾期 ${overdue}`}`}>
        <IconButton label="新建任务" disabled={busy} onClick={() => setMode({ kind: 'add' })}>＋</IconButton>
      </TileHead>

      {tasks.length === 0 && mode.kind === 'idle' ? <span className="pt-muted">还没有任务</span> : null}

      {ordered.map(task => (mode.kind === 'edit' && mode.id === task.id
        ? (
          <FieldForm
            key={task.id}
            fields={TASK_FIELDS}
            initial={{
              title: task.title,
              category: task.category,
              due: task.due,
              current: task.progress.current,
              total: task.progress.total,
              notes: task.notes,
            }}
            submitLabel="保存"
            busy={busy}
            onSubmit={(payload) => {
              onPatch(task.id, taskPatch(payload, task))
              setMode({ kind: 'idle' })
            }}
            onCancel={() => setMode({ kind: 'idle' })}
          />
        )
        : (
          <div className="pt-list-row" key={task.id}>
            <span className="pt-list-text">
              <span className={
                task.state === 'done'
                  ? 'pt-badge pt-badge-ok'
                  : task.overdue ? 'pt-badge pt-badge-warn' : 'pt-badge'
              }>
                {task.overdue && task.state !== 'done' ? '逾期' : TASK_STATE[task.state] ?? task.state}
              </span>
              {' '}
              {task.title}
              {task.progress.total === undefined
                ? null
                : <span className="pt-muted"> {task.progress.current}/{task.progress.total}</span>}
              {task.category === undefined ? null : <span className="pt-muted"> · {task.category}</span>}
              {task.due === undefined ? null : <span className="pt-muted"> · 截止 {task.due.slice(5)}</span>}
            </span>
            {task.state === 'done'
              ? null
              : (
                <IconButton
                  label="标记完成"
                  disabled={busy}
                  onClick={() => onPatch(task.id, {
                    progress: {
                      current: task.progress.total ?? Math.max(1, task.progress.current + 1),
                    },
                  })}
                >✓</IconButton>
              )}
            <IconButton label="编辑" disabled={busy} onClick={() => setMode({ kind: 'edit', id: task.id })}>✎</IconButton>
            <IconButton label="删除" disabled={busy} onClick={() => onRemove(task.id)}>×</IconButton>
          </div>
        )))}

      {mode.kind === 'add'
        ? (
          <FieldForm
            fields={newTaskFields(today)}
            submitLabel="新建"
            busy={busy}
            onSubmit={(payload) => {
              onAdd(taskInput(payload))
              setMode({ kind: 'idle' })
            }}
            onCancel={() => setMode({ kind: 'idle' })}
          />
        )
        : null}
    </Tile>
  )
}
