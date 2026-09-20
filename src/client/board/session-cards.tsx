/**
 * The generic session list: a header row with an add action, then one row per
 * stored entry that can be edited in place or deleted.
 *
 * Every session-bearing habit (vocabulary, duolingo, jump rope, pull-ups,
 * equipment) is this component plus a field description and a one-line summary,
 * so the editing and deletion behaviour is identical everywhere.
 */
import { useState, type JSX } from 'react'
import { FieldForm, type FieldSpec } from './fields.tsx'

/** A stored session entry: an id plus whatever metrics its kind carries. */
export type SessionEntry = { readonly id: string } & Record<string, unknown>

/** Props for a session list. */
export interface SessionCardProps {
  readonly label: string
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

/** Render the list. */
export function SessionCard({
  label, entries, fields, summarize, busy, addLabel, emptyLabel, onAdd, onPatch, onRemove,
}: SessionCardProps): JSX.Element {
  const [mode, setMode] = useState<{ readonly kind: 'idle' } | { readonly kind: 'add' } | { readonly kind: 'edit'; readonly id: string }>({ kind: 'idle' })

  return (
    <>
      <div className="pt-row">
        <span className="pt-row-label">{label}</span>
        {entries.length === 0 ? <span className="pt-muted">{emptyLabel ?? '无记录'}</span> : null}
        <button
          className="pt-btn pt-btn-primary"
          disabled={busy}
          onClick={() => setMode({ kind: 'add' })}
        >{addLabel ?? '添加'}</button>
      </div>

      {entries.map(entry => (mode.kind === 'edit' && mode.id === entry.id
        ? (
          <FieldForm
            key={entry.id}
            fields={fields}
            initial={entry}
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
          <div className="pt-row pt-entry" key={entry.id}>
            <span className="pt-row-label">{summarize(entry)}</span>
            <button
              className="pt-btn pt-btn-icon"
              title="编辑"
              disabled={busy}
              onClick={() => setMode({ kind: 'edit', id: entry.id })}
            >✎</button>
            <button
              className="pt-btn pt-btn-icon"
              title="删除"
              disabled={busy}
              onClick={() => onRemove(entry.id)}
            >×</button>
          </div>
        )))}

      {mode.kind === 'add'
        ? (
          <FieldForm
            fields={fields}
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
