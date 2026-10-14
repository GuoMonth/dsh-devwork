import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { FileTaskLogStore, MemoryTaskLogStore, MockAgentProvider, MockSessionProvider, TaskDomainError, TaskExecutionEngine, TaskRepository } from '../../lib/task-center/index.js'

const plan = {
  id: 'root', title: 'Root task', goal: 'Complete the root', scope: ['src'], acceptance: ['children complete'],
  children: [
    { id: 'child-a', title: 'Child A', goal: 'Complete A', scope: ['src/a'], acceptance: ['A passes'] },
    { id: 'child-b', title: 'Child B', goal: 'Complete B', scope: ['src/b'], acceptance: ['B passes'] },
  ],
}

test('mock execution registers parent and children, then retries in one Session', async () => {
  const repository = new TaskRepository(new MemoryTaskLogStore())
  const sessions = new MockSessionProvider()
  const agents = new MockAgentProvider([{ outcome: 'failed', reason: 'scripted failure' }, { outcome: 'succeeded' }])
  const engine = new TaskExecutionEngine(repository, { sessions, agents })
  let result = await engine.intake(plan)
  assert.deepEqual(result.view.tasks.map(task => task.id), ['root', 'child-a', 'child-b'])
  assert.deepEqual(result.view.sessions.map(session => session.id), ['session:root', 'session:child-a', 'session:child-b'])
  assert.equal(result.tree[0]?.progress.total, 2)
  await assert.rejects(() => engine.intake(plan), /Duplicate task/)
  result = await engine.execute('child-a')
  assert.equal(result.view.tasks.find(task => task.id === 'child-a')?.status, 'failed')
  result = await engine.execute('child-a')
  assert.equal(result.view.tasks.find(task => task.id === 'child-a')?.status, 'review')
  assert.deepEqual(result.view.attempts.filter(attempt => attempt.sessionId === 'session:child-a').map(attempt => attempt.number), [1, 2])
  assert.equal(result.view.attempts[1]?.sessionId, 'session:child-a')
  assert.equal(agents.requests.length, 2)
})

test('blocked dependency and cancellation survive reopening the log', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devwork-execution-'))
  const path = join(directory, 'tasks.json')
  try {
    const store = new FileTaskLogStore(path)
    const repository = new TaskRepository(store)
    const sessions = new MockSessionProvider()
    const agents = new MockAgentProvider()
    const engine = new TaskExecutionEngine(repository, { sessions, agents })
    await engine.intake({ id: 'dependency', title: 'Dependency', goal: 'Wait', scope: [], acceptance: ['done'] })
    await engine.intake({ id: 'consumer', title: 'Consumer', goal: 'Use dependency', scope: [], acceptance: ['done'], dependencyIds: ['dependency'] })
    await assert.rejects(() => engine.execute('consumer'), /unfinished dependencies/)
    await engine.block('dependency', 'waiting for external input')
    const reopened = new TaskRepository(new FileTaskLogStore(path))
    let view = await reopened.snapshot()
    assert.equal(view.tasks.find(task => task.id === 'dependency')?.status, 'blocked')
    assert.equal(view.tasks.find(task => task.id === 'dependency')?.blockedReason, 'waiting for external input')
    const reopenedEngine = new TaskExecutionEngine(reopened, { sessions: new MockSessionProvider(), agents: new MockAgentProvider() })
    await reopenedEngine.cancel('consumer')
    view = await reopened.snapshot()
    assert.equal(view.tasks.find(task => task.id === 'consumer')?.status, 'cancelled')
    await assert.rejects(() => reopened.dispatch({ type: 'session.create', id: 'duplicate', taskId: 'consumer', externalSessionId: null }), TaskDomainError)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('one executor reservation rejects a concurrent task and preserves a cancellation race', async () => {
  const repository = new TaskRepository(new MemoryTaskLogStore())
  const sessions = new MockSessionProvider()
  let release: ((result: { outcome: 'succeeded' }) => void) | undefined
  const entered = new Promise<void>(resolve => {
    release = () => resolve()
  })
  const agents = {
    id: 'slow-agent',
    execute: async () => {
      await entered
      return { outcome: 'succeeded' as const }
    },
  }
  const engine = new TaskExecutionEngine(repository, { sessions, agents })
  await engine.intake({ id: 'one', title: 'One', goal: 'One', scope: [], acceptance: ['done'] })
  await engine.intake({ id: 'two', title: 'Two', goal: 'Two', scope: [], acceptance: ['done'] })
  const first = engine.execute('one')
  while (engine.activeExecutor === null) await new Promise(resolve => setTimeout(resolve, 1))
  await assert.rejects(() => engine.execute('two'), /already active/)
  await engine.cancel('one')
  release?.({ outcome: 'succeeded' })
  const result = await first
  assert.equal(result.view.tasks.find(task => task.id === 'one')?.status, 'cancelled')
  assert.equal(engine.activeExecutor, null)
})
