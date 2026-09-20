/**
 * The study cards: vocabulary (a quantity target plus its sessions) and
 * duolingo (a presence target: one lesson satisfies the day).
 */
import { useState, type JSX } from 'react'
import type { Lesson, VocabProgress, VocabSession } from '../types.ts'
import { FieldForm, type FieldSpec } from './fields.tsx'
import { timeOf } from './format.ts'
import { SessionCard, type SessionEntry } from './session-cards.tsx'

/** Metrics one vocabulary session carries. */
const VOCAB_FIELDS: readonly FieldSpec[] = [
  { name: 'new', label: '新词', kind: 'number', min: 0 },
  { name: 'review', label: '复习', kind: 'number', min: 0 },
  { name: 'minutes', label: '用时(分)', kind: 'number', min: 0 },
]

/** Metrics one lesson carries. */
const LESSON_FIELDS: readonly FieldSpec[] = [
  { name: 'minutes', label: '用时(分)', kind: 'number', min: 0 },
]

/** Props for the vocabulary card. */
export interface VocabCardProps {
  readonly target: { readonly new: number; readonly review: number }
  readonly progress: VocabProgress
  readonly sessions: readonly VocabSession[]
  readonly busy: boolean
  readonly onTarget: (target: { new: number; review: number }) => void
  readonly onAdd: (payload: Record<string, unknown>) => void
  readonly onPatch: (id: string, payload: Record<string, unknown>) => void
  readonly onRemove: (id: string) => void
}

/**
 * Vocabulary: progress against today's snapshot, an editor for that snapshot,
 * and the sessions the progress is derived from.
 */
export function VocabCard({
  target, progress, sessions, busy, onTarget, onAdd, onPatch, onRemove,
}: VocabCardProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  const surplus = progress.surplusNew + progress.surplusReview
  const percent = Math.round(progress.ratio * 100)

  return (
    <>
      <div className="pt-row">
        <span className="pt-row-label">背单词</span>
        <span className="pt-muted">
          新 {progress.doneNew}/{progress.targetNew} · 复 {progress.doneReview}/{progress.targetReview} · {progress.minutes}分
        </span>
        <button
          className="pt-btn pt-btn-icon"
          title="改这一天的目标"
          disabled={busy}
          onClick={() => setEditing(value => !value)}
        >✎</button>
      </div>

      <div className="pt-bar">
        <div className="pt-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      {surplus === 0 ? null : (
        <div className="pt-row pt-entry">
          <span className="pt-muted">超额 · 新 {progress.surplusNew} · 复 {progress.surplusReview}</span>
        </div>
      )}

      {editing ? (
        <FieldForm
          fields={[
            { name: 'new', label: '新词目标', kind: 'number', min: 0, defaultValue: String(target.new) },
            { name: 'review', label: '复习目标', kind: 'number', min: 0, defaultValue: String(target.review) },
          ]}
          submitLabel="保存目标"
          busy={busy}
          onSubmit={(payload) => {
            onTarget({ new: Number(payload.new), review: Number(payload.review) })
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : null}

      <SessionCard
        label="学习记录"
        entries={sessions as readonly SessionEntry[]}
        fields={VOCAB_FIELDS}
        summarize={entry => `${timeOf(String(entry.at ?? ''))} · 新 ${Number(entry.new)} 复 ${Number(entry.review)} · ${Number(entry.minutes)}分`}
        busy={busy}
        addLabel="加一次"
        onAdd={onAdd}
        onPatch={onPatch}
        onRemove={onRemove}
      />
    </>
  )
}

/** Props for the duolingo card. */
export interface DuolingoCardProps {
  readonly lessons: readonly Lesson[]
  readonly busy: boolean
  readonly onAdd: (payload: Record<string, unknown>) => void
  readonly onPatch: (id: string, payload: Record<string, unknown>) => void
  readonly onRemove: (id: string) => void
}

/** Duolingo: any number of lessons a day; one is enough for the cell. */
export function DuolingoCard({ lessons, busy, onAdd, onPatch, onRemove }: DuolingoCardProps): JSX.Element {
  const total = lessons.reduce((sum, lesson) => sum + lesson.minutes, 0)
  return (
    <SessionCard
      label={`多邻国${lessons.length === 0 ? '' : ` · ${lessons.length} 节 ${total}分`}`}
      entries={lessons as readonly SessionEntry[]}
      fields={LESSON_FIELDS}
      summarize={entry => `${timeOf(String(entry.at ?? ''))} · ${Number(entry.minutes)} 分钟`}
      busy={busy}
      addLabel="加一节"
      emptyLabel="今日无课"
      onAdd={onAdd}
      onPatch={onPatch}
      onRemove={onRemove}
    />
  )
}
