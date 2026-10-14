import { parseTaskDefinition, flattenTaskDefinition, taskRegistration } from './intake.js'
import { taskTree } from './tree.js'
import { TaskDomainError } from './types.js'
import type { AgentAttempt, ExecutionOutcome, Task, TaskProjection, TaskSession } from './types.js'
import type { TaskRepository } from './store.js'

export interface SessionCreateRequest {
  readonly sessionId: string
  readonly idempotencyKey: string
  readonly taskId: string
  readonly parentSessionId: string | null
  readonly title: string
  readonly goal: string
  readonly workingDirectory: string | null
  readonly executionBoundary: string | null
}
export interface SessionHandle { readonly externalSessionId: string }
export interface SessionProvider { create(request: SessionCreateRequest, signal: AbortSignal): Promise<unknown> }
export interface TaskDefinitionProvider { plan(request: unknown, signal: AbortSignal): Promise<unknown> }
export interface AgentExecutionRequest {
  readonly task: Task
  readonly session: TaskSession
  readonly attempt: AgentAttempt
  readonly signal: AbortSignal
}
export interface AgentExecutionResult { readonly outcome: ExecutionOutcome; readonly reason?: string }
export interface AgentProvider { readonly id: string; execute(request: AgentExecutionRequest): Promise<unknown> }
export interface ExecutionProviders { readonly sessions: SessionProvider; readonly agents: AgentProvider; readonly planner?: TaskDefinitionProvider }
export interface ExecutionEngineOptions { readonly repository: TaskRepository; readonly providers: ExecutionProviders; readonly signal?: AbortSignal }
export interface ExecutionSnapshot { readonly view: TaskProjection; readonly tree: ReturnType<typeof taskTree> }
export interface ExecuteOptions { readonly signal?: AbortSignal }

const neverAborted = new AbortController().signal
interface Invocation { readonly taskId: string; readonly generation: number; readonly controller: AbortController; attemptId: string | null }
const invocations = new WeakMap<TaskRepository, Invocation>()
const generations = new WeakMap<TaskRepository, number>()
const provisioned = new WeakMap<SessionProvider, Map<string, Promise<SessionHandle>>>()
const provisioning = new WeakMap<TaskRepository, Promise<void>>()

function taskOrThrow(view: TaskProjection, id: string): Task { return view.tasks.find(task => task.id === id) ?? (() => { throw new TaskDomainError(`Unknown task: ${id}`) })() }
function sessionOrThrow(view: TaskProjection, taskId: string): TaskSession { return view.sessions.find(session => session.taskId === taskId) ?? (() => { throw new TaskDomainError(`Task has no primary session: ${taskId}`) })() }
function latestAttempt(view: TaskProjection, sessionId: string): AgentAttempt | undefined { return view.attempts.filter(attempt => attempt.sessionId === sessionId).at(-1) }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function parseResult(value: unknown): AgentExecutionResult {
  if (!isRecord(value)) throw new TaskDomainError('Agent provider returned an invalid result')
  if (value.outcome !== 'succeeded' && value.outcome !== 'paused' && value.outcome !== 'blocked' && value.outcome !== 'failed' && value.outcome !== 'cancelled') throw new TaskDomainError('Agent provider returned an invalid execution outcome')
  if (value.reason !== undefined && typeof value.reason !== 'string') throw new TaskDomainError('Agent provider returned an invalid reason')
  return { outcome: value.outcome, ...(value.reason === undefined ? {} : { reason: value.reason }) }
}
function reasonOrDefault(reason: string | undefined, fallback: string): string { return reason === undefined || reason.trim().length === 0 ? fallback : reason }
function nextGeneration(repository: TaskRepository): number { const generation = (generations.get(repository) ?? 0) + 1; generations.set(repository, generation); return generation }
function stale(repository: TaskRepository, invocation: Invocation): boolean { return generations.get(repository) !== invocation.generation || invocations.get(repository) !== invocation }
function abortInvocation(repository: TaskRepository, taskId: string): void {
  const invocation = invocations.get(repository)
  if (invocation?.taskId !== taskId) return
  invocation.controller.abort(new Error(`Task ${taskId} execution was controlled`))
  nextGeneration(repository)
  invocations.delete(repository)
}
async function provision(provider: SessionProvider, request: SessionCreateRequest, signal: AbortSignal): Promise<SessionHandle> {
  let requests = provisioned.get(provider)
  if (requests === undefined) { requests = new Map(); provisioned.set(provider, requests) }
  const existing = requests.get(request.idempotencyKey)
  if (existing !== undefined) return existing
  const pending = provider.create(request, signal).then(parseSessionHandle)
  requests.set(request.idempotencyKey, pending)
  try { return await pending } catch (error) { requests.delete(request.idempotencyKey); throw error }
}
function parseSessionHandle(value: unknown): SessionHandle {
  if (!isRecord(value) || typeof value.externalSessionId !== 'string' || value.externalSessionId.trim().length === 0) throw new TaskDomainError('Session provider returned an invalid handle')
  return { externalSessionId: value.externalSessionId }
}

/** Injectable task execution; it adapts no DSH Host or desktop provider. */
export class TaskExecutionEngine {
  private readonly repository: TaskRepository
  private readonly providers: ExecutionProviders
  private readonly lifetime: AbortSignal
  constructor(options: ExecutionEngineOptions) { this.repository = options.repository; this.providers = options.providers; this.lifetime = options.signal ?? neverAborted }
  async snapshot(): Promise<ExecutionSnapshot> { const view = await this.repository.snapshot(); return { view, tree: taskTree(view) } }

  async intake(input: unknown, signal: AbortSignal = this.lifetime): Promise<ExecutionSnapshot> {
    signal.throwIfAborted()
    const planned = this.providers.planner === undefined ? input : await this.providers.planner.plan(input, signal)
    signal.throwIfAborted()
    const flat = flattenTaskDefinition(parseTaskDefinition(planned))
    const before = await this.repository.snapshot()
    signal.throwIfAborted()
    const taskIds = new Set(before.tasks.map(task => task.id)); const sessionIds = new Set(before.sessions.map(session => session.id))
    for (const value of flat) {
      if (taskIds.has(value.definition.id)) throw new TaskDomainError(`Duplicate task: ${value.definition.id}`)
      taskIds.add(value.definition.id)
      const sessionId = value.definition.sessionId ?? `session:${value.definition.id}`
      if (sessionIds.has(sessionId)) throw new TaskDomainError(`Duplicate session: ${sessionId}`)
      sessionIds.add(sessionId)
    }
    await this.repository.dispatch({ type: 'task.intake', tasks: flat.map(taskRegistration) })
    signal.throwIfAborted()
    return this.provisionSessions(signal)
  }

  private async provisionSessionsNow(signal: AbortSignal): Promise<ExecutionSnapshot> {
    signal.throwIfAborted()
    const view = await this.repository.snapshot(); signal.throwIfAborted()
    const byTask = new Map(view.tasks.map(task => [task.id, task])); const sessions = new Map(view.sessions.map(session => [session.taskId, session]))
    for (const current of view.sessions) {
      signal.throwIfAborted()
      if (current.externalSessionId !== null) continue
      const task = byTask.get(current.taskId)
      if (task === undefined) throw new TaskDomainError(`Session belongs to unknown task: ${current.id}`)
      const request: SessionCreateRequest = { sessionId: current.id, idempotencyKey: `dsh-devwork/session/${current.id}`, taskId: current.taskId, parentSessionId: task.parentId === null ? null : sessions.get(task.parentId)?.id ?? null, title: task.title, goal: task.goal, workingDirectory: task.workingDirectory ?? null, executionBoundary: task.executionBoundary ?? null }
      const handle = await provision(this.providers.sessions, request, signal); signal.throwIfAborted()
      await this.repository.dispatch({ type: 'session.bind', sessionId: current.id, externalSessionId: handle.externalSessionId }); signal.throwIfAborted()
    }
    return this.snapshot()
  }

  async provisionSessions(signal: AbortSignal = this.lifetime): Promise<ExecutionSnapshot> {
    const previous = provisioning.get(this.repository) ?? Promise.resolve()
    const next = previous.then(() => this.provisionSessionsNow(signal))
    const settled = next.then(() => undefined, () => undefined)
    provisioning.set(this.repository, settled)
    return next
  }

  async pause(taskId: string): Promise<ExecutionSnapshot> { abortInvocation(this.repository, taskId); await this.repository.dispatch({ type: 'task.pause', taskId }); return this.snapshot() }
  async block(taskId: string, reason: string): Promise<ExecutionSnapshot> { abortInvocation(this.repository, taskId); await this.repository.dispatch({ type: 'task.block', taskId, reason }); return this.snapshot() }
  async fail(taskId: string, reason = 'Execution failed'): Promise<ExecutionSnapshot> { abortInvocation(this.repository, taskId); await this.repository.dispatch({ type: 'task.fail', taskId, reason }); return this.snapshot() }
  async cancel(taskId: string): Promise<ExecutionSnapshot> { abortInvocation(this.repository, taskId); await this.repository.dispatch({ type: 'task.cancel', taskId }); return this.snapshot() }
  continue(taskId: string, options: ExecuteOptions = {}): Promise<ExecutionSnapshot> { return this.execute(taskId, options) }
  retry(taskId: string, options: ExecuteOptions = {}): Promise<ExecutionSnapshot> { return this.execute(taskId, options) }

  async execute(taskId: string, options: ExecuteOptions = {}): Promise<ExecutionSnapshot> {
    if (invocations.has(this.repository)) throw new TaskDomainError('An executor is already active')
    const controller = new AbortController(); const signal = AbortSignal.any([options.signal ?? neverAborted, this.lifetime, controller.signal]); signal.throwIfAborted()
    const invocation: Invocation = { taskId, generation: nextGeneration(this.repository), controller, attemptId: null }; invocations.set(this.repository, invocation)
    try {
      let view = await this.repository.snapshot(); signal.throwIfAborted()
      const task = taskOrThrow(view, taskId); const session = sessionOrThrow(view, taskId)
      if (session.externalSessionId === null) throw new TaskDomainError(`Task Session is not provisioned: ${session.id}`)
      if (task.status === 'cancelled' || task.status === 'completed') return this.snapshot()
      if (task.status !== 'active') await this.repository.dispatch({ type: 'task.continue', taskId })
      if (signal.aborted && stale(this.repository, invocation)) return this.snapshot()
      signal.throwIfAborted(); view = await this.repository.snapshot(); signal.throwIfAborted()
      if (signal.aborted && stale(this.repository, invocation)) return this.snapshot()
      const continued = taskOrThrow(view, taskId)
      if (continued.status === 'cancelled' || continued.status === 'completed') return this.snapshot()
      const currentSession = sessionOrThrow(view, taskId)
      if (currentSession.externalSessionId === null) throw new TaskDomainError(`Task Session is not provisioned: ${currentSession.id}`)
      let attempt = latestAttempt(view, currentSession.id); const agentId = this.providers.agents.id
      if (attempt?.status === 'running') throw new TaskDomainError(`Task already has a running Attempt: ${attempt.id}`)
      try {
        if (attempt === undefined) await this.repository.dispatch({ type: 'attempt.start', id: `attempt:${taskId}:1`, sessionId: currentSession.id, agentId })
        else if (attempt.status === 'failed' || attempt.status === 'succeeded' || attempt.status === 'cancelled') await this.repository.dispatch({ type: 'task.retry', id: `attempt:${taskId}:${attempt.number + 1}`, taskId, agentId })
        else if (attempt.status === 'waiting' || attempt.status === 'paused') await this.repository.dispatch({ type: 'attempt.transition', attemptId: attempt.id, status: 'running' })
      } catch (error) {
        if (signal.aborted && stale(this.repository, invocation)) return this.snapshot()
        throw error
      }
      if (signal.aborted) {
        if (stale(this.repository, invocation)) return this.snapshot()
        const current = await this.repository.snapshot()
        const running = latestAttempt(current, currentSession.id)
        if (running?.status === 'running') await this.repository.dispatch({ type: 'execution.settle', attemptId: running.id, outcome: 'cancelled', reason: null })
        return this.snapshot()
      }
      view = await this.repository.snapshot()
      if (signal.aborted) {
        if (stale(this.repository, invocation)) return this.snapshot()
        const running = latestAttempt(view, currentSession.id)
        if (running?.status === 'running') await this.repository.dispatch({ type: 'execution.settle', attemptId: running.id, outcome: 'cancelled', reason: null })
        return this.snapshot()
      }
      attempt = latestAttempt(view, currentSession.id)
      if (attempt === undefined || attempt.status !== 'running') throw new TaskDomainError(`Task has no running Attempt: ${taskId}`)
      invocation.attemptId = attempt.id
      const current = taskOrThrow(view, taskId)
      let result: AgentExecutionResult
      try { result = parseResult(await this.providers.agents.execute({ task: current, session: currentSession, attempt, signal })) } catch (error) {
        const reason = error instanceof Error ? error.message : 'Agent execution failed'
        if (!stale(this.repository, invocation)) await this.repository.dispatch({ type: 'execution.settle', attemptId: attempt.id, outcome: signal.aborted ? 'cancelled' : 'failed', reason: signal.aborted ? null : reason })
        return this.snapshot()
      }
      if (signal.aborted) {
        if (!stale(this.repository, invocation)) await this.repository.dispatch({ type: 'execution.settle', attemptId: attempt.id, outcome: 'cancelled', reason: null })
        return this.snapshot()
      }
      if (stale(this.repository, invocation)) return this.snapshot()
      const reason = reasonOrDefault(result.reason, `Execution ${result.outcome}`)
      await this.repository.dispatch({ type: 'execution.settle', attemptId: attempt.id, outcome: result.outcome, reason: result.outcome === 'blocked' || result.outcome === 'failed' ? reason : null })
      return this.snapshot()
    } finally { if (invocations.get(this.repository) === invocation) invocations.delete(this.repository) }
  }

  get activeExecutor(): string | null { return invocations.get(this.repository)?.taskId ?? null }
}
