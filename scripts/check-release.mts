import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseJson, record, string } from './data.mts'

const pkg = record(parseJson(readFileSync(new URL('../package.json', import.meta.url), 'utf8')))
const version = string(pkg.version)
assert.match(version, /^\d+\.\d+\.\d+-alpha\.\d+$/, 'Only alpha releases are configured')
assert.equal(process.argv[2], `v${version}`, 'Git tag must match package.json version')
console.log(`Release tag verified: v${version}`)
