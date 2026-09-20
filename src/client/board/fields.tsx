/**
 * A compact declarative form: each card describes its inputs, this renders
 * them, validates the obvious cases, and hands back a payload with empty
 * optional fields omitted.
 *
 * Session entries differ only in their metrics (minutes, counts, heart rate,
 * weight), so one form serves every habit kind instead of six near-copies.
 */
import { useState, type JSX } from 'react'

/** One input in a compact form. */
export interface FieldSpec {
  readonly name: string
  readonly label: string
  /** `time` renders a clock input whose value travels as `time` (`HH:mm`). */
  readonly kind: 'number' | 'text' | 'select' | 'time'
  readonly step?: number
  readonly min?: number
  /** Select options; `numericOptions` converts the chosen value to a number. */
  readonly options?: readonly { readonly value: string; readonly label: string }[]
  readonly numericOptions?: boolean
  readonly placeholder?: string
  /** Empty is allowed, and the key is then left out of the payload. */
  readonly optional?: boolean
  readonly defaultValue?: string
}

/** Turn raw inputs into an API payload, or report the first problem. */
function payloadOf(
  fields: readonly FieldSpec[],
  values: Readonly<Record<string, string>>,
): { payload: Record<string, unknown>; problem?: string } {
  const payload: Record<string, unknown> = {}
  for (const field of fields) {
    const raw = (values[field.name] ?? '').trim()
    if (raw === '') {
      if (field.optional === true) continue
      return { payload, problem: `${field.label}不能为空` }
    }
    if (field.kind === 'number' || (field.kind === 'select' && field.numericOptions === true)) {
      const parsed = Number(raw)
      if (!Number.isFinite(parsed)) return { payload, problem: `${field.label}必须是数字` }
      if (field.min !== undefined && parsed < field.min) {
        return { payload, problem: `${field.label}不能小于 ${field.min}` }
      }
      payload[field.name] = parsed
    } else {
      payload[field.name] = raw
    }
  }
  return { payload }
}

/** Props for the form. */
export interface FieldFormProps {
  readonly fields: readonly FieldSpec[]
  /** Pre-fill from an existing entry when editing. */
  readonly initial?: Record<string, unknown>
  readonly submitLabel: string
  readonly busy: boolean
  readonly onSubmit: (payload: Record<string, unknown>) => void
  readonly onCancel?: () => void
}

/** Render the form. */
export function FieldForm({
  fields, initial, submitLabel, busy, onSubmit, onCancel,
}: FieldFormProps): JSX.Element {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const start: Record<string, string> = {}
    for (const field of fields) {
      const existing = initial?.[field.name]
      start[field.name] = existing === undefined || existing === null
        ? field.defaultValue ?? ''
        : String(existing)
    }
    return start
  })
  const [problem, setProblem] = useState<string | null>(null)

  const submit = (): void => {
    const { payload, problem: issue } = payloadOf(fields, values)
    if (issue !== undefined) {
      setProblem(issue)
      return
    }
    setProblem(null)
    onSubmit(payload)
  }

  const set = (name: string, value: string): void => {
    setValues(current => ({ ...current, [name]: value }))
  }

  return (
    <div className="pt-form">
      {fields.map(field => (
        <label className="pt-field" key={field.name}>
          <span className="pt-muted">{field.label}</span>
          {field.kind === 'select'
            ? (
              <select
                className="pt-input"
                value={values[field.name] ?? ''}
                onChange={event => set(field.name, event.target.value)}
              >
                {(field.options ?? []).map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            )
            : (
              <input
                className="pt-input"
                type={field.kind === 'number' ? 'number' : field.kind === 'time' ? 'time' : 'text'}
                step={field.step}
                min={field.min}
                placeholder={field.placeholder}
                value={values[field.name] ?? ''}
                onChange={event => set(field.name, event.target.value)}
              />
            )}
        </label>
      ))}
      <div className="pt-form-actions">
        <button className="pt-btn pt-btn-primary" disabled={busy} onClick={submit}>{submitLabel}</button>
        {onCancel === undefined ? null : <button className="pt-btn" onClick={onCancel}>取消</button>}
      </div>
      {problem === null ? null : <div className="pt-error">{problem}</div>}
    </div>
  )
}
