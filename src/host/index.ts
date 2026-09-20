/**
 * personal-track — host half.
 *
 * Opens the habit storage domain and serves the plugin's own JSON API on
 * `ctx.webServer`. Transport rationale: docs/adr/0001-out-of-tree-transport.md.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-storage-domain'
import { API_PREFIX, createApiHandler } from './api.ts'
import { createBackup } from './backup.ts'
import { Config, boundaryOf } from './config.ts'
import { habitDomainSpec } from './domain.ts'
import { createHabitStore } from './store.ts'

/** Plugin display name (diagnostics); the patch row's `id` must equal this. */
export const name = 'personal-track'

/** Required services: both must be live before `apply` runs. */
export const inject = ['storageDomain', 'webServer']

export { Config }

/** Open the domain, build the store, and serve the API. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const domain = await ctx.storageDomain.open(habitDomainSpec)
  ctx.effect(() => () => domain.close(), 'personal-track: close habit domain')

  const handler = createApiHandler({
    store: createHabitStore(domain, config),
    backup: createBackup(domain),
    boundary: boundaryOf(config),
    config,
    now: () => new Date(),
  })

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler,
  }), 'personal-track: /habit/api routes')
}
