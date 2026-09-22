/**
 * Run every test file, and fail if any of them did.
 *
 * The two files this replaces were chained with `&&` in `package.json`, so the
 * first failure silently skipped the rest — half the suite could be red while
 * the command exited with one file's verdict. Every file also runs even when an
 * earlier one fails, so one run reports the whole picture.
 *
 * stdio is *inherited*, not piped: piping stdio to a child is what the DSH file
 * sandbox refuses (`spawn EPERM`), the same reason this repo calls the esbuild
 * binary instead of its JS API. Every file runs in its own Node process, so one
 * file's top-level `process.exitCode` cannot affect another's.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Every `tests/*.test.ts`, sorted for a stable order. */
const files = readdirSync('tests')
  .filter(name => name.endsWith('.test.ts'))
  .sort()
  .map(name => join('tests', name))

if (files.length === 0) {
  console.error('no test files found in tests/')
  process.exit(1)
}

const failed = []
for (const file of files) {
  console.log(`\n=== ${file} ===`)
  const result = spawnSync(process.execPath, [file], { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) failed.push(file)
}

console.log(`\n${files.length - failed.length}/${files.length} test files passed`)
for (const file of failed) console.error(`  failed: ${file}`)
if (failed.length > 0) process.exit(1)
