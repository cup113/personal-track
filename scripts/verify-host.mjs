/**
 * Verify the built host half against the real framework services.
 *
 * Mounts the actual `@deepseek-ai/dsh-host-webserver` (OS-assigned port) plus
 * the built plugin on a real Cordis context, then makes a real HTTP request to
 * the plugin's own prefix. `storageDomain` is stubbed for M0 — M1 replaces the
 * stub with the real domain.
 */
import { strict as assert } from 'node:assert'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { apply } from '../lib/index.js'

const ctx = new Context()

// M0 stub: the habit domain arrives in M1.
ctx.provide('storageDomain', {
  open: async () => ({ close: async () => {} }),
})

const serverFiber = await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
const pluginFiber = await ctx.plugin({ name: 'personal-track', inject: ['storageDomain', 'webServer'], apply })

const deadline = Date.now() + 5000
while (!ctx.webServer?.port) {
  assert.ok(Date.now() < deadline, 'the web server never reported a listening port')
  await new Promise(resolve => setTimeout(resolve, 20))
}

const port = ctx.webServer.port
const response = await fetch(`http://127.0.0.1:${port}/habit/api/state`)
assert.equal(response.status, 200, 'the plugin route answers 200')
assert.match(response.headers.get('content-type') ?? '', /application\/json/)

const body = await response.json()
assert.equal(body.ok, true)
assert.equal(body.plugin, 'personal-track')
assert.equal(body.stage, 'M0')
assert.equal(body.url, '/habit/api/state')

// Prefix semantics: `p` matches `p` and `p/<anything>`, nothing else.
const deeper = await fetch(`http://127.0.0.1:${port}/habit/api/anything/else`)
assert.equal(deeper.status, 200, 'the prefix route owns everything below /habit/api')

// `/habit` is a different path, unclaimed, and no fallback is registered here.
const miss = await fetch(`http://127.0.0.1:${port}/habit`)
assert.equal(miss.status, 404, 'an unclaimed path is not swallowed by our prefix route')

// Unloading the plugin removes its route; unloading the server releases the socket.
await pluginFiber.dispose()
await serverFiber.dispose()

console.log(`host half ✓  /habit/api answered on a real socket (port ${port})`)
