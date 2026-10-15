import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { workspaceManifest } from '../../src/workspace.ts'

const signal = new AbortController().signal
const gitEnv = { ...process.env, GIT_CONFIG_COUNT: '0', GIT_TERMINAL_PROMPT: '0' }

async function repository() {
  const cwd = await mkdtemp(join(tmpdir(), 'devwork-workspace-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd, env: gitEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  git('init', '-q', '-b', 'main')
  await writeFile(join(cwd, 'tracked.txt'), 'initial\n')
  await writeFile(join(cwd, 'retained.txt'), 'retained\n')
  git('add', '--', 'tracked.txt')
  git('-c', 'user.name=Devwork test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture')
  return { cwd, git }
}

test('workspace manifest compares actual tracked and non-ignored content and retains deleted baseline paths', async () => {
  const fixture = await repository()
  try {
    const baseline = await workspaceManifest(fixture.cwd, signal)
    await writeFile(join(fixture.cwd, '.gitignore'), 'retained.txt\n')
    const retained = await workspaceManifest(fixture.cwd, signal, ['retained.txt'])
    assert.equal(retained.entries.has('retained.txt'), true)
    await writeFile(join(fixture.cwd, 'tracked.txt'), 'changed\n')
    await writeFile(join(fixture.cwd, 'new.txt'), 'new\n')
    const changed = await workspaceManifest(fixture.cwd, signal, [...baseline.entries.keys()])
    assert.equal(changed.entries.has('new.txt'), true)
    assert.equal(changed.entries.get('tracked.txt')?.kind, 'file')
    await rm(join(fixture.cwd, 'tracked.txt'))
    const deleted = await workspaceManifest(fixture.cwd, signal, [...baseline.entries.keys()])
    assert.equal(deleted.entries.has('tracked.txt'), false)
  } finally {
    await rm(fixture.cwd, { recursive: true, force: true })
  }
})

test('workspace manifest rejects oversized files and filenames that are not lossless UTF-8', async () => {
  const fixture = await repository()
  const invalidPath = Buffer.concat([Buffer.from(fixture.cwd + '/invalid-'), Buffer.from([255])])
  try {
    await writeFile(join(fixture.cwd, 'oversized.bin'), '')
    await truncate(join(fixture.cwd, 'oversized.bin'), 8 * 1024 * 1024 + 1)
    await assert.rejects(() => workspaceManifest(fixture.cwd, signal), /size limit/)
    await rm(join(fixture.cwd, 'oversized.bin'))
    await writeFile(invalidPath, 'invalid name\n')
    await assert.rejects(() => workspaceManifest(fixture.cwd, signal), /lossless UTF-8/)
  } finally {
    await rm(fixture.cwd, { recursive: true, force: true })
  }
})

test('workspace manifest records symlink metadata and refuses symlinked ancestors', async () => {
  const fixture = await repository()
  const outside = await mkdtemp(join(tmpdir(), 'devwork-workspace-outside-'))
  try {
    await writeFile(join(outside, 'secret.txt'), 'private\n')
    await symlink(join(outside, 'secret.txt'), join(fixture.cwd, 'link.txt'))
    const manifest = await workspaceManifest(fixture.cwd, signal)
    assert.deepEqual(manifest.entries.get('link.txt'), { kind: 'symlink', target: join(outside, 'secret.txt') })
    await mkdir(join(fixture.cwd, 'nested'))
    await writeFile(join(fixture.cwd, 'nested', 'file.txt'), 'nested\n')
    fixture.git('add', '--', 'nested/file.txt')
    await rm(join(fixture.cwd, 'nested'), { recursive: true, force: true })
    await symlink(outside, join(fixture.cwd, 'nested'))
    await assert.rejects(() => workspaceManifest(fixture.cwd, signal), /ancestor/)
  } finally {
    await rm(fixture.cwd, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test('workspace manifest disables inherited Git config counts after environment scrubbing', async () => {
  const fixture = await repository()
  const previous = { count: process.env.GIT_CONFIG_COUNT, key: process.env.GIT_CONFIG_KEY_0, value: process.env.GIT_CONFIG_VALUE_0 }
  try {
    process.env.GIT_CONFIG_COUNT = '1'
    process.env.GIT_CONFIG_KEY_0 = 'user.name'
    process.env.GIT_CONFIG_VALUE_0 = 'Devwork test'
    const manifest = await workspaceManifest(fixture.cwd, signal)
    assert.equal(manifest.entries.has('tracked.txt'), true)
  } finally {
    if (previous.count === undefined) delete process.env.GIT_CONFIG_COUNT
    else process.env.GIT_CONFIG_COUNT = previous.count
    if (previous.key === undefined) delete process.env.GIT_CONFIG_KEY_0
    else process.env.GIT_CONFIG_KEY_0 = previous.key
    if (previous.value === undefined) delete process.env.GIT_CONFIG_VALUE_0
    else process.env.GIT_CONFIG_VALUE_0 = previous.value
    await rm(fixture.cwd, { recursive: true, force: true })
  }
})
