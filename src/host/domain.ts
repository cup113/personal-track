/**
 * The habit storage domain: one schema-validated KV domain named `habit`,
 * laid out `per-record` so each habit day is its own JSON document.
 *
 * Only facts are stored — instants, metrics, entries, and the laundry stock.
 * Every state derived from them (cells, target progress, task state, overdue,
 * pace, streaks) is computed on read; see
 * docs/adr/0002-derived-state-not-stored.md.
 */
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { DayKey } from './daykey.ts'

/** Every session entry carries a stable id so edits never address by index. */
const sessionId = z.string().min(1)

/** One meal slot: when it was eaten, optionally what it cost. */
const mealSlot = z.object({
  at: z.string(),
  price: z.number().nonnegative().optional(),
})

/** Vocabulary target snapshot for one habit day. */
const vocabTarget = z.object({
  new: z.number().int().nonnegative(),
  review: z.number().int().nonnegative(),
})

/** One vocabulary study session. */
const vocabSession = z.object({
  id: sessionId,
  at: z.string(),
  new: z.number().int().nonnegative(),
  review: z.number().int().nonnegative(),
  minutes: z.number().nonnegative(),
})

/** Everything one habit day holds. Fields are optional/defaulted so older
 *  documents keep parsing as the schema grows. */
export const dayRecord = z.object({
  /** Copy of the key, so a document is self-describing. */
  date: z.string(),
  /** Check: at most two washes, one instant each. */
  washes: z.object({ times: z.array(z.string()).default([]) }).default({ times: [] }),
  /** Check: at most one shower. */
  shower: z.object({ at: z.string().nullable().default(null) }).default({ at: null }),
  /** Slot: three meals, each at most once. */
  meals: z.object({
    breakfast: mealSlot.optional(),
    lunch: mealSlot.optional(),
    dinner: mealSlot.optional(),
  }).default({}),
  /** Session with a quantity target (vocabulary). */
  vocab: z.object({
    target: vocabTarget,
    sessions: z.array(vocabSession).default([]),
  }).optional(),
  /** Session with a presence target (at least one lesson). */
  duolingo: z.array(z.object({
    id: sessionId,
    at: z.string(),
    minutes: z.number().nonnegative(),
  })).default([]),
  /** Session capped at one per day (running). */
  run: z.object({
    at: z.string(),
    minutes: z.number().positive(),
    distanceKm: z.number().nonnegative(),
    avgHr: z.number().int().positive().optional(),
  }).nullable().default(null),
  /** Repetitive sessions (jump rope). */
  rope: z.array(z.object({
    id: sessionId,
    at: z.string(),
    preset: z.union([z.literal(90), z.literal(180)]),
    seconds: z.number().nonnegative(),
    avgHr: z.number().int().positive().optional(),
  })).default([]),
  /** Repetitive sessions (pull-ups, metric = support time). */
  pullup: z.array(z.object({
    id: sessionId,
    at: z.string(),
    seconds: z.number().nonnegative(),
  })).default([]),
  /** Repetitive sessions (gym equipment). */
  equipment: z.array(z.object({
    id: sessionId,
    at: z.string(),
    name: z.string().min(1),
    reps: z.number().int().nonnegative(),
    weight: z.number().nonnegative().optional(),
  })).default([]),
  /** Washing sessions: the history half of the laundry counter. */
  washing: z.array(z.object({
    id: sessionId,
    at: z.string(),
    pieces: z.number().int().positive(),
  })).default([]),
})

/** One stored habit day. */
export type DayRecord = z.infer<typeof dayRecord>

/** The laundry stock. Authoritative value; washing sessions hold the history. */
export const counterRecord = z.object({
  pending: z.number().int().nonnegative(),
  updatedAt: z.string(),
})

/** The laundry stock record. */
export type CounterRecord = z.infer<typeof counterRecord>

/** One media log entry (log-shaped registry). */
export const mediaRecord = z.object({
  id: sessionId,
  kind: z.enum(['film', 'book']),
  title: z.string().min(1),
  status: z.enum(['active', 'done', 'dropped']),
  rating: z.number().int().min(1).max(5).optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.string(),
})

/** One media entry. */
export type MediaRecord = z.infer<typeof mediaRecord>

/** One task (task-shaped registry: title, optional category/due, progress). */
export const taskRecord = z.object({
  id: sessionId,
  title: z.string().min(1),
  category: z.string().optional(),
  /** Due date as a plain `YYYY-MM-DD`; overdue-ness is derived, never stored. */
  due: z.string().optional(),
  progress: z.object({
    current: z.number().int().nonnegative().default(0),
    total: z.number().int().positive().optional(),
  }).default({ current: 0 }),
  completedAt: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.string(),
})

/** One task. */
export type TaskRecord = z.infer<typeof taskRecord>

/** The domain declaration: identity, layout and record schemas. */
export const habitDomainSpec = defineDomain({
  name: 'habit',
  version: 1,
  layout: 'per-record',
  tables: {
    days: domainTable<DayKey, DayRecord>(dayRecord),
    counters: domainTable<'laundry', CounterRecord>(counterRecord),
    media: domainTable<string, MediaRecord>(mediaRecord),
    tasks: domainTable<string, TaskRecord>(taskRecord),
  },
})
