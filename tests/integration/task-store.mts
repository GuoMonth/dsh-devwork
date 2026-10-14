import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { FileTaskLogStore, MemoryTaskLogStore, TaskDomainError, TaskRepository, parseTaskLog } from '../../lib/task-center/index.js'
import type { TaskLog, TaskLogStore } from '../../lib/task-center/index.js'

const create = (id: string) => ({ type: 'task.create', id, parentId: null, title: id, goal: id, scope: [], acceptance: ['accepted'], dependencyIds: [] })

test('local task log survives restart and rejects stale writes and lock contention', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devwork-task-log-'))
  const path = join(directory, 'tasks.json')
  try {
    const store = new FileTaskLogStore(path)
    const repo = new TaskRepository(store)
    await repo.dispatch(create('one'))
    const first = parseTaskLog(await store.load())
    await repo.dispatch(create('two'))
    const reopened = new TaskRepository(new FileTaskLogStore(path))
    assert.deepEqual((await reopened.snapshot()).tasks.map(task => task.id), ['one', 'two'])
    await assert.rejects(() => store.save(first, 0), /changed/)
    await writeFile(`${path}.lock`, 'another writer or interrupted write')
    await assert.rejects(() => reopened.dispatch(create('three')), /EEXIST/)
    assert.equal((await reopened.snapshot()).revision, 2)
    await rm(`${path}.lock`)
    await reopened.dispatch(create('three'))
    assert.deepEqual(await readdir(directory), ['tasks.json'])
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('corrupt or unknown persisted data is reported and never overwritten', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devwork-corrupt-log-'))
  const path = join(directory, 'tasks.json')
  try {
    const repo = new TaskRepository(new FileTaskLogStore(path))
    for (const source of ['{truncated', JSON.stringify({ version: 1, events: [], unexpected: true }), JSON.stringify({ version: 99, events: [] })]) {
      await writeFile(path, source)
      await assert.rejects(() => repo.snapshot(), TaskDomainError)
      await assert.rejects(() => repo.dispatch(create('overwrite')), TaskDomainError)
      assert.equal(await readFile(path, 'utf8'), source)
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('mock store failures and concurrent repositories preserve committed history', async () => {
  const memory = new MemoryTaskLogStore()
  let fail = true
  const store: TaskLogStore = {
    load: () => memory.load(),
    save: async (log: TaskLog, revision: number) => {
      if (fail) throw new Error('disk unavailable')
      await memory.save(log, revision)
    },
  }
  const repo = new TaskRepository(store)
  await assert.rejects(() => repo.dispatch(create('lost')), /disk unavailable/)
  assert.equal((await repo.snapshot()).revision, 0)
  fail = false
  await repo.dispatch(create('kept'))
  const other = new TaskRepository(store)
  const results = await Promise.allSettled([repo.dispatch(create('two')), other.dispatch(create('three'))])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal((await repo.snapshot()).revision, 2)
  await assert.rejects(() => repo.dispatch({ ...create('unknown'), extra: true }), /Unknown field/)
  assert.equal((await repo.snapshot()).revision, 2)
})
