/**
 * The training cards: running (single-valued, with derived pace), jump rope
 * (fixed-count sets), pull-ups (support time) and gym equipment.
 */
import { useState, type JSX } from 'react'
import type { EquipmentSession, PullupSession, RopeSession } from '../types.ts'
import { FieldForm, type FieldSpec } from './fields.tsx'
import { paceLabel, paceOf, timeOf } from './format.ts'
import { SessionCard, type SessionEntry } from './session-cards.tsx'

/** Fields for the single running entry; the duration starts from config. */
function runFields(defaultMinutes: number): readonly FieldSpec[] {
  return [
    { name: 'minutes', label: '时长(分)', kind: 'number', min: 1, defaultValue: String(defaultMinutes) },
    { name: 'distanceKm', label: '里程(km)', kind: 'number', step: 0.01, min: 0 },
    { name: 'avgHr', label: '平均心率', kind: 'number', min: 1, optional: true },
  ]
}

/** Fields for one jump-rope set. */
const ROPE_FIELDS: readonly FieldSpec[] = [
  {
    name: 'preset',
    label: '定数',
    kind: 'select',
    numericOptions: true,
    defaultValue: '90',
    options: [{ value: '90', label: '90' }, { value: '180', label: '180' }],
  },
  { name: 'seconds', label: '用时(秒)', kind: 'number', min: 1 },
  { name: 'avgHr', label: '心率', kind: 'number', min: 1, optional: true },
]

/** Fields for one pull-up set. */
const PULLUP_FIELDS: readonly FieldSpec[] = [
  { name: 'seconds', label: '支撑(秒)', kind: 'number', min: 0 },
]

/** Fields for one equipment set. */
const EQUIPMENT_FIELDS: readonly FieldSpec[] = [
  { name: 'name', label: '器材', kind: 'text' },
  { name: 'reps', label: '动作数', kind: 'number', min: 0 },
  { name: 'weight', label: '重量(kg)', kind: 'number', step: 0.5, min: 0, optional: true },
]

/** Props for the running card. */
export interface RunCardProps {
  readonly run: {
    readonly at: string
    readonly minutes: number
    readonly distanceKm: number
    readonly avgHr?: number
  } | null
  readonly defaultMinutes: number
  readonly busy: boolean
  readonly onSet: (payload: Record<string, unknown>) => void
  readonly onClear: () => void
}

/** Running: at most one entry a day, with pace derived for display. */
export function RunCard({ run, defaultMinutes, busy, onSet, onClear }: RunCardProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  const fields = runFields(defaultMinutes)

  if (editing) {
    return (
      <FieldForm
        fields={fields}
        initial={run ?? undefined}
        submitLabel="保存"
        busy={busy}
        onSubmit={(payload) => {
          onSet(payload)
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  if (run === null) {
    return (
      <div className="pt-row">
        <span className="pt-row-label">跑步</span>
        <span className="pt-muted">未记录</span>
        <button className="pt-btn pt-btn-primary" disabled={busy} onClick={() => setEditing(true)}>记录</button>
      </div>
    )
  }

  return (
    <div className="pt-row pt-entry">
      <span className="pt-row-label">
        {run.distanceKm} km · {run.minutes} 分 · {paceLabel(paceOf(run.minutes, run.distanceKm))}
        {run.avgHr === undefined ? '' : ` · ♥${run.avgHr}`}
        <span className="pt-muted"> {timeOf(run.at)}</span>
      </span>
      <button className="pt-btn pt-btn-icon" title="编辑" disabled={busy} onClick={() => setEditing(true)}>✎</button>
      <button className="pt-btn pt-btn-icon" title="删除" disabled={busy} onClick={onClear}>×</button>
    </div>
  )
}

/** Handlers a session list needs, shared by the three repetitive habits. */
export interface SessionHandlers {
  readonly busy: boolean
  readonly onAdd: (payload: Record<string, unknown>) => void
  readonly onPatch: (id: string, payload: Record<string, unknown>) => void
  readonly onRemove: (id: string) => void
}

/** Jump rope: 90 or 180 count sets, any number a day. */
export function RopeCard({ sessions, ...handlers }: SessionHandlers & { readonly sessions: readonly RopeSession[] }): JSX.Element {
  return (
    <SessionCard
      label="跳绳"
      entries={sessions as readonly SessionEntry[]}
      fields={ROPE_FIELDS}
      summarize={entry => `${Number(entry.preset)} 定数 · ${Number(entry.seconds)}s${entry.avgHr === undefined ? '' : ` · ♥${Number(entry.avgHr)}`} · ${timeOf(String(entry.at ?? ''))}`}
      addLabel="加一组"
      emptyLabel="无记录"
      {...handlers}
    />
  )
}

/** Pull-ups: support time per set. */
export function PullupCard({ sessions, ...handlers }: SessionHandlers & { readonly sessions: readonly PullupSession[] }): JSX.Element {
  return (
    <SessionCard
      label="引体向上"
      entries={sessions as readonly SessionEntry[]}
      fields={PULLUP_FIELDS}
      summarize={entry => `支撑 ${Number(entry.seconds)}s · ${timeOf(String(entry.at ?? ''))}`}
      addLabel="加一组"
      emptyLabel="无记录"
      {...handlers}
    />
  )
}

/** Gym equipment: name, total reps, optional weight. */
export function EquipmentCard({ sessions, ...handlers }: SessionHandlers & { readonly sessions: readonly EquipmentSession[] }): JSX.Element {
  return (
    <SessionCard
      label="健身器材"
      entries={sessions as readonly SessionEntry[]}
      fields={EQUIPMENT_FIELDS}
      summarize={entry => `${String(entry.name)} · ${Number(entry.reps)} 次${entry.weight === undefined ? '' : ` · ${Number(entry.weight)}kg`} · ${timeOf(String(entry.at ?? ''))}`}
      addLabel="加一组"
      emptyLabel="无记录"
      {...handlers}
    />
  )
}
