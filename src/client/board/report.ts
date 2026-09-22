/**
 * The day as plain text — what the 复制纯文本报告 button puts on the
 * clipboard.
 *
 * One line per board group (日常 / 饮食 / 学习 / 健身 / 任务), so a report
 * reads top to bottom the way the board does and stays short enough to paste
 * straight into a chat. This is display formatting of a slice the host already
 * sent: no extra reads and no truth of its own — every figure is one the board
 * is already showing for the same day.
 *
 * Tasks are the one cross-day registry that appears, and they appear the way
 * their cells do: a task belongs to the day it is due, so the line lists the
 * tasks due on the viewed date at their *current* progress.
 */
import type { ClockView, StateView } from '../types.ts'
import { dayLabelOf, fractionText, moneyOf, paceLabel, paceOf, percentOf } from './format.ts'

/** A report line; `null` when the group has nothing worth a line. */
type Line = string | null

/** 日常: the two checks plus the laundry stock. */
function dailyLine(state: StateView): Line {
  const record = state.day.day
  const washes = record?.washes.times.length ?? 0
  const shower = record?.shower.at != null
  const parts = [`洗漱 ${washes}/2`, shower ? '洗澡 ✓' : '洗澡 —']
  if (state.stock.pending > 0) parts.push(`待洗 ${state.stock.pending} 件`)
  return parts.join(' · ')
}

/** 饮食: how many meals, and what they cost. */
function mealsLine(state: StateView): Line {
  const meals = state.day.day?.meals ?? {}
  const slots = [meals.breakfast, meals.lunch, meals.dinner]
  const recorded = slots.filter(meal => meal !== undefined).length
  const spend = slots.reduce((sum, meal) => sum + (meal?.price ?? 0), 0)
  return `三餐 ${recorded}/3${spend > 0 ? `（${moneyOf(spend)}）` : ''}`
}

/** 学习: weighted vocabulary progress plus the day's lessons. */
function studyLine(state: StateView): Line {
  const vocab = state.day.vocab
  const percent = percentOf(vocab.ratio)
  const surplus = vocab.surplusNew + vocab.surplusReview
  const details = [
    `新 ${vocab.doneNew}/${vocab.targetNew}`,
    `复 ${vocab.doneReview}/${vocab.targetReview}`,
    ...(vocab.minutes > 0 ? [`${vocab.minutes} 分`] : []),
    ...(surplus > 0 ? [`超额 ${surplus}`] : []),
  ].join(' · ')
  const lessons = state.day.day?.duolingo ?? []
  const minutes = lessons.reduce((sum, lesson) => sum + lesson.minutes, 0)
  const duolingoText = lessons.length === 0
    ? '多邻国 —'
    : `多邻国 ${lessons.length} 节${minutes > 0 ? ` ${minutes} 分` : ''}`
  return `背单词 ${percent}%（${details}） · ${duolingoText}`
}

/** 健身: only the training that actually happened gets a segment. */
function fitnessLine(state: StateView): Line {
  const record = state.day.day
  if (record === null) return null
  const parts: string[] = []
  if (record.run !== null) {
    const pace = paceOf(record.run.minutes, record.run.distanceKm)
    parts.push(`跑步 ${record.run.distanceKm}km ${record.run.minutes} 分`
      + `${pace === undefined ? '' : ` ${paceLabel(pace)}`}`
      + `${record.run.avgHr === undefined ? '' : ` ♥${record.run.avgHr}`}`)
  }
  if (record.rope.length > 0) {
    const setsOf = (preset: 90 | 180): number => record.rope.filter(set => set.preset === preset).length
    const detail = [
      setsOf(90) > 0 ? `90×${setsOf(90)}` : null,
      setsOf(180) > 0 ? `180×${setsOf(180)}` : null,
    ].filter(value => value !== null).join(' ')
    parts.push(`跳绳 ${record.rope.length} 组${detail === '' ? '' : `（${detail}）`}`)
  }
  if (record.pullup.length > 0) {
    const seconds = record.pullup.reduce((sum, set) => sum + set.seconds, 0)
    parts.push(`引体 ${record.pullup.length} 组 ${seconds} 秒`)
  }
  if (record.equipment.length > 0) {
    const byName = new Map<string, { sets: number; reps: number }>()
    for (const set of record.equipment) {
      const current = byName.get(set.name) ?? { sets: 0, reps: 0 }
      byName.set(set.name, { sets: current.sets + 1, reps: current.reps + set.reps })
    }
    const detail = [...byName].map(([name, { sets, reps }]) => `${name} ${sets} 组 ${reps} 次`).join(' · ')
    parts.push(`器材 ${detail}`)
  }
  return parts.length === 0 ? null : parts.join(' · ')
}

/** 任务: the tasks due on the viewed date, at their current progress. */
function taskLine(state: StateView, clock: ClockView): Line {
  const due = state.tasks.filter(task => task.due === state.day.date)
  if (due.length === 0) return null
  const items = due.map((task) => {
    const progress = task.progress.total === undefined
      ? ''
      : ` ${fractionText(task.progress.current)}/${fractionText(task.progress.total)}`
    const tail = task.state === 'done' ? '✓' : task.overdue ? '逾期' : ''
    return `${task.title}${task.category === undefined ? '' : `（${task.category}）`}${progress}`
      + `${tail === '' ? '' : ` ${tail}`}`
  })
  // Overdue tasks are *not* this day's cells (their due day has passed), so on
  // today's report they only surface as a count.
  const lateOpen = clock.today === state.day.date
    ? state.tasks.filter(task => task.overdue && task.due !== state.day.date).length
    : 0
  return `任务：${items.join('；')}${lateOpen > 0 ? `；另有逾期 ${lateOpen}` : ''}`
}

/** The whole report: a header, the completion figure, then one line per group. */
export function dayReport(state: StateView, clock: ClockView): string {
  const { day } = state
  const night = clock.nightTail && day.date === clock.today
  const percent = percentOf(day.progress.total === 0 ? 0 : day.progress.done / day.progress.total)
  const lines: Line[] = [
    `习惯日报 ${dayLabelOf(day.date, night)}`,
    `完成 ${fractionText(day.progress.done)}/${day.progress.total}（${percent}%）`,
    dailyLine(state),
    mealsLine(state),
    studyLine(state),
    fitnessLine(state),
    taskLine(state, clock),
  ]
  return lines.filter(line => line !== null).join('\n')
}
