/**
 * Plugin configuration and the habit-day boundary it carries.
 *
 * Anything two deployments may want to set differently is a config field, so
 * the boundary hour, the timezone override and the fallback vocabulary target
 * all live here rather than in code. There is deliberately **no** stored
 * settings document: configuration is not a fact, so it never enters the
 * domain (see docs/adr/0002-derived-state-not-stored.md).
 */
import Schema from '@deepseek-ai/schemastery'

/** Vocabulary target used on the first habit day that ever exists. */
export interface VocabTarget {
  readonly new: number
  readonly review: number
}

/** Configuration accepted from `cordis.yml`. */
export interface Config {
  /** Hour the habit day starts (0–23); 00:00–this belongs to the previous day. */
  dayStartHour: number
  /** IANA timezone for the boundary; omit to follow the host's local zone. */
  timezone?: string
  /** Fallback vocabulary target for days with no earlier snapshot to inherit. */
  defaultVocabTarget: VocabTarget
  /** Duration a running entry starts with in the UI. */
  defaultRunMinutes: number
}

/** Validated configuration schema. */
export const Config: Schema<Config> = Schema.object({
  dayStartHour: Schema.number().min(0).max(23).default(4),
  timezone: Schema.string(),
  defaultVocabTarget: Schema.object({
    new: Schema.number().min(0).default(20),
    review: Schema.number().min(0).default(60),
  }).default({ new: 20, review: 60 }),
  defaultRunMinutes: Schema.number().min(1).default(30),
})

/** The part of the configuration that habit-day arithmetic needs. */
export interface DayBoundary {
  readonly dayStartHour: number
  readonly timezone?: string
}

/** Project a validated config into the boundary the day-key helpers take. */
export function boundaryOf(config: Config): DayBoundary {
  return config.timezone === undefined
    ? { dayStartHour: config.dayStartHour }
    : { dayStartHour: config.dayStartHour, timezone: config.timezone }
}
