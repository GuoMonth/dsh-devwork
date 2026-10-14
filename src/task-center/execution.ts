import { parseTaskDefinition, flattenTaskDefinition, taskRegistration } from './intake.js'
import { taskTree } from './tree.js'
import { TaskDomainError } from './types.js'
import type { AgentAttempt, ExecutionOutcome, Task, TaskProjection, TaskSession } from './types.js'
import type { TaskRepository } from './store.js'

export interface SessionCreateRequest {
  readonly sessionId: string
  readonly taskId: string
  readonly parentSessionId: string | null
  readonly title: string
  readonly goal: string
  readonly workingDirectory: string | null
  readonly executionBoundary: string | null
}
export interface SessionHandle { readonly externalSessionId?: string | null }
export interface SessionProvider {
  readonly create?: (request: SessionCreateRequest, signal?: AbortSignal) => Promise<SessionHandle>
  readonly createSession?: (request: SessionCreateRequest, signal?: AbortSignal) => Promise<SessionHandle>
}
export interface TaskDefinitionProvider { plan(request: unknown, signal?: AbortSignal): Promise<unknown> }

export interface AgentExecutionRequest {
  readonly task: Task
  readonly session: TaskSession
  readonly attempt: AgentAttempt
  readonly signal: AbortSignal
}
export interface AgentExecutionResult { readonly outcome: ExecutionOutcome; readonly reason?: string }
export interface AgentProvider {
  readonly id?: string
  readonly execute?: (request: AgentExecutionRequest) => Promise<AgentExecutionResult>
  readonly run?: (request: AgentExecutionRequest) => Promise<AgentExecutionResult>
}
export interface ExecutionProviders { readonly sessions: SessionProvider; readonly agents: AgentProvider; readonly planner?: TaskDefinitionProvider }
export interface ExecutionEngineOptions { readonly repository: TaskRepository; readonly providers: ExecutionProviders; readonly signal?: AbortSignal }
export interface ExecutionSnapshot { readonly view: TaskProjection; readonly tree: ReturnType<typeof taskTree> }
export interface ExecuteOptions { readonly agentId?: string; readonly signal?: AbortSignal }

const neverAborted = new AbortController().signal
function taskOrThrow(view: TaskProjection, id: string): Task { return view.tasks.find(task => task.id === id) ?? (() => { throw new TaskDomainError(`Unknown task: ${id}`) })() }
function sessionOrThrow(view: TaskProjection, taskId: string): TaskSession { return view.sessions.find(session => session.taskId === taskId) ?? (() => { throw new TaskDomainError(`Task has no primary session: ${taskId}`) })() }
function latestAttempt(view: TaskProjection, sessionId: string): AgentAttempt | undefined { return view.attempts.filter(attempt => attempt.sessionId === sessionId).at(-1) }
function reasonOrDefault(reason: string | undefined, fallback: string): string { return reason === undefined || reason.trim().length === 0 ? fallback : reason }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function outcome(value: unknown): ExecutionOutcome {
  if (value === 'succeeded' || value === 'paused' || value === 'blocked' || value === 'failed' || value === 'cancelled') return value
  throw new TaskDomainError('Agent provider returned an invalid execution outcome')
}
function executionResult(value: unknown): AgentExecutionResult {
  if (!isRecord(value)) throw new TaskDomainError('Agent provider returned an invalid result')
  const result = value
  if (result.reason !== undefined && typeof result.reason !== 'string') throw new TaskDomainError('Agent provider returned an invalid reason')
  return { outcome: outcome(result.outcome), ...(result.reason === undefined ? {} : { reason: result.reason }) }
}
function externalSessionId(value: unknown): string | null {
  if (!isRecord(value)) throw new TaskDomainError('Session provider returned an invalid handle')
  const handle = value
  if (handle.externalSessionId === undefined || handle.externalSessionId === null) return null
  if (typeof handle.externalSessionId !== 'string' || handle.externalSessionId.trim().length === 0) throw new TaskDomainError('Session provider returned an invalid external Session id')
  return handle.externalSessionId
}
async function createSession(provider: SessionProvider, request: SessionCreateRequest, signal: AbortSignal): Promise<SessionHandle> {
  const create = provider.create ?? provider.createSession
  if (create === undefined) throw new TaskDomainError('Session provider has no create method')
  return create.call(provider, request, signal)
}
async function executeAgent(provider: AgentProvider, request: AgentExecutionRequest): Promise<unknown> {
  const execute = provider.execute ?? provider.run
  if (execute === undefined) throw new TaskDomainError('Agent provider has no execute method')
  return execute.call(provider, request)
}

/** Durable task execution around TaskRepository; providers are intentionally injectable for mock-only tests. */
export class TaskExecutionEngine {
  private readonly repository: TaskRepository
  private readonly providers: ExecutionProviders
  private readonly lifetime: AbortSignal
  private activeTaskId: string | null = null

  constructor(options: ExecutionEngineOptions)
  constructor(repository: TaskRepository, providers: ExecutionProviders, signal?: AbortSignal)
  constructor(first: ExecutionEngineOptions | TaskRepository, second?: ExecutionProviders, signal?: AbortSignal) {
    if ('repository' in first) {
      this.repository = first.repository
      this.providers = first.providers
      this.lifetime = first.signal ?? neverAborted
    } else {
      if (second === undefined) throw new TaskDomainError('Execution providers are required')
      this.repository = first
      this.providers = second
      this.lifetime = signal ?? neverAborted
    }
  }

  async snapshot(): Promise<ExecutionSnapshot> {
    const view = await this.repository.snapshot()
    return { view, tree: taskTree(view) }
  }

  /** Validate and register one nested task plan, including one Session per task. */
  async intake(input: unknown, signal: AbortSignal = this.lifetime): Promise<ExecutionSnapshot> {
    signal.throwIfAborted()
    const planned = this.providers.planner === undefined ? input : await this.providers.planner.plan.call(this.providers.planner, input, signal)
    const root = parseTaskDefinition(planned)
    const flat = flattenTaskDefinition(root)
    const before = await this.repository.snapshot()
    const taskIds = new Set(before.tasks.map(task => task.id))
    const sessionIds = new Set(before.sessions.map(session => session.id))
    for (const value of flat) {
      if (taskIds.has(value.definition.id)) throw new TaskDomainError(`Duplicate task: ${value.definition.id}`)
      taskIds.add(value.definition.id)
      const sessionId = value.definition.sessionId ?? `session:${value.definition.id}`
      if (sessionIds.has(sessionId)) throw new TaskDomainError(`Duplicate session: ${sessionId}`)
      sessionIds.add(sessionId)
    }
    await this.repository.dispatch({ type: 'task.intake', tasks: flat.map(taskRegistration) })
    return this.provisionSessions(signal)
  }

  register(input: unknown, signal?: AbortSignal): Promise<ExecutionSnapshot> { return this.intake(input, signal) }

  /** Provision unbound primary Sessions after a provider restart or failure. */
  async provisionSessions(signal: AbortSignal = this.lifetime): Promise<ExecutionSnapshot> {
    signal.throwIfAborted()
    const view = await this.repository.snapshot()
    const byTask = new Map(view.tasks.map(task => [task.id, task]))
    const sessions = new Map(view.sessions.map(session => [session.taskId, session]))
    for (const current of view.sessions) {
      if (current.externalSessionId !== null) continue
      const task = byTask.get(current.taskId)
      if (task === undefined) throw new TaskDomainError(`Session belongs to unknown task: ${current.id}`)
      const parentId = task.parentId === null ? null : sessions.get(task.parentId)?.id ?? null
      const handle = await createSession(this.providers.sessions, { sessionId: current.id, taskId: current.taskId, parentSessionId: parentId, title: task.title, goal: task.goal, workingDirectory: task.workingDirectory ?? null, executionBoundary: task.executionBoundary ?? null }, signal)
      const externalId = externalSessionId(handle)
      if (externalId !== null) await this.repository.dispatch({ type: 'session.bind', sessionId: current.id, externalSessionId: externalId })
    }
    return this.snapshot()
  }

  async continue(taskId: string): Promise<ExecutionSnapshot> {
    const view = await this.repository.snapshot()
    const task = taskOrThrow(view, taskId)
    if (task.status !== 'active') await this.repository.dispatch({ type: 'task.continue', taskId })
    const current = await this.repository.snapshot()
    const session = sessionOrThrow(current, taskId)
    const attempt = latestAttempt(current, session.id)
    if (attempt !== undefined && (attempt.status === 'waiting' || attempt.status === 'paused')) await this.repository.dispatch({ type: 'attempt.transition', attemptId: attempt.id, status: 'running' })
    return this.snapshot()
  }

  async pause(taskId: string): Promise<ExecutionSnapshot> {
    const view = await this.repository.snapshot()
    const task = taskOrThrow(view, taskId)
    const session = sessionOrThrow(view, taskId)
    const attempt = latestAttempt(view, session.id)
    if (attempt !== undefined && attempt.status === 'running') await this.repository.dispatch({ type: 'attempt.transition', attemptId: attempt.id, status: 'paused' })
    if (task.status !== 'paused') await this.repository.dispatch({ type: 'task.pause', taskId })
    return this.snapshot()
  }

  async block(taskId: string, reason: string): Promise<ExecutionSnapshot> {
    const view = await this.repository.snapshot()
    const session = view.sessions.find(value => value.taskId === taskId)
    const attempt = session === undefined ? undefined : latestAttempt(view, session.id)
    if (attempt !== undefined && attempt.status === 'running') await this.repository.dispatch({ type: 'attempt.transition', attemptId: attempt.id, status: 'waiting' })
    await this.repository.dispatch({ type: 'task.block', taskId, reason })
    return this.snapshot()
  }

  async fail(taskId: string, reason = 'Execution failed'): Promise<ExecutionSnapshot> {
    const view = await this.repository.snapshot()
    const session = view.sessions.find(value => value.taskId === taskId)
    const attempt = session === undefined ? undefined : latestAttempt(view, session.id)
    if (attempt !== undefined && attempt.status === 'running') await this.repository.dispatch({ type: 'attempt.transition', attemptId: attempt.id, status: 'failed' })
    await this.repository.dispatch({ type: 'task.fail', taskId, reason })
    return this.snapshot()
  }

  async cancel(taskId: string): Promise<ExecutionSnapshot> {
    const view = await this.repository.snapshot()
    const session = view.sessions.find(value => value.taskId === taskId)
    const attempt = session === undefined ? undefined : latestAttempt(view, session.id)
    if (attempt !== undefined && (attempt.status === 'running' || attempt.status === 'waiting' || attempt.status === 'paused')) await this.repository.dispatch({ type: 'attempt.transition', attemptId: attempt.id, status: 'cancelled' })
    await this.repository.dispatch({ type: 'task.cancel', taskId })
    return this.snapshot()
  }

  async retry(taskId: string, attemptId: string, agentId?: string): Promise<ExecutionSnapshot> {
    const view = await this.repository.snapshot()
    const task = taskOrThrow(view, taskId)
    await this.repository.dispatch({ type: 'task.retry', id: attemptId, taskId: task.id, agentId: agentId ?? this.providers.agents.id ?? 'agent' })
    return this.snapshot()
  }

  /** Execute one task; provider completion is translated into durable events. */
  async execute(taskId: string, options: ExecuteOptions = {}): Promise<ExecutionSnapshot> {
    if (this.activeTaskId !== null) throw new TaskDomainError(`An executor is already active for task: ${this.activeTaskId}`)
    const signal = AbortSignal.any([options.signal ?? neverAborted, this.lifetime])
    signal.throwIfAborted()
    this.activeTaskId = taskId
    try {
      let view = await this.repository.snapshot()
      const task = taskOrThrow(view, taskId)
      sessionOrThrow(view, taskId)
      if (task.status === 'cancelled' || task.status === 'completed') return this.snapshot()
      if (task.status !== 'active') await this.repository.dispatch({ type: 'task.continue', taskId })
      view = await this.repository.snapshot()
      const afterContinue = taskOrThrow(view, taskId)
      if (afterContinue.status === 'cancelled' || afterContinue.status === 'completed') return this.snapshot()
      let currentSession = sessionOrThrow(view, taskId)
      let attempt = latestAttempt(view, currentSession.id)
      const agentId = options.agentId ?? this.providers.agents.id ?? 'agent'
      try {
        if (attempt === undefined) {
          await this.repository.dispatch({ type: 'attempt.start', id: `attempt:${taskId}:1`, sessionId: currentSession.id, agentId })
        } else if (attempt.status === 'failed' || attempt.status === 'succeeded' || attempt.status === 'cancelled') {
          await this.repository.dispatch({ type: 'task.retry', id: `attempt:${taskId}:${attempt.number + 1}`, taskId, agentId })
        } else if (attempt.status === 'waiting' || attempt.status === 'paused') {
          await this.repository.dispatch({ type: 'attempt.transition', attemptId: attempt.id, status: 'running' })
        }
      } catch (error) {
        const latest = await this.repository.snapshot()
        if (latest.tasks.find(value => value.id === taskId)?.status === 'cancelled') return this.snapshot()
        throw error
      }
      view = await this.repository.snapshot()
      const current = taskOrThrow(view, taskId)
      currentSession = sessionOrThrow(view, taskId)
      attempt = latestAttempt(view, currentSession.id)
      if (attempt === undefined || attempt.status !== 'running') throw new TaskDomainError(`Task has no running attempt: ${taskId}`)
      let result: AgentExecutionResult
      try {
        result = executionResult(await executeAgent(this.providers.agents, { task: current, session: currentSession, attempt, signal }))
      } catch (error) {
        if (signal.aborted) {
          await this.repository.dispatch({ type: 'execution.settle', attemptId: attempt.id, outcome: 'cancelled', reason: null })
          return this.snapshot()
        }
        const reason = error instanceof Error ? error.message : 'Agent execution failed'
        try {
          await this.repository.dispatch({ type: 'execution.settle', attemptId: attempt.id, outcome: 'failed', reason })
        } catch (settleError) {
          if (!(settleError instanceof TaskDomainError) || (!settleError.message.includes('stale') && !settleError.message.includes('active task'))) throw settleError
        }
        return this.snapshot()
      }
      const reason = reasonOrDefault(result.reason, `Execution ${result.outcome}`)
      try {
        await this.repository.dispatch({ type: 'execution.settle', attemptId: attempt.id, outcome: result.outcome, reason: result.outcome === 'blocked' || result.outcome === 'failed' ? reason : null })
      } catch (error) {
        // A concurrent pause/block/fail/cancel owns the durable outcome. The
        // provider's late result is stale and must not overwrite it.
        if (!(error instanceof TaskDomainError) || (!error.message.includes('stale') && !error.message.includes('active task'))) throw error
      }
      return this.snapshot()
    } finally {
      this.activeTaskId = null
    }
  }

  get activeExecutor(): string | null { return this.activeTaskId }
}

export class MockSessionProvider implements SessionProvider {
  readonly requests: SessionCreateRequest[] = []
  async create(request: SessionCreateRequest): Promise<SessionHandle> { this.requests.push(request); return { externalSessionId: `mock:${request.sessionId}` } }
}

export class MockAgentProvider implements AgentProvider {
  readonly id: string
  readonly requests: AgentExecutionRequest[] = []
  private readonly outcomes: AgentExecutionResult[]
  constructor(outcomes: readonly AgentExecutionResult[] = [{ outcome: 'succeeded' }], id = 'mock-agent') { this.outcomes = [...outcomes]; this.id = id }
  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> { this.requests.push(request); return this.outcomes.shift() ?? { outcome: 'succeeded' } }
}

export { TaskExecutionEngine as ExecutionEngine }
export class TaskExecutionService extends TaskExecutionEngine {}
