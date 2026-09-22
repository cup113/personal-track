/**
 * One handler per route, keyed by the shared route table.
 *
 * These implementations were previously the arms of a single `switch` inside
 * `createApiHandler`, sharing one very wide closure. Splitting them out changes
 * no rule; it changes what is testable. Each handler receives a {@link RouteCtx}
 * of resolved dependencies and **returns the response body**, so the transport —
 * reading a body, writing JSON, mapping a failure to a status — lives in exactly
 * one place (`api.ts`) instead of being interleaved with the domain rules.
 *
 * The table is typed `Record<RouteName, RouteHandler>`, so a route declared in
 * `src/shared/route.ts` with no handler here is a compile error, and the
 * constructor additionally checks the two sets agree at runtime.
 */
import { z } from 'zod'
import { BackupFormatError, type Backup, type ImportMode } from './backup.ts'
import type { Config, DayBoundary } from './config.ts'
import { dayKeySpan, habitDayKey, instantForHabitDay, isNightTail, type DayKey } from './daykey.ts'
import { mediaRecord, taskRecord } from './domain.ts'
import { ApiError } from './api-error.ts'
import { buildStats } from './stats.ts'
import type { HabitStore, SessionKind } from './store.ts'
import type { RouteName } from '../shared/route.ts'

/** Everything a handler needs from the plugin, already resolved. */
export interface RouteCtx {
  readonly store: HabitStore
  readonly backup: Backup
  readonly boundary: DayBoundary
  readonly config: Config
  readonly now: () => Date
  /** The current instant, ISO-encoded. */
  readonly iso: () => string
  /** The current habit day. */
  readonly today: () => DayKey
  /** The state slice every mutation answers with. */
  readonly stateFor: (date: DayKey) => Record<string, unknown>
  /** Parse with zod, or fail as a 400. */
  readonly parse: <T extends z.ZodType>(schema: T, value: unknown, what: string) => z.infer<T>
  /** Date from body/query, else the current habit day. */
  readonly dateOf: (source: { date?: unknown }, fallback: DayKey) => DayKey
  /** Turn a `time` into an instant inside the habit day. */
  readonly resolveAt: (source: Record<string, unknown>, date: DayKey) => Record<string, unknown>
  /** Resolve a raw entry's `time`/`at` to an instant, or undefined for "now". */
  readonly entryInstant: (rawEntry: Record<string, unknown>, date: DayKey) => string | undefined
}

/** A body to answer with; the transport decides the status line. */
export type RouteResult = Record<string, unknown>

/**
 * One route's implementation.
 *
 * @param ctx - the resolved dependencies.
 * @param body - the parsed request body (`{}` when the request carried none).
 * @param query - the query parameters.
 * @returns the JSON body to write with a 200.
 */
export type RouteHandler = (
  ctx: RouteCtx,
  body: Record<string, unknown>,
  query: Record<string, string>,
) => Promise<RouteResult>

/** A backup file is far larger than an ordinary mutation body. */
export const BACKUP_BODY_LIMIT = 16 * 1024 * 1024

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
const ISO = z.string().min(1)
const SLOT = z.enum(['breakfast', 'lunch', 'dinner'])

/** Per-kind session entry schemas; `at` is stamped by the server when absent. */
const sessionSchemas = {
  vocab: z.object({
    at: ISO.optional(),
    new: z.number().int().nonnegative(),
    review: z.number().int().nonnegative(),
    minutes: z.number().nonnegative(),
  }),
  duolingo: z.object({ at: ISO.optional(), minutes: z.number().nonnegative() }),
  rope: z.object({
    at: ISO.optional(),
    preset: z.union([z.literal(90), z.literal(180)]),
    seconds: z.number().nonnegative(),
    avgHr: z.number().int().positive().optional(),
  }),
  pullup: z.object({ at: ISO.optional(), seconds: z.number().nonnegative() }),
  equipment: z.object({
    at: ISO.optional(),
    name: z.string().min(1),
    reps: z.number().int().nonnegative(),
    weight: z.number().nonnegative().optional(),
  }),
  washing: z.object({ at: ISO.optional(), pieces: z.number().int().positive() }),
} satisfies Record<SessionKind, z.ZodType>

/** Narrow a string to a session kind. */
function asSessionKind(value: unknown): SessionKind {
  if (typeof value === 'string' && value in sessionSchemas) return value as SessionKind
  throw new ApiError(400, 'habit/bad-request', `unknown session kind: ${String(value)}`)
}

/**
 * The `kind`, the habit day, and the entry a session request describes.
 *
 * A clock time reaches these routes in one of three shapes, and only the host
 * may resolve any of them, because a time before the boundary belongs to the
 * night tail of the previous habit day:
 *
 * - `entry.time` — creating a session at a known hour;
 * - `time`, beside `patch` — retiming from a caller that keeps the two apart;
 * - `patch.time` — what the board's own editor form actually sends, because its
 *   time input is just another field in the payload.
 *
 * All three collapse into the entry's `time`, which {@link RouteCtx.entryInstant}
 * resolves. `at` is deliberately not hoisted: it is the entry's own field, and
 * an outer one must not shadow the instant already stored.
 */
function sessionRequest(body: Record<string, unknown>, ctx: RouteCtx): {
  kind: SessionKind
  date: DayKey
  rawEntry: Record<string, unknown>
  patch: Record<string, unknown>
} {
  const kind = asSessionKind(body.kind)
  const date = ctx.dateOf(body, ctx.today())
  const outer = (body.patch ?? {}) as Record<string, unknown>
  const { time: outerTime, ...restOuter } = outer
  const entry = (body.entry ?? {}) as Record<string, unknown>
  const clock = body.time ?? outerTime ?? entry.time
  const rawEntry: Record<string, unknown> = { time: clock, ...entry }
  // The clock is not a metric, so it must not survive into the patch object and
  // be stripped by the schema as an unknown key.
  return { kind, date, rawEntry, patch: restOuter }
}

export const handlers: Record<RouteName, RouteHandler> = {
  // --- reads ---------------------------------------------------------------

  async clock(ctx) {
    const now = ctx.now()
    return {
      ok: true,
      today: ctx.today(),
      nightTail: isNightTail(now, ctx.boundary),
      now: now.toISOString(),
      config: {
        dayStartHour: ctx.config.dayStartHour,
        defaultVocabTarget: ctx.config.defaultVocabTarget,
        defaultRunMinutes: ctx.config.defaultRunMinutes,
      },
    }
  },

  async state(ctx, _body, query) {
    return ctx.stateFor(ctx.dateOf(query, ctx.today()))
  },

  async stats(ctx, _body, query) {
    const range = ctx.parse(z.object({ from: DATE.optional(), to: DATE.optional() }), query, 'stats range')
    const to = range.to ?? ctx.today()
    const from = range.from ?? to
    if (from > to) throw new ApiError(400, 'habit/bad-request', 'from 必须不晚于 to')
    if (dayKeySpan(from, to, 401) > 400) {
      throw new ApiError(400, 'habit/range-too-large', '统计范围最多 400 天')
    }
    return { ok: true, ...buildStats(ctx.store, from, to, ctx.boundary) }
  },

  // --- counted checks ------------------------------------------------------

  async check(ctx, body) {
    const raw = ctx.parse(z.object({
      date: DATE.optional(),
      habit: z.enum(['wash', 'shower']),
      /** Optional clock time, for backfilling at a known hour. */
      time: z.string().optional(),
      at: ISO.optional(),
    }), body, 'check')
    const date = ctx.dateOf(raw, ctx.today())
    const resolved = ctx.resolveAt(raw, date)
    const at = typeof resolved.at === 'string' ? resolved.at : ctx.iso()
    if (raw.habit === 'wash') {
      const current = ctx.store.readDay(date)?.washes.times.length ?? 0
      if (current >= 2) throw new ApiError(409, 'habit/check-limit', '洗漱每日至多两次')
      await ctx.store.mutateDay(date, day => ({
        ...day,
        washes: { times: [...day.washes.times, at] },
      }))
    } else {
      await ctx.store.mutateDay(date, day => ({ ...day, shower: { at } }))
    }
    return ctx.stateFor(date)
  },

  async editCheck(ctx, body) {
    const raw = ctx.parse(z.object({
      date: DATE.optional(),
      habit: z.enum(['wash', 'shower']),
      /** Which recorded check to retime; defaults to the most recent. */
      index: z.number().int().nonnegative().optional(),
      time: z.string().optional(),
      at: ISO.optional(),
    }), body, 'check edit')
    const date = ctx.dateOf(raw, ctx.today())
    const resolved = ctx.resolveAt(raw, date)
    const at = resolved.at
    if (typeof at !== 'string') throw new ApiError(400, 'habit/bad-request', '需要 time 或 at')
    const existing = ctx.store.readDay(date)
    if (raw.habit === 'wash') {
      const times = existing?.washes.times ?? []
      const index = raw.index ?? times.length - 1
      if (index < 0 || index >= times.length) {
        throw new ApiError(404, 'habit/not-found', '没有这条打卡')
      }
      await ctx.store.mutateDay(date, day => ({
        ...day,
        washes: { times: day.washes.times.map((entry, position) => (position === index ? at : entry)) },
      }))
    } else {
      if (existing?.shower.at == null) throw new ApiError(404, 'habit/not-found', '洗澡尚未打卡')
      await ctx.store.mutateDay(date, day => ({ ...day, shower: { at } }))
    }
    return ctx.stateFor(date)
  },

  async uncheck(ctx, _body, query) {
    const body = ctx.parse(z.object({
      date: DATE.optional(),
      habit: z.enum(['wash', 'shower']),
      /** Which recorded check to drop; defaults to the most recent one. */
      index: z.coerce.number().int().nonnegative().optional(),
    }), query, 'check')
    const date = ctx.dateOf(body, ctx.today())
    await ctx.store.mutateDay(date, (day) => {
      if (body.habit !== 'wash') return { ...day, shower: { at: null } }
      const times = [...day.washes.times]
      const index = body.index ?? times.length - 1
      if (index >= 0 && index < times.length) times.splice(index, 1)
      return { ...day, washes: { times } }
    })
    return ctx.stateFor(date)
  },

  // --- meal slots ----------------------------------------------------------

  async setMeal(ctx, body) {
    const raw = ctx.parse(z.object({
      date: DATE.optional(),
      slot: SLOT,
      /** Optional clock time; absent means "now". */
      time: z.string().optional(),
      at: ISO.optional(),
      price: z.number().nonnegative().optional(),
    }), body, 'meal')
    const date = ctx.dateOf(raw, ctx.today())
    const resolved = ctx.resolveAt(raw, date)
    const meal = {
      at: typeof resolved.at === 'string' ? resolved.at : ctx.iso(),
      ...(resolved.price === undefined ? {} : { price: resolved.price }),
    }
    await ctx.store.mutateDay(date, day => ({ ...day, meals: { ...day.meals, [raw.slot]: meal } }))
    return ctx.stateFor(date)
  },

  async clearMeal(ctx, _body, query) {
    const body = ctx.parse(z.object({ date: DATE.optional(), slot: SLOT }), query, 'meal')
    const date = ctx.dateOf(body, ctx.today())
    await ctx.store.mutateDay(date, (day) => {
      const meals = { ...day.meals }
      delete meals[body.slot]
      return { ...day, meals }
    })
    return ctx.stateFor(date)
  },

  // --- sessions ------------------------------------------------------------

  async addSession(ctx, body) {
    const { kind, date, rawEntry } = sessionRequest(body, ctx)
    const entry = ctx.parse(sessionSchemas[kind], body.entry, `session ${kind}`) as Record<string, unknown>
    await ctx.store.addSession(date, kind, { ...entry, at: ctx.entryInstant(rawEntry, date) ?? ctx.iso() })
    return ctx.stateFor(date)
  },

  async patchSession(ctx, body) {
    const { kind, date, rawEntry, patch: rawPatch } = sessionRequest(body, ctx)
    const id = ctx.parse(z.object({ id: z.string().min(1) }), body, 'session').id
    const patch = ctx.parse(sessionSchemas[kind].partial(), rawPatch, `session ${kind}`) as Record<string, unknown>
    const instant = ctx.entryInstant(rawEntry, date)
    await ctx.store.patchSession(date, kind, id, instant === undefined ? patch : { ...patch, at: instant })
    return ctx.stateFor(date)
  },

  async removeSession(ctx, _body, query) {
    const body = ctx.parse(z.object({
      date: DATE.optional(),
      kind: z.string(),
      id: z.string().min(1),
    }), query, 'session')
    const kind = asSessionKind(body.kind)
    const date = ctx.dateOf(body, ctx.today())
    await ctx.store.removeSession(date, kind, body.id)
    return ctx.stateFor(date)
  },

  // --- running -------------------------------------------------------------

  async setRun(ctx, body) {
    const raw = ctx.parse(z.object({
      date: DATE.optional(),
      /** Optional clock time; absent means "now". */
      time: z.string().optional(),
      at: ISO.optional(),
      minutes: z.number().positive().optional(),
      distanceKm: z.number().nonnegative(),
      avgHr: z.number().int().positive().optional(),
    }), body, 'run')
    const date = ctx.dateOf(raw, ctx.today())
    const resolved = ctx.resolveAt(raw, date)
    const run = {
      at: typeof resolved.at === 'string' ? resolved.at : ctx.iso(),
      minutes: raw.minutes ?? ctx.config.defaultRunMinutes,
      distanceKm: raw.distanceKm,
      ...(raw.avgHr === undefined ? {} : { avgHr: raw.avgHr }),
    }
    await ctx.store.mutateDay(date, day => ({ ...day, run }))
    return ctx.stateFor(date)
  },

  async clearRun(ctx, _body, query) {
    const body = ctx.parse(z.object({ date: DATE.optional() }), query, 'run')
    const date = ctx.dateOf(body, ctx.today())
    await ctx.store.mutateDay(date, day => ({ ...day, run: null }))
    return ctx.stateFor(date)
  },

  // --- vocabulary target ---------------------------------------------------

  async setVocabTarget(ctx, body) {
    const parsed = ctx.parse(z.object({
      date: DATE.optional(),
      new: z.number().int().nonnegative(),
      review: z.number().int().nonnegative(),
    }), body, 'vocab-target')
    const date = ctx.dateOf(parsed, ctx.today())
    await ctx.store.setVocabTarget(date, { new: parsed.new, review: parsed.review })
    return ctx.stateFor(date)
  },

  // --- the laundry pair ----------------------------------------------------

  async laundryWash(ctx, body) {
    const raw = ctx.parse(z.object({
      date: DATE.optional(),
      pieces: z.number().int().positive(),
      /** Optional clock time; absent means "now". */
      time: z.string().optional(),
      at: ISO.optional(),
    }), body, 'laundry wash')
    const date = ctx.dateOf(raw, ctx.today())
    const resolved = ctx.resolveAt(raw, date)
    const { stock } = await ctx.store.wash(date, raw.pieces, typeof resolved.at === 'string' ? resolved.at : ctx.iso())
    return { ...ctx.stateFor(date), stock }
  },

  async laundryStock(ctx, body) {
    const raw = ctx.parse(z.object({
      pending: z.number().int().nonnegative(),
      at: ISO.optional(),
    }), body, 'laundry stock')
    const stock = await ctx.store.setStock(raw.pending, raw.at ?? ctx.iso())
    return { ...ctx.stateFor(ctx.today()), stock }
  },

  // --- backup --------------------------------------------------------------

  async exportBackup(ctx) {
    return { ok: true, backup: ctx.backup.exportAll(ctx.iso()) }
  },

  async importBackup(ctx, body) {
    const parsed = ctx.parse(z.object({
      /** `merge` overwrites the keys the file carries; `replace` also
       *  drops everything the file does not carry. */
      mode: z.enum(['merge', 'replace']).default('merge'),
      backup: z.unknown(),
    }), body, 'backup import')
    let report
    try {
      report = await ctx.backup.importAll(parsed.backup, parsed.mode as ImportMode)
    } catch (cause) {
      // A file that is not a readable backup is a client error, and it carries
      // its own wording (identity, version, or the offending field).
      if (cause instanceof BackupFormatError) throw new ApiError(400, 'habit/bad-backup', cause.message)
      throw cause
    }
    return { ok: true, report, ...ctx.store.view(ctx.today(), ctx.today()) }
  },

  // --- media ---------------------------------------------------------------

  async addMedia(ctx, body) {
    const raw = ctx.parse(mediaRecord.omit({ id: true, createdAt: true, status: true }).extend({
      status: mediaRecord.shape.status.optional(),
    }), body, 'media')
    const record = mediaRecord.parse({
      ...raw,
      id: ctx.store.newId(),
      status: raw.status ?? 'active',
      createdAt: ctx.iso(),
    })
    await ctx.store.putMedia(record)
    return { ok: true, media: ctx.store.view(ctx.today(), ctx.today()).media, entry: record }
  },

  async patchMedia(ctx, body) {
    const outer = ctx.parse(z.object({ id: z.string().min(1), patch: z.unknown() }), body, 'media patch')
    // `null` clears an optional field; an absent key leaves it alone.
    const patch = ctx.parse(z.object({
      kind: z.enum(['film', 'book']).optional(),
      title: z.string().min(1).optional(),
      status: z.enum(['active', 'done', 'dropped']).optional(),
      rating: z.number().int().min(1).max(5).nullable().optional(),
      startedAt: z.string().nullable().optional(),
      finishedAt: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }), outer.patch, 'media patch')
    const entry = await ctx.store.patchMedia(outer.id, patch)
    return { ok: true, media: ctx.store.view(ctx.today(), ctx.today()).media, entry }
  },

  async removeMedia(ctx, _body, query) {
    const body = ctx.parse(z.object({ id: z.string().min(1) }), query, 'media delete')
    const removed = await ctx.store.deleteMedia(body.id)
    return { ok: true, removed, media: ctx.store.view(ctx.today(), ctx.today()).media }
  },

  // --- tasks ---------------------------------------------------------------

  async addTask(ctx, body) {
    const raw = ctx.parse(taskRecord.omit({ id: true, createdAt: true }).partial({
      progress: true, title: true,
    }).extend({ title: z.string().min(1) }), body, 'task')
    const record = taskRecord.parse({ ...raw, id: ctx.store.newId(), createdAt: ctx.iso() })
    await ctx.store.putTask(record)
    return { ok: true, tasks: ctx.store.view(ctx.today(), ctx.today()).tasks, entry: record }
  },

  async patchTask(ctx, body) {
    const outer = ctx.parse(z.object({ id: z.string().min(1), patch: z.unknown() }), body, 'task patch')
    // `null` clears an optional field; `progress` merges field by field.
    const patch = ctx.parse(z.object({
      title: z.string().min(1).optional(),
      category: z.string().nullable().optional(),
      due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'due must be YYYY-MM-DD').nullable().optional(),
      progress: z.object({
        current: z.number().int().nonnegative().optional(),
        total: z.number().int().positive().nullable().optional(),
      }).optional(),
      notes: z.string().nullable().optional(),
    }), outer.patch, 'task patch')
    const entry = await ctx.store.patchTask(outer.id, patch)
    return { ok: true, tasks: ctx.store.view(ctx.today(), ctx.today()).tasks, entry }
  },

  async removeTask(ctx, _body, query) {
    const body = ctx.parse(z.object({ id: z.string().min(1) }), query, 'task delete')
    const removed = await ctx.store.deleteTask(body.id)
    return { ok: true, removed, tasks: ctx.store.view(ctx.today(), ctx.today()).tasks }
  },
}
