import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contentLines, fileDiff } from '../../src/review.ts'
import type { WorkspaceEntry, WorkspaceManifest } from '../../src/workspace.ts'

function manifest(entry?: WorkspaceEntry): WorkspaceManifest {
  return { fingerprint: 'unit-fixture', entries: new Map(entry ? [['math.ts', entry]] : []) }
}
function file(text: string): WorkspaceEntry {
  return { kind: 'file', mode: 0, bytes: Buffer.from(text) }
}

test('review retains exact text and distinguishes an empty file from a deletion', () => {
  const before = manifest(file('return a - b\n'))
  assert.deepEqual(fileDiff(before, manifest(file('return a + b')), 'math.ts'), {
    path: 'math.ts', before: { kind: 'file', mode: 0, bytes: 13 }, after: { kind: 'file', mode: 0, bytes: 12 },
    kind: 'text', coarse: true, oldText: 'return a - b\n', newText: 'return a + b',
  })
  assert.deepEqual(fileDiff(before, manifest(file('')), 'math.ts').after, { kind: 'file', mode: 0, bytes: 0 })
  assert.deepEqual(fileDiff(before, manifest(), 'math.ts').after, { kind: 'absent' })
})

test('review refuses text anchors for binary, invalid UTF-8 and symlink contents', () => {
  const entries: WorkspaceEntry[] = [
    { kind: 'file', mode: 0, bytes: Buffer.from([0]) },
    { kind: 'file', mode: 0, bytes: Buffer.from([0xff]) },
    { kind: 'symlink', target: '/outside/unread' },
  ]
  for (const entry of entries) {
    assert.equal(fileDiff(manifest(file('old')), manifest(entry), 'math.ts').kind, 'metadata')
  }
})

test('feedback line numbers preserve blank lines without inventing a final line', () => {
  assert.deepEqual(contentLines(''), [])
  assert.deepEqual(contentLines('\n'), [''])
  assert.deepEqual(contentLines('first\n\nlast\n'), ['first', '', 'last'])
  assert.deepEqual(contentLines('first\n\nlast'), ['first', '', 'last'])
})
