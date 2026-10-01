import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
assert.match(pkg.version, /^\d+\.\d+\.\d+-alpha\.\d+$/, 'Only alpha releases are configured')
assert.equal(process.argv[2], `v${pkg.version}`, 'Git tag must match package.json version')
console.log(`Release tag verified: v${pkg.version}`)
