import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GitHubProvider, GitLabProvider, MemoryTaskLogStore, MockDeliveryProvider, TaskDeliveryService, TaskDomainError, TaskRepository, authorizeMerge } from '../../lib/task-center/index.js'
import type { CleanupAdapter, CleanupInspection } from '../../lib/task-center/index.js'
import type { FetchLike } from '../../lib/task-center/providers/http.js'

const at = new Date('2026-10-14T00:00:00.000Z')
const createTask = (id = 'task') => ({ type: 'task.create' as const, id, parentId: null, title: id, goal: id, scope: ['src'], acceptance: ['checks pass'], dependencyIds: [] })

class MockCleanup implements CleanupAdapter {
  state: CleanupInspection = { owned: true, clean: true, pushed: true, fullyDelivered: true, status: 'ready' }
  removes = 0
  async inspect(): Promise<CleanupInspection> { return this.state }
  async remove(): Promise<void> { this.removes += 1 }
}

async function setup() {
  const repository = new TaskRepository(new MemoryTaskLogStore(), () => at)
  await repository.dispatch(createTask())
  const provider = new MockDeliveryProvider('github')
  const cleanup = new MockCleanup()
  const service = new TaskDeliveryService(repository, [provider], { cleanup, now: () => at })
  await service.recordArtifact({ id: 'artifact', taskId: 'task', kind: 'commit', uri: 'commit:abc', commit: { sha: 'abc', branch: 'feature/task' } })
  const view = await service.createIntegration({ id: 'integration', taskId: 'task', artifactId: 'artifact', provider: 'github', title: 'Task', repository: 'owner/repo', sourceRef: 'feature/task', targetRef: 'main', headSha: 'abc' })
  const integration = view.integrations[0]
  if (integration === undefined) throw new Error('integration was not created')
  return { repository, provider, cleanup, service, integration }
}

test('mock delivery creates idempotently, refreshes checks/reviews and preserves network uncertainty', async () => {
  const { service, provider, integration } = await setup()
  const duplicate = await service.createIntegration({ id: 'different-id', taskId: 'task', provider: 'github', title: 'Task', repository: 'owner/repo', sourceRef: 'feature/task', targetRef: 'main', headSha: 'abc' })
  assert.equal(duplicate.integrations.length, 1)
  provider.set(integration.providerRef, { repository: 'owner/repo', sourceRef: 'feature/task', targetRef: 'main', headSha: 'abc', status: 'checks_failed', checks: { status: 'failing', summary: 'failed check', updatedAt: at.toISOString() } })
  let refreshed = await service.refresh(integration.id)
  assert.equal(refreshed.integrations[0]?.status, 'checks_failed')
  provider.set(integration.providerRef, { repository: 'owner/repo', sourceRef: 'feature/task', targetRef: 'main', headSha: 'abc', status: 'changes_requested', review: { status: 'changes_requested', summary: 'fix', updatedAt: at.toISOString() } })
  refreshed = await service.refresh(integration.id)
  assert.equal(refreshed.integrations[0]?.status, 'changes_requested')
  provider.failNext()
  const uncertain = await service.refresh(integration.id)
  assert.equal(uncertain.integrations[0]?.status, 'changes_requested')
  assert.equal(uncertain.integrations[0]?.syncStatus, 'uncertain')
  assert.match(uncertain.integrations[0]?.syncError ?? '', /mock network/)
})

test('merge requires trusted authorization and current head binding', async () => {
  const { service, provider, integration } = await setup()
  await assert.rejects(() => service.merge(integration.id, true), /trusted user authorization/)
  provider.set(integration.providerRef, { repository: 'owner/repo', sourceRef: 'feature/task', targetRef: 'main', headSha: 'new-head', status: 'approved', checks: { status: 'passing', summary: 'ok', updatedAt: at.toISOString() } })
  const authorization = authorizeMerge({ provider: 'github', providerRef: integration.providerRef, repository: 'owner/repo', ref: 'feature/task', headSha: 'abc' })
  await assert.rejects(() => service.merge(integration.id, authorization), /head changed/)
  const latest = await service.snapshot()
  assert.equal(latest.integrations[0]?.headSha, 'new-head')
})

test('cleanup retains dirty, unknown, closed and failed delivery workspaces and is idempotent after release', async () => {
  const { service, provider, cleanup, repository, integration } = await setup()
  const lease = await repository.dispatch({ type: 'lease.reserve', id: 'lease', taskId: 'task', path: '/tmp/task', kind: 'worktree' })
  await repository.dispatch({ type: 'lease.activate', leaseId: 'lease' })
  cleanup.state = { owned: true, clean: false, pushed: true, fullyDelivered: true, status: 'dirty' }
  let receipt = await service.cleanup({ taskId: 'task', leaseId: 'lease', integrationId: integration.id, acceptancePassed: true })
  assert.equal(receipt.cleaned, false)
  cleanup.state = { owned: true, clean: true, pushed: true, fullyDelivered: true, status: 'ready' }
  let blocked = await service.cleanup({ taskId: 'task', leaseId: 'lease', integrationId: integration.id, acceptancePassed: true })
  assert.equal(blocked.cleaned, false)
  provider.set(integration.providerRef, { repository: 'owner/repo', sourceRef: 'feature/task', targetRef: 'main', headSha: 'abc', status: 'approved', checks: { status: 'passing', summary: 'ok', updatedAt: at.toISOString() }, review: { status: 'approved', summary: 'approved', updatedAt: at.toISOString() } })
  await service.refresh(integration.id)
  await service.merge(integration.id, authorizeMerge({ provider: 'github', providerRef: integration.providerRef, repository: 'owner/repo', ref: 'feature/task', headSha: 'abc' }))
  receipt = await service.cleanup({ taskId: 'task', leaseId: 'lease', integrationId: integration.id, acceptancePassed: true })
  assert.equal(receipt.cleaned, true)
  assert.equal(cleanup.removes, 1)
  const repeated = await service.cleanup({ taskId: 'task', leaseId: 'lease', integrationId: integration.id, acceptancePassed: true })
  assert.equal(repeated.alreadyReleased, true)
})

test('GitHub adapter sends documented create, refresh and merge contracts without exposing credentials', async () => {
  const requests: { url: string; method: string; body: string | undefined; authorization: string | null }[] = []
  const responses: unknown[] = [
    { number: 7, html_url: 'https://github.com/owner/repo/pull/7', state: 'open', draft: false, head: { ref: 'feature', sha: 'abc' }, base: { ref: 'main' }, merged_at: null, closed_at: null },
    { number: 7, html_url: 'https://github.com/owner/repo/pull/7', state: 'open', draft: false, head: { ref: 'feature', sha: 'abc' }, base: { ref: 'main' }, merged_at: null, closed_at: null },
    { check_runs: [{ status: 'completed', conclusion: 'success' }] },
    [{ state: 'APPROVED' }],
    { merged: true, message: 'Merged' },
  ]
  const fetcher: FetchLike = async (input, init) => {
    const headers = new Headers(init?.headers)
    requests.push({ url: String(input), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : undefined, authorization: headers.get('authorization') })
    return { ok: true, status: 200, json: async () => responses.shift(), text: async () => '' }
  }
  const provider = new GitHubProvider({ fetch: fetcher, credentials: { token: 'secret-token' }, baseUrl: 'https://api.github.test/' })
  const created = await provider.create({ repository: 'owner/repo', sourceRef: 'feature', targetRef: 'main', headSha: 'abc', title: 'Task' })
  assert.equal(created.providerRef, '7')
  const refreshed = await provider.refresh({ provider: 'github', providerRef: '7', repository: 'owner/repo', sourceRef: 'feature', targetRef: 'main', headSha: 'abc' })
  assert.equal(refreshed.status, 'approved')
  const merged = await provider.merge({ provider: 'github', providerRef: '7', repository: 'owner/repo', sourceRef: 'feature', targetRef: 'main', headSha: 'abc' })
  assert.equal(merged.status, 'merged')
  assert.equal(requests[0]?.method, 'POST')
  assert.deepEqual(JSON.parse(requests[0]?.body ?? '{}'), { title: 'Task', head: 'feature', base: 'main', body: '', draft: false })
  assert.equal(requests[0]?.authorization, 'Bearer secret-token')
  assert.ok(requests.every(request => !request.url.includes('secret-token')))
})

test('GitLab adapter sends documented create, refresh and merge contracts', async () => {
  const requests: { url: string; method: string; body: string | undefined; privateToken: string | null }[] = []
  const responses: unknown[] = [
    { iid: 4, web_url: 'https://gitlab.test/owner/repo/-/merge_requests/4', state: 'opened', draft: false, source_branch: 'feature', target_branch: 'main', sha: 'abc', merged_at: null, closed_at: null, detailed_merge_status: 'checking' },
    { iid: 4, web_url: 'https://gitlab.test/owner/repo/-/merge_requests/4', state: 'opened', draft: false, source_branch: 'feature', target_branch: 'main', sha: 'abc', merged_at: null, closed_at: null, detailed_merge_status: 'mergeable' },
    [{ status: 'success' }],
    { approved: true },
    { iid: 4, web_url: 'https://gitlab.test/owner/repo/-/merge_requests/4', state: 'merged', draft: false, source_branch: 'feature', target_branch: 'main', sha: 'abc', merged_at: at.toISOString(), closed_at: at.toISOString(), detailed_merge_status: 'merged' },
  ]
  const fetcher: FetchLike = async (input, init) => { const headers = new Headers(init?.headers); requests.push({ url: String(input), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : undefined, privateToken: headers.get('private-token') }); return { ok: true, status: 200, json: async () => responses.shift(), text: async () => '' } }
  const provider = new GitLabProvider({ fetch: fetcher, credentials: { token: () => 'secret' }, baseUrl: 'https://gitlab.test/api/v4/' })
  await provider.create({ repository: 'owner/repo', sourceRef: 'feature', targetRef: 'main', headSha: 'abc', title: 'Task' })
  await provider.refresh({ provider: 'gitlab', providerRef: '4', repository: 'owner/repo', sourceRef: 'feature', targetRef: 'main', headSha: 'abc' })
  const merged = await provider.merge({ provider: 'gitlab', providerRef: '4', repository: 'owner/repo', sourceRef: 'feature', targetRef: 'main', headSha: 'abc' })
  assert.equal(merged.status, 'merged')
  assert.equal(requests[0]?.method, 'POST')
  assert.deepEqual(JSON.parse(requests[0]?.body ?? '{}'), { source_branch: 'feature', target_branch: 'main', title: 'Task', description: '', draft: false })
  assert.equal(requests[0]?.url, 'https://gitlab.test/api/v4/projects/owner%2Frepo/merge_requests')
  assert.equal(requests[0]?.privateToken, 'secret')
})
