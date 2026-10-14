import { TaskDomainError } from './types.js'
import type { ArtifactCommit, ArtifactSource, DeliveryChecks, DeliveryReviewStatus, IntegrationProvider, IntegrationStatus, TaskArtifact, TaskProjection, WorkspaceLease } from './types.js'
import type { TaskRepository } from './store.js'
import type { DeliveryProvider, ProviderCreateRequest, ProviderIntegration, ProviderRef } from './providers/types.js'

const authorizationBrand = Symbol('trusted-user-merge-authorization')

export interface MergeAuthorizationInput {
  readonly provider: IntegrationProvider
  readonly providerRef?: string | undefined
  readonly repository: string
  readonly ref: string
  readonly headSha: string
}
export type MergeAuthorization = MergeAuthorizationInput & { readonly [authorizationBrand]: true }

/** This factory is the explicit user/trusted-tool boundary. Agent booleans are not accepted. */
export function authorizeMerge(input: MergeAuthorizationInput): MergeAuthorization {
  if (input.providerRef !== undefined && input.providerRef.trim().length === 0) throw new TaskDomainError('Merge authorization providerRef must be non-empty')
  if (input.repository.trim().length === 0 || input.ref.trim().length === 0 || input.headSha.trim().length === 0) throw new TaskDomainError('Merge authorization must bind provider, repository, ref and head')
  return Object.freeze({ ...input, [authorizationBrand]: true as const })
}
export const createMergeAuthorization = authorizeMerge

function trustedAuthorization(value: unknown): value is MergeAuthorization {
  return typeof value === 'object' && value !== null && authorizationBrand in value && Reflect.get(value, authorizationBrand) === true
}

export interface ArtifactInput {
  readonly id: string
  readonly taskId: string
  readonly attemptId?: string | null | undefined
  readonly kind: TaskArtifact['kind']
  readonly uri: string
  readonly source?: ArtifactSource | undefined
  readonly commit?: ArtifactCommit | undefined
  readonly checks?: DeliveryChecks | undefined
}

export interface IntegrationInput {
  readonly id: string
  readonly taskId: string
  readonly artifactId?: string | null | undefined
  readonly title: string
  readonly provider?: IntegrationProvider | undefined
  readonly body?: string | undefined
  readonly repository: string
  readonly sourceRef: string
  readonly targetRef: string
  readonly headSha: string
  readonly draft?: boolean | undefined
}

export interface CleanupInspection {
  readonly owned: boolean
  readonly clean: boolean
  readonly pushed: boolean
  readonly fullyDelivered: boolean
  readonly status: 'ready' | 'dirty' | 'unpushed' | 'incomplete' | 'unknown'
  readonly reason?: string | undefined
}
export interface CleanupAdapter {
  inspect(lease: WorkspaceLease, signal?: AbortSignal): Promise<CleanupInspection>
  remove(lease: WorkspaceLease, signal?: AbortSignal): Promise<void>
}
export interface CleanupRequest {
  readonly taskId: string
  readonly leaseId: string
  readonly integrationId?: string | undefined
  readonly acceptancePassed: boolean
  readonly codeTask?: boolean | undefined
  readonly signal?: AbortSignal | undefined
}
export interface CleanupReceipt {
  readonly cleaned: boolean
  readonly alreadyReleased: boolean
  readonly reason: string | null
  readonly lease: WorkspaceLease
}

export interface DeliveryServiceOptions {
  readonly now?: () => Date
  readonly cleanup?: CleanupAdapter
}

function providerResultToChecks(value: ProviderIntegration): DeliveryChecks { return value.checks }
function providerResultToReview(value: ProviderIntegration) { return value.review }
function providerRef(value: { readonly provider: IntegrationProvider; readonly providerRef: string; readonly repository: string; readonly ref: string; readonly targetRef: string; readonly headSha: string }): ProviderRef { return { provider: value.provider, providerRef: value.providerRef, repository: value.repository, sourceRef: value.ref, targetRef: value.targetRef, headSha: value.headSha } }
function integrationKey(value: { readonly taskId: string; readonly provider: IntegrationProvider; readonly repository: string; readonly ref: string; readonly targetRef: string }): string { return [value.taskId, value.provider, value.repository, value.ref, value.targetRef].join('\u0000') }
function nowIso(now: () => Date): string { return now().toISOString() }
function errMessage(error: unknown): string { return error instanceof Error ? error.message : 'Provider synchronization failed' }
function isProviderArray(value: readonly DeliveryProvider[] | ReadonlyMap<IntegrationProvider, DeliveryProvider>): value is readonly DeliveryProvider[] { return Array.isArray(value) }

/** Durable Artifact/PR/MR delivery orchestration around the shared TaskRepository projection. */
export class TaskDeliveryService {
  private readonly providers: ReadonlyMap<IntegrationProvider, DeliveryProvider>
  private readonly now: () => Date
  private readonly cleanupAdapter: CleanupAdapter | null
  private readonly cleanupInFlight = new Map<string, Promise<CleanupReceipt>>()
  constructor(readonly repository: TaskRepository, providers: readonly DeliveryProvider[] | ReadonlyMap<IntegrationProvider, DeliveryProvider>, options: DeliveryServiceOptions = {}) {
    const map = new Map<IntegrationProvider, DeliveryProvider>()
    if (isProviderArray(providers)) {
      for (const provider of providers) map.set(provider.provider, provider)
    } else {
      for (const [kind, provider] of providers) map.set(kind, provider)
    }
    this.providers = map
    this.now = options.now ?? (() => new Date())
    this.cleanupAdapter = options.cleanup ?? null
  }
  private provider(kind: IntegrationProvider): DeliveryProvider {
    const value = this.providers.get(kind)
    if (value === undefined) throw new TaskDomainError(`No delivery provider configured: ${kind}`)
    return value
  }
  async snapshot(): Promise<TaskProjection> { return this.repository.snapshot() }
  async recordArtifact(input: ArtifactInput): Promise<TaskArtifact> {
    const view = await this.repository.snapshot()
    const current = view.artifacts.find(value => value.id === input.id)
    if (current !== undefined) {
      if (current.taskId !== input.taskId || current.kind !== input.kind) throw new TaskDomainError(`Artifact identity conflict: ${input.id}`)
      await this.repository.dispatch({ type: 'artifact.sync', artifactId: current.id, source: input.source, commit: input.commit, checks: input.checks, uri: input.uri })
      return (await this.repository.snapshot()).artifacts.find(value => value.id === current.id) ?? current
    }
    await this.repository.dispatch({ type: 'artifact.create', id: input.id, taskId: input.taskId, attemptId: input.attemptId ?? input.source?.attemptId ?? null, kind: input.kind, uri: input.uri, source: input.source, commit: input.commit, checks: input.checks })
    const created = (await this.repository.snapshot()).artifacts.find(value => value.id === input.id)
    if (created === undefined) throw new TaskDomainError(`Artifact was not persisted: ${input.id}`)
    return created
  }
  async createIntegration(input: IntegrationInput, signal?: AbortSignal): Promise<TaskProjection> {
    const view = await this.repository.snapshot()
    const task = view.tasks.find(value => value.id === input.taskId)
    if (task === undefined) throw new TaskDomainError(`Unknown task: ${input.taskId}`)
    if (input.artifactId !== undefined && input.artifactId !== null) {
      const artifact = view.artifacts.find(value => value.id === input.artifactId)
      if (artifact === undefined || artifact.taskId !== input.taskId) throw new TaskDomainError('Integration artifact belongs to another task or is unknown')
    }
    const providerKind = this.providerForInput(input)
    const existing = view.integrations.find(value => integrationKey({ taskId: value.taskId, provider: value.provider, repository: value.repository, ref: value.ref, targetRef: value.targetRef }) === integrationKey({ taskId: input.taskId, provider: providerKind, repository: input.repository, ref: input.sourceRef, targetRef: input.targetRef }))
    if (existing !== undefined) return this.refresh(existing.id, signal)
    const provider = this.provider(providerKind)
    const request: ProviderCreateRequest = { repository: input.repository, sourceRef: input.sourceRef, targetRef: input.targetRef, headSha: input.headSha, title: input.title, body: input.body, draft: input.draft }
    const result = await provider.create(request, signal)
    await this.repository.dispatch({ type: 'integration.create', id: input.id, taskId: input.taskId, artifactId: input.artifactId ?? null, provider: result.provider, url: result.url, providerRef: result.providerRef, repository: result.repository, ref: result.sourceRef, targetRef: result.targetRef, headSha: result.headSha })
    await this.repository.dispatch({ type: 'integration.sync', integrationId: input.id, status: result.status, headSha: result.headSha, checks: providerResultToChecks(result), review: providerResultToReview(result), syncStatus: 'fresh', syncError: null, lastSyncedAt: nowIso(this.now), mergedAt: result.mergedAt, closedAt: result.closedAt })
    return this.repository.snapshot()
  }
  private providerForInput(input: IntegrationInput): IntegrationProvider {
    if (input.provider !== undefined) return input.provider
    const available = [...this.providers.keys()]
    if (available.length !== 1) throw new TaskDomainError('Integration input must select a provider when multiple providers are configured')
    const provider = available[0]
    if (provider === undefined) throw new TaskDomainError('No delivery provider configured')
    return provider
  }
  async refresh(integrationId: string, signal?: AbortSignal): Promise<TaskProjection> {
    const view = await this.repository.snapshot()
    const current = view.integrations.find(value => value.id === integrationId)
    if (current === undefined) throw new TaskDomainError(`Unknown integration: ${integrationId}`)
    const provider = this.provider(current.provider)
    const reference = providerRef(current)
    try {
      const result = await provider.refresh(reference, signal)
      await this.repository.dispatch({ type: 'integration.sync', integrationId, status: result.status, headSha: result.headSha, checks: result.checks, review: result.review, syncStatus: 'fresh', syncError: null, lastSyncedAt: nowIso(this.now), mergedAt: result.mergedAt, closedAt: result.closedAt })
    } catch (error) {
      await this.repository.dispatch({ type: 'integration.sync', integrationId, syncStatus: 'uncertain', syncError: errMessage(error), lastSyncedAt: current.lastSyncedAt })
    }
    return this.repository.snapshot()
  }
  async merge(integrationId: string, authorization: unknown, signal?: AbortSignal): Promise<TaskProjection> {
    if (!trustedAuthorization(authorization)) throw new TaskDomainError('Merge requires explicit trusted user authorization')
    const view = await this.repository.snapshot()
    const current = view.integrations.find(value => value.id === integrationId)
    if (current === undefined) throw new TaskDomainError(`Unknown integration: ${integrationId}`)
    if (authorization.provider !== current.provider || (authorization.providerRef !== undefined && authorization.providerRef !== current.providerRef) || authorization.repository !== current.repository || authorization.ref !== current.ref || authorization.headSha !== current.headSha) throw new TaskDomainError('Merge authorization does not match the integration head')
    const provider = this.provider(current.provider)
    let latest: ProviderIntegration
    try { latest = await provider.refresh(providerRef(current), signal) } catch (error) {
      await this.repository.dispatch({ type: 'integration.sync', integrationId, syncStatus: 'uncertain', syncError: errMessage(error), lastSyncedAt: current.lastSyncedAt })
      throw new TaskDomainError('Cannot merge while provider state is uncertain')
    }
    await this.repository.dispatch({ type: 'integration.sync', integrationId, status: latest.status, headSha: latest.headSha, checks: latest.checks, review: latest.review, syncStatus: 'fresh', syncError: null, lastSyncedAt: nowIso(this.now), mergedAt: latest.mergedAt, closedAt: latest.closedAt })
    if (latest.headSha !== current.headSha || latest.headSha !== authorization.headSha) throw new TaskDomainError('Integration head changed; authorize the current head again')
    if (latest.status === 'merged') return this.repository.snapshot()
    if (latest.status === 'closed' || latest.status === 'changes_requested' || latest.status === 'checks_failed' || latest.status === 'unknown') throw new TaskDomainError(`Integration cannot merge from state: ${latest.status}`)
    const merged = await provider.merge(providerRef({ ...current, headSha: latest.headSha }), signal)
    await this.repository.dispatch({ type: 'integration.sync', integrationId, status: merged.status, headSha: merged.headSha, checks: merged.checks, review: merged.review, syncStatus: 'fresh', syncError: null, lastSyncedAt: nowIso(this.now), mergedAt: merged.mergedAt, closedAt: merged.closedAt })
    return this.repository.snapshot()
  }
  async cleanup(request: CleanupRequest): Promise<CleanupReceipt> {
    const pending = this.cleanupInFlight.get(request.leaseId)
    if (pending !== undefined) return pending
    const operation = this.cleanupNow(request)
    this.cleanupInFlight.set(request.leaseId, operation)
    try { return await operation } finally { this.cleanupInFlight.delete(request.leaseId) }
  }
  private async cleanupNow(request: CleanupRequest): Promise<CleanupReceipt> {
    if (this.cleanupAdapter === null) throw new TaskDomainError('No cleanup adapter configured')
    const view = await this.repository.snapshot()
    const lease = view.leases.find(value => value.id === request.leaseId)
    if (lease === undefined || lease.taskId !== request.taskId) throw new TaskDomainError(`Unknown workspace lease: ${request.leaseId}`)
    if (lease.status === 'released') return { cleaned: false, alreadyReleased: true, reason: null, lease }
    if (lease.status !== 'active') return { cleaned: false, alreadyReleased: false, reason: 'Workspace lease is not active', lease }
    const artifacts = view.artifacts.filter(value => value.taskId === request.taskId && value.status !== 'superseded')
    if (artifacts.length === 0) return { cleaned: false, alreadyReleased: false, reason: 'No persisted Artifact', lease }
    const integration = request.integrationId === undefined ? view.integrations.find(value => value.taskId === request.taskId && value.status === 'merged') : view.integrations.find(value => value.id === request.integrationId)
    const codeTask = request.codeTask ?? true
    if (codeTask && (integration === undefined || integration.status !== 'merged' || integration.syncStatus !== 'fresh' || integration.checks.status !== 'passing')) return { cleaned: false, alreadyReleased: false, reason: 'Code delivery is not confirmed merged with passing checks', lease }
    if (!request.acceptancePassed) return { cleaned: false, alreadyReleased: false, reason: 'Acceptance checks did not pass', lease }
    const inspection = await this.cleanupAdapter.inspect(lease, request.signal)
    if (!inspection.owned || !inspection.clean || !inspection.pushed || !inspection.fullyDelivered || inspection.status !== 'ready') return { cleaned: false, alreadyReleased: false, reason: inspection.reason ?? `Workspace is ${inspection.status}`, lease }
    await this.cleanupAdapter.remove(lease, request.signal)
    await this.repository.dispatch({ type: 'lease.release', leaseId: lease.id })
    const released = (await this.repository.snapshot()).leases.find(value => value.id === lease.id) ?? { ...lease, status: 'released' as const }
    return { cleaned: true, alreadyReleased: false, reason: null, lease: released }
  }
}
export const DeliveryService = TaskDeliveryService
