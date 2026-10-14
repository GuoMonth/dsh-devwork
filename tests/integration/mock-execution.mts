import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  FileTaskLogStore,
  MemoryTaskLogStore,
  TaskDomainError,
  TaskExecutionEngine,
  TaskRepository,
} from '../../lib/task-center/index.js'
import type {
  AgentExecutionRequest,
  AgentExecutionResult,
  AgentProvider,
  SessionCreateRequest,
  SessionProvider,
  TaskLog,
  TaskLogStore,
} from '../../lib/task-center/index.js'

const plan = {
  id: 'root', title: 'Root task', goal: 'Complete the root', scope: ['src'], acceptance: ['children complete'],
  children: [
    { id: 'child-a', title: 'Child A', goal: 'Complete A', scope: ['src/a'], acceptance: ['A passes'] },
    { id: 'child-b', title: 'Child B', goal: 'Complete B', scope: ['src/b'], acceptance: ['B passes'] },
  ],
}

class MockSessionProvider implements SessionProvider {
  readonly requests: SessionCreateRequest[] = []
  async create(request: SessionCreateRequest, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted()
    this.requests.push(request)
    return { externalSessionId: `external:${request.sessionId}` }
  }
}

class MockAgentProvider implements AgentProvider {
  readonly id = 'mock-agent'
  readonly requests: AgentExecutionRequest[] = []
  private readonly results: readonly AgentExecutionResult[]
  private index = 0
  constructor(results: readonly AgentExecutionResult[] = [{ outcome: 'succeeded' }]) { this.results = results }
  async execute(request: AgentExecutionRequest): Promise<unknown> {
    this.requests.push(request)
    const result = this.results[Math.min(this.index++, this.results.length - 1)]
    return result ?? { outcome: 'succeeded' }
  }
}

function engine(repository: TaskRepository, sessions: SessionProvider, agents: AgentProvider): TaskExecutionEngine {
  return new TaskExecutionEngine({ repository, providers: { sessions, agents } })
}

test('mock execution registers parent and both children, then retries in one Session', async () => {
  const repository = new TaskRepository(new MemoryTaskLogStore())
  const sessions = new MockSessionProvider()
  const agents = new MockAgentProvider([{ outcome: 'failed', reason: 'scripted failure' }, { outcome: 'succeeded' }])
  const execution = engine(repository, sessions, agents)
  let result = await execution.intake(plan)
  assert.deepEqual(result.view.tasks.map(task => task.id), ['root', 'child-a', 'child-b'])
  assert.deepEqual(result.view.sessions.map(session => session.id), ['session:root', 'session:child-a', 'session:child-b'])
  assert.equal(result.tree[0]?.progress.total, 2)
  await assert.rejects(() => execution.intake(plan), /Duplicate task/)
  await assert.rejects(() => repository.dispatch({ type: 'session.create', id: 'another-session', taskId: 'child-a', externalSessionId: null }), /primary session/)
  result = await execution.execute('child-a')
  assert.equal(result.view.tasks.find(task => task.id === 'child-a')?.status, 'failed')
  result = await execution.retry('child-a')
  assert.equal(result.view.tasks.find(task => task.id === 'child-a')?.status, 'review')
  await repository.dispatch({ type: 'task.transition', taskId: 'child-a', status: 'completed' })

  await execution.execute('child-b')
  await repository.dispatch({ type: 'task.transition', taskId: 'child-b', status: 'completed' })
  result = await execution.execute('root')
  assert.equal(result.view.tasks.find(task => task.id === 'root')?.status, 'review')
  await repository.dispatch({ type: 'task.transition', taskId: 'root', status: 'completed' })
  result = await execution.snapshot()
  assert.deepEqual(result.view.tasks.map(task => task.status), ['completed', 'completed', 'completed'])
  assert.deepEqual(result.view.attempts.filter(attempt => attempt.sessionId === 'session:child-a').map(attempt => attempt.number), [1, 2])
  assert.equal(result.view.attempts.find(attempt => attempt.sessionId === 'session:child-a')?.sessionId, 'session:child-a')
  assert.equal(agents.requests.length, 4)
  assert.equal(sessions.requests.length, 3)
  assert.equal(sessions.requests[0]?.idempotencyKey, 'dsh-devwork/session/session:root')
})

test('blocked dependency and cancellation survive reopening the log', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devwork-execution-'))
  const path = join(directory, 'tasks.json')
  try {
    const store = new FileTaskLogStore(path)
    const repository = new TaskRepository(store)
    const sessions = new MockSessionProvider()
    const agents = new MockAgentProvider()
    const execution = engine(repository, sessions, agents)
    await execution.intake({ id: 'dependency', title: 'Dependency', goal: 'Wait', scope: [], acceptance: ['done'] })
    await execution.intake({ id: 'consumer', title: 'Consumer', goal: 'Use dependency', scope: [], acceptance: ['done'], dependencyIds: ['dependency'] })
    await assert.rejects(() => execution.execute('consumer'), /unfinished dependencies/)
    await execution.block('dependency', 'waiting for external input')
    const reopened = new TaskRepository(new FileTaskLogStore(path))
    let view = await reopened.snapshot()
    assert.equal(view.tasks.find(task => task.id === 'dependency')?.status, 'blocked')
    assert.equal(view.tasks.find(task => task.id === 'dependency')?.blockedReason, 'waiting for external input')
    const reopenedEngine = engine(reopened, new MockSessionProvider(), new MockAgentProvider())
    await reopenedEngine.cancel('consumer')
    view = await reopened.snapshot()
    assert.equal(view.tasks.find(task => task.id === 'consumer')?.status, 'cancelled')
    await assert.rejects(() => reopened.dispatch({ type: 'session.create', id: 'duplicate', taskId: 'consumer', externalSessionId: null }), TaskDomainError)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('a deferred provider observes cancellation and cannot settle after cancel', async () => {
  const repository = new TaskRepository(new MemoryTaskLogStore())
  const sessions = new MockSessionProvider()
  let start!: () => void
  let release!: () => void
  const entered = new Promise<void>(resolve => { start = resolve })
  const deferred = new Promise<void>(resolve => { release = resolve })
  let observedSignal: AbortSignal | undefined
  const agents: AgentProvider = {
    id: 'slow-agent',
    execute: async request => {
      observedSignal = request.signal
      start()
      await deferred
      return { outcome: 'succeeded' }
    },
  }
  const execution = engine(repository, sessions, agents)
  await execution.intake({ id: 'one', title: 'One', goal: 'One', scope: [], acceptance: ['done'] })
  const running = execution.execute('one')
  await entered
  await execution.cancel('one')
  assert.equal(observedSignal?.aborted, true)
  release()
  const result = await running
  assert.equal(result.view.tasks.find(task => task.id === 'one')?.status, 'cancelled')
  assert.equal(execution.activeExecutor, null)
})

test('pause then continue fences a late result from the old invocation', async () => {
  const repository = new TaskRepository(new MemoryTaskLogStore())
  const sessions = new MockSessionProvider()
  let calls = 0
  let firstStarted!: () => void
  let secondStarted!: () => void
  let firstRelease!: () => void
  let secondRelease!: () => void
  const firstEntered = new Promise<void>(resolve => { firstStarted = resolve })
  const secondEntered = new Promise<void>(resolve => { secondStarted = resolve })
  const firstDeferred = new Promise<void>(resolve => { firstRelease = resolve })
  const secondDeferred = new Promise<void>(resolve => { secondRelease = resolve })
  const agents: AgentProvider = {
    id: 'deferred-agent',
    execute: async () => {
      calls += 1
      if (calls === 1) { firstStarted(); await firstDeferred; return { outcome: 'succeeded' } }
      secondStarted(); await secondDeferred; return { outcome: 'succeeded' }
    },
  }
  const execution = engine(repository, sessions, agents)
  await execution.intake({ id: 'pause-me', title: 'Pause me', goal: 'Pause me', scope: [], acceptance: ['done'] })
  const first = execution.execute('pause-me')
  await firstEntered
  await execution.pause('pause-me')
  const resumed = execution.continue('pause-me')
  await secondEntered
  firstRelease()
  const staleResult = await first
  assert.equal(staleResult.view.tasks.find(task => task.id === 'pause-me')?.status, 'active')
  secondRelease()
  const result = await resumed
  assert.equal(result.view.tasks.find(task => task.id === 'pause-me')?.status, 'review')
  assert.deepEqual(result.view.attempts.map(attempt => attempt.number), [1])
  assert.equal(result.view.attempts[0]?.status, 'succeeded')
})

test('caller abort settles cancellation even when provider ignores the signal', async () => {
  const repository = new TaskRepository(new MemoryTaskLogStore())
  const sessions = new MockSessionProvider()
  let entered!: () => void
  let release!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const deferred = new Promise<void>(resolve => { release = resolve })
  let signal!: AbortSignal
  const agents: AgentProvider = {
    id: 'ignoring-agent',
    execute: async request => {
      signal = request.signal
      entered()
      await deferred
      return { outcome: 'succeeded' }
    },
  }
  const execution = engine(repository, sessions, agents)
  await execution.intake({ id: 'abort-me', title: 'Abort me', goal: 'Abort me', scope: [], acceptance: ['done'] })
  const caller = new AbortController()
  const running = execution.execute('abort-me', { signal: caller.signal })
  await started
  caller.abort()
  assert.equal(signal.aborted, true)
  release()
  const result = await running
  assert.equal(result.view.tasks.find(task => task.id === 'abort-me')?.status, 'cancelled')
})

test('concurrent provisioning is serialized and malformed provider handles are rejected', async () => {
  const repository = new TaskRepository(new MemoryTaskLogStore())
  let calls = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const sessions: SessionProvider = {
    create: async request => {
      calls += 1
      await gate
      return { externalSessionId: `bound:${request.sessionId}` }
    },
  }
  const execution = engine(repository, sessions, new MockAgentProvider())
  await repository.dispatch({ type: 'task.create', id: 'provision', parentId: null, title: 'Provision', goal: 'Provision', scope: [], acceptance: ['done'], dependencyIds: [] })
  await repository.dispatch({ type: 'session.create', id: 'session:provision', taskId: 'provision', externalSessionId: null })
  const first = execution.provisionSessions()
  const second = execution.provisionSessions()
  release()
  await Promise.all([first, second])
  assert.equal(calls, 1)
  const view = await repository.snapshot()
  assert.equal(view.sessions[0]?.externalSessionId, 'bound:session:provision')

  let failSave = false
  const failingStore = new (class implements TaskLogStore {
    private readonly inner = new MemoryTaskLogStore()
    async load(): Promise<unknown> { return this.inner.load() }
    async save(log: TaskLog, expectedRevision: number): Promise<void> {
      if (failSave) { failSave = false; throw new Error('persistence failed') }
      await this.inner.save(log, expectedRevision)
    }
  })()
  const retryRepository = new TaskRepository(failingStore)
  let retryCalls = 0
  const retrySessions: SessionProvider = { create: async request => { retryCalls += 1; return { externalSessionId: `retry:${request.sessionId}` } } }
  const retryExecution = engine(retryRepository, retrySessions, new MockAgentProvider())
  await retryRepository.dispatch({ type: 'task.create', id: 'persist', parentId: null, title: 'Persist', goal: 'Persist', scope: [], acceptance: ['done'], dependencyIds: [] })
  await retryRepository.dispatch({ type: 'session.create', id: 'session:persist', taskId: 'persist', externalSessionId: null })
  failSave = true
  await assert.rejects(() => retryExecution.provisionSessions(), /persistence failed/)
  await retryExecution.provisionSessions()
  assert.equal(retryCalls, 1)

  const invalidRepository = new TaskRepository(new MemoryTaskLogStore())
  const invalidExecution = engine(invalidRepository, { create: async () => ({ nope: true }) }, new MockAgentProvider())
  await invalidRepository.dispatch({ type: 'task.create', id: 'invalid', parentId: null, title: 'Invalid', goal: 'Invalid', scope: [], acceptance: ['done'], dependencyIds: [] })
  await invalidRepository.dispatch({ type: 'session.create', id: 'session:invalid', taskId: 'invalid', externalSessionId: null })
  await assert.rejects(() => invalidExecution.provisionSessions(), /invalid handle/)
})

test('external execution requires a bound primary Session', async () => {
  const repository = new TaskRepository(new MemoryTaskLogStore())
  await repository.dispatch({ type: 'task.create', id: 'unbound', parentId: null, title: 'Unbound', goal: 'Unbound', scope: [], acceptance: ['done'], dependencyIds: [] })
  await repository.dispatch({ type: 'session.create', id: 'session:unbound', taskId: 'unbound', externalSessionId: null })
  const execution = engine(repository, { create: async () => ({ externalSessionId: 'never-used' }) }, new MockAgentProvider())
  await assert.rejects(() => execution.execute('unbound'), /not provisioned/)
})

test('invalid agent responses fail the Attempt instead of entering the domain', async () => {
  const repository = new TaskRepository(new MemoryTaskLogStore())
  const execution = engine(repository, new MockSessionProvider(), { id: 'invalid-agent', execute: async () => ({ outcome: 'unexpected' }) })
  await execution.intake({ id: 'invalid-result', title: 'Invalid result', goal: 'Invalid result', scope: [], acceptance: ['done'] })
  const result = await execution.execute('invalid-result')
  assert.equal(result.view.tasks.find(task => task.id === 'invalid-result')?.status, 'failed')
  assert.match(result.view.tasks.find(task => task.id === 'invalid-result')?.blockedReason ?? '', /invalid execution outcome/)
})
