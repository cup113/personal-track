/**
 * The generic session list: a sub-header with an add action, then one row per
 * stored entry that can be edited in place (time and metrics) or deleted.
 *
 * Every session-bearing habit — vocabulary, duolingo, jump rope, pull-ups,
 * equipment — is this list plus a field description and a one-line summary, so
 * the editing behaviour is identical everywhere. The clock-time field is added
 * here, which is why every session can be retimed without extra code.
 */
import { useState, type JSX } from 'react'
import { FieldForm, type FieldSpec } from './fields.tsx'
import { timeField, timeValueOf } from './format.ts'
import { IconButton, Tile, TileHead } from './tile.tsx'

/** A stored session entry: an id plus whatever metrics its kind carries. */
export type SessionEntry = { readonly id: string } & Record<string, unknown>

/** Props for the list (and for the tile that wraps it). */
export interface SessionListProps {
  /** Heading shown in the list's own sub-header. */
  readonly title: string
  readonly entries: readonly SessionEntry[]
  readonly fields: readonly FieldSpec[]
  /** One line describing an entry, e.g. `07:12 · 30 分钟`. */
  readonly summarize: (entry: SessionEntry) => string
  readonly busy: boolean
  readonly addLabel?: string
  readonly emptyLabel?: string
  readonly onAdd: (payload: Record<string, unknown>) => void
  readonly onPatch: (id: string, payload: Record<string, unknown>) => void
  readonly onRemove: (id: string) => void
}

type Mode =
  | { readonly kind: 'idle' }
  | { readonly kind: 'add' }
  | { readonly kind: 'edit'; readonly id: string }

/** The list without a tile, so it can live inside another tile. */
export function SessionList({
  title, entries, fields, summarize, busy, addLabel, emptyLabel, onAdd, onPatch, onRemove,
}: SessionListProps): JSX.Element {
  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  // Built per render so the add form opens on the current clock time; an entry
  // being edited overrides it through `initial` below.
  const allFields: readonly FieldSpec[] = [timeField(), ...fields]

  return (
    <>
      <div className="pt-sub-head">
        <span className="pt-sub-title">{title}</span>
        {entries.length === 0 ? <span className="pt-muted">{emptyLabel ?? '无记录'}</span> : null}
        <IconButton label={addLabel ?? '添加'} disabled={busy} onClick={() => setMode({ kind: 'add' })}>＋</IconButton>
      </div>

      {entries.map(entry => (mode.kind === 'edit' && mode.id === entry.id
        ? (
          <FieldForm
            key={entry.id}
            fields={allFields}
            initial={{ time: timeValueOf(String(entry.at ?? '')), ...entry }}
            submitLabel="保存"
            busy={busy}
            onSubmit={(payload) => {
              onPatch(entry.id, payload)
              setMode({ kind: 'idle' })
            }}
            onCancel={() => setMode({ kind: 'idle' })}
          />
        )
        : (
          <div className="pt-list-row" key={entry.id}>
            <span className="pt-list-text">{summarize(entry)}</span>
            <IconButton label="编辑" disabled={busy} onClick={() => setMode({ kind: 'edit', id: entry.id })}>✎</IconButton>
            <IconButton label="删除" disabled={busy} onClick={() => onRemove(entry.id)}>×</IconButton>
          </div>
        )))}

      {mode.kind === 'add'
        ? (
          <FieldForm
            fields={allFields}
            submitLabel="添加"
            busy={busy}
            onSubmit={(payload) => {
              onAdd(payload)
              setMode({ kind: 'idle' })
            }}
            onCancel={() => setMode({ kind: 'idle' })}
          />
        )
        : null}
    </>
  )
}

/** The list as its own full-width tile. */
export function SessionTile({ label, title, ...list }: SessionListProps & { readonly label: string }): JSX.Element {
  return (
    <Tile span={2}>
      <TileHead title={label} meta={`${list.entries.length} 条`} />
      <SessionList title={title} {...list} />
    </Tile>
  )
}
