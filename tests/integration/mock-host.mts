import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import {
  MockDeliveryProvider,
  MemoryTaskLogStore,
  TaskPanelHost,
  TaskRepository,
} from '../../lib/task-center/index.js'
import type { AgentExecutionRequest, SessionCreateRequest } from '../../lib/task-center/index.js'

class MockSessions {
  readonly requests: SessionCreateRequest[] = []
  async create(request: SessionCreateRequest): Promise<unknown> {
    this.requests.push(request)
    return { externalSessionId: `external:${request.sessionId}` }
  }
}

function definition() {
  return {
    id: 'root', title: 'Root task', goal: 'Deliver root', scope: ['src'], acceptance: ['checks pass'], dependencyIds: [],
    children: [
      { id: 'child-a', title: 'Child A', goal: 'A', scope: ['src/a'], acceptance: ['A passes'], dependencyIds: [] },
      { id: 'child-b', title: 'Child B', goal: 'B', scope: ['src/b'], acceptance: ['B passes'], dependencyIds: [] },
    ],
  }
}

async function ready(host: TaskPanelHost): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (host.getSnapshot().kind !== 'loading') return
    await new Promise(resolve => setTimeout(resolve, 1))
  }
  throw new Error('Host snapshot did not load')
}

test('Host bridge owns one projection for scoped panel actions and explicit provider handoff', async () => {
  const sessions = new MockSessions()
  const repository = new TaskRepository(new MemoryTaskLogStore())
  const agent = { id: 'mock-agent', execute: async (_request: AgentExecutionRequest) => ({ outcome: 'succeeded' }) }
  const provider = new MockDeliveryProvider()
  const opened: string[] = []
  const viewed: string[] = []
  const authorized: string[] = []
  const ctx = new Context()
  const host = new TaskPanelHost(ctx, {
    repository,
    providers: { sessions, agents: agent, delivery: [provider] },
    workingDirectory: '/tmp/leader',
    openSession: async external => { opened.push(external) },
    view: async target => { viewed.push(target.id) },
    authorizeMerge: async integration => { authorized.push(integration.id) },
  })
  try {
    await ready(host)
    const source = host.taskPanelSource.forSession?.('external:session:root')
    assert.ok(source)
    const listeners: (() => void)[] = []
    const unsubscribe = source.subscribe({ sessionId: 'external:session:root' }, () => listeners.push(() => {}))
    await source.actions.create?.({ sessionId: 'external:session:root' }, definition())
    const created = source.getSnapshot({ sessionId: 'external:session:root' })
    assert.equal(created.kind, 'ready')
    if (created.kind !== 'ready') throw new Error('Expected ready projection')
    assert.deepEqual(created.projection.tasks.map(task => task.id), ['root', 'child-a', 'child-b'])
    assert.equal(created.projection.tasks.every(task => task.workingDirectory === '/tmp/leader'), true)
    assert.equal(sessions.requests.length, 3)
    await source.actions.open?.('root', 'session:root', { sessionId: 'external:session:root' })
    assert.deepEqual(opened, ['external:session:root'])
    await source.actions.continue?.('child-a', 'session:child-a', { sessionId: 'external:session:root' })
    await source.actions.continue?.('child-b', 'session:child-b', { sessionId: 'external:session:root' })
    await source.actions.continue?.('root', 'session:root', { sessionId: 'external:session:root' })
    await host.delivery?.recordArtifact({ id: 'artifact', taskId: 'root', kind: 'commit', uri: 'commit:abc', commit: { sha: 'abc', branch: 'task/root' } })
    await host.delivery?.createIntegration({ id: 'integration', taskId: 'root', artifactId: 'artifact', title: 'Root', provider: 'github', repository: 'owner/repo', sourceRef: 'task/root', targetRef: 'main', headSha: 'abc' })
    const projection = host.getSnapshot()
    assert.equal(projection.kind, 'ready')
    if (projection.kind !== 'ready') throw new Error('Expected projection')
    const integration = projection.projection.integrations[0]
    assert.ok(integration)
    await source.actions.view?.(integration, { sessionId: 'external:session:root' })
    await source.actions.authorize?.(integration.id, { sessionId: 'external:session:root' })
    assert.deepEqual(viewed, ['integration'])
    assert.deepEqual(authorized, ['integration'])
    const authorization = host.authorizeMerge({ provider: 'github', providerRef: integration.providerRef, repository: integration.repository, ref: integration.ref, headSha: integration.headSha })
    await host.merge(integration.id, authorization)
    assert.equal(host.getSnapshot().kind, 'ready')
    unsubscribe()
    host.dispose()
    assert.deepEqual(source.getSnapshot({ sessionId: 'external:session:root'}), { kind: 'unavailable', message: 'Task source unloaded.' })
  } finally {
    host.dispose()
    await ctx.fiber.dispose()
  }
})

test('Host bridge is unavailable without explicit providers and preserves unknown provider work', async () => {
  const ctx = new Context()
  const host = new TaskPanelHost(ctx, { repository: new TaskRepository(new MemoryTaskLogStore()) })
  try {
    assert.equal(host.getSnapshot().kind, 'unavailable')
    assert.equal(host.taskPanelSource.getSnapshot({ sessionId: 'selected' }).kind, 'unavailable')
  } finally {
    host.dispose()
    await ctx.fiber.dispose()
  }
})
