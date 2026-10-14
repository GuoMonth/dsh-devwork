import { isAbsolute, resolve } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import { TaskDeliveryService } from './delivery.js'
import { authorizeMerge } from './delivery.js'
import type { CleanupAdapter, CleanupRequest, CleanupReceipt, MergeAuthorization, MergeAuthorizationInput } from './delivery.js'
import { TaskExecutionEngine } from './execution.js'
import type { AgentProvider, SessionProvider, TaskDefinitionProvider } from './execution.js'
import { FileTaskLogStore } from './file-store.js'
import { parseTaskDefinition } from './intake.js'
import type { TaskDefinition } from './intake.js'
import type { TaskPanelData, TaskPanelSource, TaskPanelViewContext } from './panel.js'
import { TaskDomainError } from './types.js'
import type { IntegrationRef, TaskArtifact, TaskProjection } from './types.js'
import { TaskRepository } from './store.js'
import type { DeliveryProvider } from './providers/types.js'

/** Explicit providers required to make a Host task source available. */
export interface TaskPanelHostProviders {
  readonly sessions: SessionProvider
  readonly agents: AgentProvider
  readonly planner?: TaskDefinitionProvider | undefined
  readonly delivery?: readonly DeliveryProvider[] | ReadonlyMap<'github' | 'gitlab', DeliveryProvider> | undefined
}

/** Optional bridges for navigation and presentation owned by the embedding Host. */
export interface TaskPanelHostOperations {
  /** Open the real external Session after the task identity has been checked. */
  readonly openSession?: ((externalSessionId: string, taskId: string, view: TaskPanelViewContext, signal: AbortSignal) => void | Promise<void>) | undefined
  /** Open an Artifact or Integration URL in the Host-owned viewer. */
  readonly view?: ((target: TaskArtifact | IntegrationRef, view: TaskPanelViewContext, signal: AbortSignal) => void | Promise<void>) | undefined
  /** Produce a validated task definition from the selected Session request. */
  readonly createInput?: ((sessionId: string, view: TaskPanelViewContext, signal: AbortSignal) => unknown | Promise<unknown>) | undefined
  /** Called only after an explicit user action; the callback performs trusted handoff. */
  readonly authorizeMerge?: ((integration: IntegrationRef, view: TaskPanelViewContext, signal: AbortSignal) => void | Promise<void>) | undefined
}

export interface TaskPanelHostOptions extends TaskPanelHostOperations {
  /** Existing repository is useful for tests; otherwise logPath is required. */
  readonly repository?: TaskRepository | undefined
  readonly logPath?: string | undefined
  /** Explicit name for the persisted task log path. */
  readonly taskLogPath?: string | undefined
  /** Explicit execution and delivery providers. No provider is created implicitly. */
  readonly providers?: TaskPanelHostProviders | undefined
  /** Alias accepted for embedders that keep execution and delivery configuration separate. */
  readonly execution?: Omit<TaskPanelHostProviders, 'delivery'> | undefined
  readonly deliveryProviders?: readonly DeliveryProvider[] | ReadonlyMap<'github' | 'gitlab', DeliveryProvider> | undefined
  readonly cleanup?: CleanupAdapter | undefined
  /** Fixed Leader directory source. A mismatch rejects task creation. */
  readonly workingDirectory?: string | ((sessionId: string, signal: AbortSignal) => string | Promise<string>) | undefined
  /** Optional clock/lifetime signal supplied by a Host test harness. */
  readonly signal?: AbortSignal | undefined
}

export type TaskPanelCreateInput = unknown
export type TaskPanelHostConfig = TaskPanelHostOptions

interface ScopedSource extends TaskPanelSource {
  readonly selectedSessionId: string | undefined
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Task Host operation failed' }

/**
 * Cordis-owned Host bridge for the public TaskPanel source.
 *
 * The bridge deliberately accepts providers instead of manufacturing a mock or
 * reaching into private DSH services. A configured FileTaskLogStore, execution
 * engine and delivery service are shared by every Session-scoped source.
 */
export class TaskPanelHost extends Service {
  static inject: readonly string[] = []
  readonly repository: TaskRepository | null
  readonly execution: TaskExecutionEngine | null
  readonly delivery: TaskDeliveryService | null
  readonly taskPanelSource: TaskPanelSource

  private readonly lifetime: AbortController
  private readonly listeners = new Set<() => void>()
  private readonly operations: TaskPanelHostOperations
  private readonly workingDirectory?: TaskPanelHostOptions['workingDirectory']
  private readonly planner: TaskDefinitionProvider | undefined
  private snapshot: TaskPanelData
  private disposed = false
  private readonly stopRepositorySubscription: (() => void) | undefined
  private readonly stopParentSignal: (() => void) | undefined
  private snapshotRevision = -1

  constructor(ctx: Context, options: TaskPanelHostOptions = {}) {
    super(ctx, 'taskPanelHost')
    this.operations = { createInput: options.createInput, openSession: options.openSession, view: options.view, authorizeMerge: options.authorizeMerge }
    this.workingDirectory = options.workingDirectory
    this.lifetime = new AbortController()
    const parentSignal = options.signal
    if (parentSignal === undefined || parentSignal.aborted) {
      this.stopParentSignal = undefined
      if (parentSignal?.aborted) this.lifetime.abort(parentSignal.reason)
    } else {
      const onAbort = () => this.lifetime.abort(parentSignal.reason)
      parentSignal.addEventListener('abort', onAbort, { once: true })
      this.stopParentSignal = () => parentSignal.removeEventListener('abort', onAbort)
    }

    const providers = options.providers ?? options.execution
    this.planner = providers?.planner
    const logPath = options.logPath ?? options.taskLogPath
    const repository = options.repository ?? (logPath === undefined ? null : new TaskRepository(new FileTaskLogStore(logPath)))
    this.repository = repository
    this.stopRepositorySubscription = repository === null ? undefined : repository.subscribe(() => { void this.loadSnapshot() })
    if (repository !== null && providers !== undefined) {
      const engineProviders = { sessions: providers.sessions, agents: providers.agents }
      const execution = new TaskExecutionEngine({ repository, providers: engineProviders, signal: this.lifetime.signal })
      this.execution = execution
      const deliveryProviders = options.deliveryProviders ?? options.providers?.delivery ?? []
      this.delivery = new TaskDeliveryService(repository, deliveryProviders, options.cleanup === undefined ? {} : { cleanup: options.cleanup })
      this.snapshot = { kind: 'loading' }
      void this.loadSnapshot()
    } else {
      this.execution = null
      this.delivery = null
      this.snapshot = { kind: 'unavailable', message: 'Task source unavailable; configure a Host repository and providers.' }
    }

    this.taskPanelSource = this.makeSource(undefined)
    const dispose = ctx.provide('taskPanelSource', this.taskPanelSource)
    ctx.effect(() => () => {
      dispose()
      this.dispose()
    }, 'taskPanelHost.source')
  }

  /** Alias used by Host integrations that prefer a shorter injected property. */
  get source(): TaskPanelSource { return this.taskPanelSource }

  private async loadSnapshot(): Promise<void> {
    if (this.execution === null) return
    try {
      const value = await this.execution.snapshot()
      if (this.disposed || value.view.revision < this.snapshotRevision) return
      this.snapshotRevision = value.view.revision
      this.snapshot = { kind: 'ready', projection: value.view }
    } catch (error) {
      if (this.disposed) return
      this.snapshot = { kind: 'error', message: errorMessage(error) }
    }
    this.notify()
  }

  private makeSource(selectedSessionId: string | undefined): ScopedSource {
    const host = this
    const scoped: ScopedSource = {
      selectedSessionId,
      forSession: sessionId => host.makeSource(sessionId),
      getSnapshot: view => host.dataFor(selectedSessionId ?? view.sessionId),
      subscribe: (_view, listener) => host.subscribe(listener),
      actions: {
        create: async (view, input) => { await host.create(selectedSessionId ?? view.sessionId ?? null, input === undefined ? await host.createInput(selectedSessionId ?? view.sessionId ?? null, view) : input) },
        open: (taskId, sessionId, view) => host.open(taskId, sessionId, view),
        continue: async (taskId, sessionId, view) => { await host.continue(taskId, sessionId, view) },
        view: (target, view) => host.view(target, view),
        authorize: async (integrationId, view) => { await host.authorize(integrationId, view) },
        merge: async (integrationId, authorization, view) => { await host.merge(integrationId, authorization, view) },
      },
    }
    return scoped
  }

  private dataFor(selectedSessionId: string | undefined): TaskPanelData {
    if (this.disposed) return { kind: 'unavailable', message: 'Task source unloaded.' }
    if (this.snapshot.kind !== 'ready' || selectedSessionId === undefined) return this.snapshot
    const sessions = this.snapshot.projection.sessions
    if (sessions.length > 0 && !sessions.some(session => session.id === selectedSessionId || session.externalSessionId === selectedSessionId)) {
      return { kind: 'ready', projection: { ...this.snapshot.projection, tasks: [], sessions: [], attempts: [], artifacts: [], integrations: [], leases: [] } }
    }
    return this.snapshot
  }

  private subscribe(listener: () => void): () => void {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(): void {
    if (this.disposed) return
    for (const listener of [...this.listeners]) {
      try { listener() } catch { /* Client listeners cannot break Host persistence. */ }
    }
  }

  private signal(signal?: AbortSignal): AbortSignal {
    return signal === undefined ? this.lifetime.signal : AbortSignal.any([signal, this.lifetime.signal])
  }

  private requireReady(): { readonly execution: TaskExecutionEngine; readonly repository: TaskRepository } {
    if (this.execution === null || this.repository === null) throw new TaskDomainError('Task source unavailable; configure a Host repository and providers')
    return { execution: this.execution, repository: this.repository }
  }

  private async resolveDirectory(sessionId: string, signal: AbortSignal): Promise<string | null> {
    if (this.workingDirectory === undefined) return null
    const value = typeof this.workingDirectory === 'function' ? await this.workingDirectory(sessionId, signal) : this.workingDirectory
    if (!isAbsolute(value)) throw new TaskDomainError('Task Host workingDirectory must be absolute')
    return resolve(value)
  }

  private async createInput(sessionId: string | null, view: TaskPanelViewContext, signal?: AbortSignal): Promise<unknown> {
    if (sessionId === null || sessionId.trim().length === 0) throw new TaskDomainError('Create requires a selected Leader Session')
    if (this.operations.createInput === undefined) throw new TaskDomainError('Task creation input is unavailable; configure a Host planner or createInput adapter')
    return this.operations.createInput(sessionId, view, this.signal(signal))
  }

  private normalizeDefinition(value: TaskDefinition, workingDirectory: string | null): TaskDefinition {
    const normalize = (node: TaskDefinition): TaskDefinition => {
      if (workingDirectory !== null && node.workingDirectory !== null && resolve(node.workingDirectory) !== workingDirectory) throw new TaskDomainError('Task workingDirectory differs from the fixed Leader Session directory')
      return {
        ...node,
        workingDirectory: node.workingDirectory === null ? workingDirectory : resolve(node.workingDirectory),
        children: node.children.map(normalize),
      }
    }
    return normalize(value)
  }

  /** Create and provision one parent/children task tree from an explicit definition. */
  async create(sessionId: string | null, input: TaskPanelCreateInput, signal?: AbortSignal): Promise<TaskProjection> {
    const { execution } = this.requireReady()
    const fused = this.signal(signal)
    fused.throwIfAborted()
    if (sessionId === null || sessionId.trim().length === 0) throw new TaskDomainError('Create requires a selected Leader Session')
    const directory = await this.resolveDirectory(sessionId, fused)
    const planned = this.planner === undefined ? input : await this.planner.plan(input, fused)
    fused.throwIfAborted()
    const definition = this.normalizeDefinition(parseTaskDefinition(planned), directory)
    const result = await execution.intake(definition, fused)
    if (!this.disposed) { this.snapshotRevision = result.view.revision; this.snapshot = { kind: 'ready', projection: result.view }; this.notify() }
    return result.view
  }

  /** Open the selected task's external Session through the explicit Host adapter. */
  async open(taskId: string, sessionId: string | null, view: TaskPanelViewContext = {}, signal?: AbortSignal): Promise<void> {
    const { repository } = this.requireReady()
    const fused = this.signal(signal)
    fused.throwIfAborted()
    const current = await repository.snapshot()
    const task = current.tasks.find(value => value.id === taskId)
    if (task === undefined) throw new TaskDomainError(`Unknown task: ${taskId}`)
    const session = current.sessions.find(value => value.taskId === taskId)
    if (session === undefined || session.externalSessionId === null) throw new TaskDomainError(`Task Session is not provisioned: ${taskId}`)
    if (sessionId !== null && session.id !== sessionId && session.externalSessionId !== sessionId) throw new TaskDomainError('Open Session does not match the selected task')
    if (this.operations.openSession !== undefined) await this.operations.openSession(session.externalSessionId, taskId, view, fused)
  }

  /** Continue through the shared TaskExecutionEngine; provider results retain cancellation semantics. */
  async continue(taskId: string, sessionId: string | null, view: TaskPanelViewContext = {}, signal?: AbortSignal): Promise<TaskProjection> {
    const { execution, repository } = this.requireReady()
    const fused = this.signal(signal)
    fused.throwIfAborted()
    const current = await repository.snapshot()
    const session = current.sessions.find(value => value.taskId === taskId)
    if (session === undefined || (sessionId !== null && session.id !== sessionId && session.externalSessionId !== sessionId)) throw new TaskDomainError('Continue Session does not match the selected task')
    const result = await execution.continue(taskId, { signal: fused })
    if (!this.disposed) { this.snapshotRevision = result.view.revision; this.snapshot = { kind: 'ready', projection: result.view }; this.notify() }
    void view
    return result.view
  }

  /** Refresh integrations when a provider is configured, then delegate viewing to the Host. */
  async view(target: TaskArtifact | IntegrationRef, view: TaskPanelViewContext = {}, signal?: AbortSignal): Promise<void> {
    const fused = this.signal(signal)
    fused.throwIfAborted()
    let latest: TaskArtifact | IntegrationRef = target
    if ('provider' in target && this.delivery !== null) {
      const projection = await this.delivery.refresh(target.id, fused)
      latest = projection.integrations.find(value => value.id === target.id) ?? target
      if (!this.disposed) { this.snapshot = { kind: 'ready', projection }; this.notify() }
    }
    if (this.operations.view !== undefined) await this.operations.view(latest, view, fused)
  }

  /**
   * Explicit trusted authorization handoff. This factory never accepts an Agent
   * boolean or a Client-crafted object as authorization.
   */
  authorizeMerge(input: MergeAuthorizationInput): MergeAuthorization {
    return authorizeMerge(input)
  }

  /** Forward a selected Integration to trusted Host UI for explicit authorization. */
  async authorize(integrationId: string, view: TaskPanelViewContext = {}, signal?: AbortSignal): Promise<void> {
    const { repository } = this.requireReady()
    const fused = this.signal(signal)
    fused.throwIfAborted()
    const current = await repository.snapshot()
    const integration = current.integrations.find(value => value.id === integrationId)
    if (integration === undefined) throw new TaskDomainError(`Unknown integration: ${integrationId}`)
    if (this.operations.authorizeMerge !== undefined) await this.operations.authorizeMerge(integration, view, fused)
  }

  async merge(integrationId: string, authorization: unknown, _view: TaskPanelViewContext = {}, signal?: AbortSignal): Promise<TaskProjection> {
    if (this.delivery === null) throw new TaskDomainError('Delivery provider unavailable; merge remains unavailable')
    const projection = await this.delivery.merge(integrationId, authorization, this.signal(signal))
    if (!this.disposed) { this.snapshot = { kind: 'ready', projection }; this.notify() }
    return projection
  }

  private async publishSnapshot(): Promise<TaskProjection> {
    const { repository } = this.requireReady()
    const next = await repository.snapshot()
    if (!this.disposed) { this.snapshotRevision = next.revision; this.snapshot = { kind: 'ready', projection: next }; this.notify() }
    return next
  }

  /** Gate workspace removal on TaskDeliveryService's persisted delivery checks. */
  async cleanup(request: CleanupRequest): Promise<CleanupReceipt> {
    if (this.delivery === null) throw new TaskDomainError('Delivery provider unavailable; cleanup remains visible')
    const receipt = await this.delivery.cleanup({ ...request, signal: this.signal(request.signal) })
    if (!this.disposed) await this.publishSnapshot()
    return receipt
  }

  /** Read the last Host-owned data without exposing the repository to Client code. */
  getSnapshot(): TaskPanelData { return this.snapshot }

  createTask(sessionId: string, input: TaskPanelCreateInput, signal?: AbortSignal): Promise<TaskProjection> { return this.create(sessionId, input, signal) }
  openTask(taskId: string, sessionId: string | null, view: TaskPanelViewContext = {}, signal?: AbortSignal): Promise<void> { return this.open(taskId, sessionId, view, signal) }
  continueTask(taskId: string, sessionId: string | null, view: TaskPanelViewContext = {}, signal?: AbortSignal): Promise<TaskProjection> { return this.continue(taskId, sessionId, view, signal) }
  viewTarget(target: TaskArtifact | IntegrationRef, view: TaskPanelViewContext = {}, signal?: AbortSignal): Promise<void> { return this.view(target, view, signal) }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.lifetime.abort(new Error('Task Panel Host unloaded'))
    this.stopParentSignal?.()
    this.stopRepositorySubscription?.()
    this.listeners.clear()
  }
}

export const TaskPanelHostService = TaskPanelHost
export const HostTaskPanel = TaskPanelHost

declare module '@deepseek-ai/cordis' {
  interface Context {
    readonly taskPanelHost: TaskPanelHost
    readonly taskPanelSource?: TaskPanelSource | undefined
  }
}
