/**
 * The plugin's own HTTP API, served on `ctx.webServer` under `/habit/api`.
 *
 * Transport rationale: docs/adr/0001-out-of-tree-transport.md. Request bodies
 * are validated with the same zod vocabulary as the stored records, failures
 * use one shape — `{ error: { code, message } }` — and every mutation answers
 * with the refreshed state slice so the client never has to re-read.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { Config, DayBoundary } from './config.ts'
import { habitDayKey, isNightTail, type DayKey } from './daykey.ts'
import { mediaRecord, taskRecord } from './domain.ts'
import type { HabitStore, SessionKind } from './store.ts'

/** The prefix this plugin owns. */
export const API_PREFIX = '/habit/api'

/** One API failure, mapped to a status and the uniform error shape. */
class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** Everything the handler needs from the plugin. */
export interface ApiDeps {
  readonly store: HabitStore
  readonly boundary: DayBoundary
  readonly config: Config
  readonly now: () => Date
}

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

/** Write one JSON response. */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Read and parse a JSON body, bounded in size. */
async function readJson(req: IncomingMessage, limit = 64 * 1024): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > limit) throw new ApiError(413, 'habit/too-large', 'request body too large')
    chunks.push(buffer)
  }
  if (size === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new ApiError(400, 'habit/bad-json', 'request body is not valid JSON')
  }
}

/** Parse with zod, or fail as a 400. */
function parse<T extends z.ZodType>(schema: T, value: unknown, what: string): z.infer<T> {
  const result = schema.safeParse(value)
  if (!result.success) {
    const first = result.error.issues[0]
    throw new ApiError(400, 'habit/bad-request', `${what}: ${first?.path.join('.') ?? ''} ${first?.message ?? 'invalid'}`.trim())
  }
  return result.data
}

/** Create the route handler. */
export function createApiHandler(deps: ApiDeps): WebRoute['handler'] {
  const { store } = deps
  const iso = (): string => deps.now().toISOString()
  const today = (): DayKey => habitDayKey(deps.now(), deps.boundary)
  const stamp = (entry: Record<string, unknown>): Record<string, unknown> =>
    ({ at: iso(), ...entry })

  /** Date from body/query, else the current habit day. */
  function dateOf(source: { date?: unknown }, fallback: DayKey): DayKey {
    const value = source.date
    if (value === undefined || value === null || value === '') return fallback
    return parse(DATE, value, 'date')
  }

  function stateFor(date: DayKey): Record<string, unknown> {
    return { ok: true, ...store.view(date, today()) }
  }

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const method = req.method ?? 'GET'
    const route = url.pathname.slice(API_PREFIX.length) || '/'
    const query = Object.fromEntries(url.searchParams.entries())
    const key = `${method} ${route}`

    switch (key) {
      case 'GET /state': {
        sendJson(res, 200, stateFor(dateOf(query, today())))
        return
      }

      case 'GET /clock': {
        const now = deps.now()
        sendJson(res, 200, {
          ok: true,
          today: today(),
          nightTail: isNightTail(now, deps.boundary),
          now: now.toISOString(),
          config: {
            dayStartHour: deps.config.dayStartHour,
            defaultVocabTarget: deps.config.defaultVocabTarget,
            defaultRunMinutes: deps.config.defaultRunMinutes,
          },
        })
        return
      }

      case 'POST /check': {
        const body = parse(z.object({
          date: DATE.optional(),
          habit: z.enum(['wash', 'shower']),
        }), await readJson(req), 'check')
        const date = dateOf(body, today())
        if (body.habit === 'wash') {
          const current = store.readDay(date)?.washes.times.length ?? 0
          if (current >= 2) throw new ApiError(409, 'habit/check-limit', '洗漱每日至多两次')
          await store.mutateDay(date, day => ({
            ...day,
            washes: { times: [...day.washes.times, iso()] },
          }))
        } else {
          await store.mutateDay(date, day => ({ ...day, shower: { at: iso() } }))
        }
        sendJson(res, 200, stateFor(date))
        return
      }

      case 'DELETE /check': {
        const body = parse(z.object({
          date: DATE.optional(),
          habit: z.enum(['wash', 'shower']),
          /** Which recorded check to drop; defaults to the most recent one. */
          index: z.coerce.number().int().nonnegative().optional(),
        }), query, 'check')
        const date = dateOf(body, today())
        await store.mutateDay(date, (day) => {
          if (body.habit !== 'wash') return { ...day, shower: { at: null } }
          const times = [...day.washes.times]
          const index = body.index ?? times.length - 1
          if (index >= 0 && index < times.length) times.splice(index, 1)
          return { ...day, washes: { times } }
        })
        sendJson(res, 200, stateFor(date))
        return
      }

      case 'PUT /meal': {
        const body = parse(z.object({
          date: DATE.optional(),
          slot: SLOT,
          at: ISO.optional(),
          price: z.number().nonnegative().optional(),
        }), await readJson(req), 'meal')
        const date = dateOf(body, today())
        const meal = { at: body.at ?? iso(), ...(body.price === undefined ? {} : { price: body.price }) }
        await store.mutateDay(date, day => ({ ...day, meals: { ...day.meals, [body.slot]: meal } }))
        sendJson(res, 200, stateFor(date))
        return
      }

      case 'DELETE /meal': {
        const body = parse(z.object({ date: DATE.optional(), slot: SLOT }), query, 'meal')
        const date = dateOf(body, today())
        await store.mutateDay(date, (day) => {
          const meals = { ...day.meals }
          delete meals[body.slot]
          return { ...day, meals }
        })
        sendJson(res, 200, stateFor(date))
        return
      }

      case 'POST /session': {
        const body = parse(z.object({
          date: DATE.optional(),
          kind: z.string(),
          entry: z.unknown(),
        }), await readJson(req), 'session')
        const kind = asSessionKind(body.kind)
        const date = dateOf(body, today())
        const entry = parse(sessionSchemas[kind], body.entry, `session ${kind}`)
        await store.addSession(date, kind, stamp(entry as Record<string, unknown>))
        sendJson(res, 200, stateFor(date))
        return
      }

      case 'PATCH /session': {
        const body = parse(z.object({
          date: DATE.optional(),
          kind: z.string(),
          id: z.string().min(1),
          patch: z.unknown(),
        }), await readJson(req), 'session')
        const kind = asSessionKind(body.kind)
        const date = dateOf(body, today())
        const patch = parse(sessionSchemas[kind].partial(), body.patch, `session ${kind}`)
        await store.patchSession(date, kind, body.id, patch as Record<string, unknown>)
        sendJson(res, 200, stateFor(date))
        return
      }

      case 'DELETE /session': {
        const body = parse(z.object({
          date: DATE.optional(),
          kind: z.string(),
          id: z.string().min(1),
        }), query, 'session')
        const kind = asSessionKind(body.kind)
        const date = dateOf(body, today())
        await store.removeSession(date, kind, body.id)
        sendJson(res, 200, stateFor(date))
        return
      }

      case 'PUT /run': {
        const body = parse(z.object({
          date: DATE.optional(),
          at: ISO.optional(),
          minutes: z.number().positive().optional(),
          distanceKm: z.number().nonnegative(),
          avgHr: z.number().int().positive().optional(),
        }), await readJson(req), 'run')
        const date = dateOf(body, today())
        const run = {
          at: body.at ?? iso(),
          minutes: body.minutes ?? deps.config.defaultRunMinutes,
          distanceKm: body.distanceKm,
          ...(body.avgHr === undefined ? {} : { avgHr: body.avgHr }),
        }
        await store.mutateDay(date, day => ({ ...day, run }))
        sendJson(res, 200, stateFor(date))
        return
      }

      case 'DELETE /run': {
        const body = parse(z.object({ date: DATE.optional() }), query, 'run')
        const date = dateOf(body, today())
        await store.mutateDay(date, day => ({ ...day, run: null }))
        sendJson(res, 200, stateFor(date))
        return
      }

      case 'PUT /vocab-target': {
        const body = parse(z.object({
          date: DATE.optional(),
          new: z.number().int().nonnegative(),
          review: z.number().int().nonnegative(),
        }), await readJson(req), 'vocab-target')
        const date = dateOf(body, today())
        await store.setVocabTarget(date, { new: body.new, review: body.review })
        sendJson(res, 200, stateFor(date))
        return
      }

      case 'POST /laundry/wash': {
        const body = parse(z.object({
          date: DATE.optional(),
          pieces: z.number().int().positive(),
          at: ISO.optional(),
        }), await readJson(req), 'laundry wash')
        const date = dateOf(body, today())
        const { stock } = await store.wash(date, body.pieces, body.at ?? iso())
        sendJson(res, 200, { ...stateFor(date), stock })
        return
      }

      case 'PATCH /laundry/stock': {
        const body = parse(z.object({
          pending: z.number().int().nonnegative(),
          at: ISO.optional(),
        }), await readJson(req), 'laundry stock')
        const stock = await store.setStock(body.pending, body.at ?? iso())
        sendJson(res, 200, { ...stateFor(today()), stock })
        return
      }

      case 'GET /media': {
        sendJson(res, 200, { ok: true, media: store.view(today(), today()).media })
        return
      }

      case 'POST /media': {
        const body = parse(mediaRecord.omit({ id: true, createdAt: true, status: true }).extend({
          status: mediaRecord.shape.status.optional(),
        }), await readJson(req), 'media')
        const record = mediaRecord.parse({
          ...body,
          id: store.newId(),
          status: body.status ?? 'active',
          createdAt: iso(),
        })
        await store.putMedia(record)
        sendJson(res, 200, { ok: true, media: store.view(today(), today()).media, entry: record })
        return
      }

      case 'PATCH /media': {
        const body = parse(z.object({ id: z.string().min(1), patch: z.unknown() }), await readJson(req), 'media patch')
        const patch = parse(mediaRecord.omit({ id: true, createdAt: true }).partial(), body.patch, 'media patch')
        const entry = await store.patchMedia(body.id, patch)
        sendJson(res, 200, { ok: true, media: store.view(today(), today()).media, entry })
        return
      }

      case 'DELETE /media': {
        const body = parse(z.object({ id: z.string().min(1) }), query, 'media delete')
        const removed = await store.deleteMedia(body.id)
        sendJson(res, 200, { ok: true, removed, media: store.view(today(), today()).media })
        return
      }

      case 'GET /tasks': {
        sendJson(res, 200, { ok: true, tasks: store.view(today(), today()).tasks })
        return
      }

      case 'POST /tasks': {
        const body = parse(taskRecord.omit({ id: true, createdAt: true }).partial({
          progress: true, title: true,
        }).extend({ title: z.string().min(1) }), await readJson(req), 'task')
        const record = taskRecord.parse({ ...body, id: store.newId(), createdAt: iso() })
        await store.putTask(record)
        sendJson(res, 200, { ok: true, tasks: store.view(today(), today()).tasks, entry: record })
        return
      }

      case 'PATCH /tasks': {
        const body = parse(z.object({ id: z.string().min(1), patch: z.unknown() }), await readJson(req), 'task patch')
        const patch = parse(taskRecord.omit({ id: true, createdAt: true }).partial(), body.patch, 'task patch')
        const entry = await store.patchTask(body.id, patch)
        sendJson(res, 200, { ok: true, tasks: store.view(today(), today()).tasks, entry })
        return
      }

      case 'DELETE /tasks': {
        const body = parse(z.object({ id: z.string().min(1) }), query, 'task delete')
        const removed = await store.deleteTask(body.id)
        sendJson(res, 200, { ok: true, removed, tasks: store.view(today(), today()).tasks })
        return
      }

      default:
        throw new ApiError(404, 'habit/unknown-route', `no route for ${key}`)
    }
  }

  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    try {
      await handle(req, res, url)
    } catch (error) {
      if (error instanceof ApiError) {
        sendJson(res, error.status, { error: { code: error.code, message: error.message } })
        return
      }
      if ((error as { code?: string }).code === 'missing-key') {
        sendJson(res, 404, { error: { code: 'habit/not-found', message: 'no such record' } })
        return
      }
      console.error('[personal-track] api failure', error)
      sendJson(res, 500, { error: { code: 'habit/internal', message: 'internal error' } })
    }
  }
}
