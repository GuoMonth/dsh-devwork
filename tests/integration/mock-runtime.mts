import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shellQuote } from '../../src/bash.ts'

test('mock integration fixture keeps acceptance commands as one shell argument', () => {
  const quoted = shellQuote("node -e \"console.log('ok')\"")
  assert.equal(quoted.at(0), "'")
  assert.equal(quoted.at(-1), "'")
  const escape = quoted.indexOf('\\')
  assert.ok(escape > 0 && quoted.charCodeAt(escape + 1) === 39, 'single quotes must be escaped for the shell')
})
