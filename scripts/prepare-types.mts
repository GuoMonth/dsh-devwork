import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { record, parseJson } from './data.mts'

// rc.2's public register overload indexes the Host state map with Client keys.
// Some public entries expose the Client key without the private Host state.
// Intersect the keys: preserve every constraint and keep skipLibCheck=false.
// Development-only declaration correction; no runtime/package output changes.
const root = new URL('../node_modules/@deepseek-ai/dsh-session-projection/', import.meta.url)
const metadata = record(parseJson(readFileSync(new URL('package.json', root), 'utf8')))
assert.equal(metadata.version, '0.2.0-rc.2', 'Reassess the declaration correction on a DSH upgrade')
const file = new URL('lib/types/index.d.ts', root)
const original = 'register<K extends keyof SessionProjectionMap, S extends SessionProjectionStateMap[K]>'
const corrected = 'register<K extends keyof SessionProjectionMap & keyof SessionProjectionStateMap, S extends SessionProjectionStateMap[K]>'
const source = readFileSync(file, 'utf8')
if (!source.includes(corrected)) {
  assert.equal(source.split(original).length, 2, 'Upstream declaration changed; do not apply an unreviewed correction')
  writeFileSync(file, source.replace(original, corrected))
}
