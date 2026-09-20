/**
 * personal-track — host half (M0 skeleton).
 *
 * Serves this plugin's own JSON API on `ctx.webServer`; the habit storage
 * domain is opened here from M1 on. Transport rationale:
 * docs/adr/0001-out-of-tree-transport.md.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

/** Plugin display name (diagnostics). */
export const name = 'personal-track'

/** Required services: both must be live before `apply` runs. */
export const inject = ['storageDomain', 'webServer']

/** The API prefix this plugin owns on the GUI host. */
const API_PREFIX = '/habit/api'

/** Register the M0 placeholder route. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({
        ok: true,
        plugin: name,
        stage: 'M0',
        url: req.url ?? null,
      }))
    },
  }), 'personal-track: /habit/api route')
}
