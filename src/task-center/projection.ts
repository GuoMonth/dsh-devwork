import { artifactTransitions, attemptTransitions, integrationTransitions, requireTransition, sessionTransitions, taskTransitions } from './transitions.js'
import { TaskDomainError } from './types.js'
import type { AgentAttempt, AttemptStatus, IntegrationRef, Task, TaskArtifact, TaskEvent, TaskLog, TaskProjection, TaskSession, TaskStatus, WorkspaceLease } from './types.js'

function duplicate(kind: string, id: string): never { throw new TaskDomainError(`Duplicate ${kind}: ${id}`) }
function missing(kind: string, id: string): never { throw new TaskDomainError(`Unknown ${kind}: ${id}`) }
function task(tasks: Map<string, Task>, id: string): Task { return tasks.get(id) ?? missing('task', id) }
function session(sessions: Map<string, TaskSession>, id: string): TaskSession { return sessions.get(id) ?? missing('session', id) }
function attempt(attempts: Map<string, AgentAttempt>, id: string): AgentAttempt { return attempts.get(id) ?? missing('attempt', id) }
function primarySession(sessions: Map<string, TaskSession>, taskId: string): TaskSession {
  return [...sessions.values()].find(value => value.taskId === taskId) ?? missing('primary session for task', taskId)
}
function artifact(artifacts: Map<string, TaskArtifact>, id: string): TaskArtifact { return artifacts.get(id) ?? missing('artifact', id) }
function integration(integrations: Map<string, IntegrationRef>, id: string): IntegrationRef { return integrations.get(id) ?? missing('integration', id) }
function lease(leases: Map<string, WorkspaceLease>, id: string): WorkspaceLease { return leases.get(id) ?? missing('workspace lease', id) }
function replace<T extends { readonly id: string }>(map: Map<string, T>, value: T): void { map.set(value.id, value) }
function cannotCompleteParent(tasks: Map<string, Task>, parentId: string): boolean { return [...tasks.values()].some(child => child.parentId === parentId && child.status !== 'completed' && child.status !== 'cancelled') }
function assertOpen(value: Task): void {
  if (value.status === 'completed' || value.status === 'cancelled') throw new TaskDomainError(`Task is terminal: ${value.id}`)
}
function assertDependencies(tasks: Map<string, Task>, value: Task): void {
  if (value.dependencyIds.some(id => task(tasks, id).status !== 'completed')) throw new TaskDomainError('Task has unfinished dependencies')
}
function assertSingleExecutor(attempts: Map<string, AgentAttempt>): void {
  if ([...attempts.values()].some(value => value.status === 'running')) throw new TaskDomainError('An executor is already active')
}
function assertNoCycle(tasks: Map<string, Task>, taskId: string, parentId: string | null): void {
  const seen = new Set<string>([taskId])
  let current = parentId
  while (current !== null) {
    if (seen.has(current)) throw new TaskDomainError('Task parent relationship contains a cycle')
    seen.add(current)
    current = tasks.get(current)?.parentId ?? null
  }
}

// Completion waits for children, and execution waits for dependencies. Both
// orderings must be acyclic together (a child cannot depend on its own parent).
function assertTaskOrder(tasks: Map<string, Task>): void {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const children = new Map<string, string[]>()
  for (const value of tasks.values()) {
    if (value.parentId === null) continue
    const group = children.get(value.parentId) ?? []
    group.push(value.id)
    children.set(value.parentId, group)
  }
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new TaskDomainError('Task dependencies and parent relationships contain a cycle')
    if (visited.has(id)) return
    visiting.add(id)
    for (const next of [...task(tasks, id).dependencyIds, ...(children.get(id) ?? [])]) visit(next)
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of tasks.keys()) visit(id)
}

function initial(): TaskProjection { return { revision: 0, tasks: [], sessions: [], attempts: [], artifacts: [], integrations: [], leases: [] } }

export function applyEvent(previous: TaskProjection, event: TaskEvent): TaskProjection {
  if (event.sequence !== previous.revision + 1) throw new TaskDomainError(`Expected event sequence ${previous.revision + 1}, got ${event.sequence}`)
  const tasks = new Map(previous.tasks.map(value => [value.id, value]))
  const sessions = new Map(previous.sessions.map(value => [value.id, value]))
  const attempts = new Map(previous.attempts.map(value => [value.id, value]))
  const artifacts = new Map(previous.artifacts.map(value => [value.id, value]))
  const integrations = new Map(previous.integrations.map(value => [value.id, value]))
  const leases = new Map(previous.leases.map(value => [value.id, value]))
  const command = event.command

  const changeAttempt = (current: AgentAttempt, status: AttemptStatus): void => {
    requireTransition(attemptTransitions, current.status, status)
    if (status === 'running') assertSingleExecutor(attempts)
    const owner = session(sessions, current.sessionId)
    requireTransition(sessionTransitions, owner.status, status)
    replace(attempts, { ...current, status })
    replace(sessions, { ...owner, status })
  }
  const control = (taskId: string, status: TaskStatus, reason: string | null): void => {
    const current = task(tasks, taskId)
    requireTransition(taskTransitions, current.status, status)
    const bound = [...sessions.values()].find(value => value.taskId === taskId)
    const currentAttempt = [...attempts.values()].find(value => value.sessionId === bound?.id && ['running', 'waiting', 'paused'].includes(value.status))
    if (currentAttempt !== undefined) {
      const next = status === 'blocked' ? 'waiting' : status === 'paused' ? 'paused' : status === 'failed' ? 'failed' : 'cancelled'
      if (currentAttempt.status !== next) changeAttempt(currentAttempt, next)
    }
    replace(tasks, { ...current, status, blockedReason: reason })
  }

  switch (command.type) {
    case 'task.intake': {
      if (command.tasks.length === 0) throw new TaskDomainError('Task intake requires a non-empty plan')
      // Validate the complete plan on an isolated projection. Persisting this
      // single event makes task and primary Session reservations atomic.
      let next = previous
      const pending = [...command.tasks]
      const created = new Set(previous.tasks.map(value => value.id))
      while (pending.length > 0) {
        const index = pending.findIndex(value => (value.parentId === null || created.has(value.parentId)) && value.dependencyIds.every(id => created.has(id)))
        if (index < 0) throw new TaskDomainError('Task intake dependencies or parents cannot be resolved')
        const registration = pending.splice(index, 1)[0]
        if (registration === undefined) throw new TaskDomainError('Task intake is empty')
        const { sessionId, ...definition } = registration
        next = applyEvent(next, { ...event, sequence: next.revision + 1, command: { type: 'task.create', ...definition } })
        next = applyEvent(next, { ...event, sequence: next.revision + 1, command: { type: 'session.create', id: sessionId, taskId: definition.id, externalSessionId: null } })
        created.add(definition.id)
      }
      return { ...next, revision: event.sequence }
    }
    case 'task.create':
      if (tasks.has(command.id)) duplicate('task', command.id)
      if (command.parentId !== null) assertOpen(task(tasks, command.parentId))
      if (command.acceptance.length === 0) throw new TaskDomainError('Task requires acceptance criteria')
      if (new Set(command.dependencyIds).size !== command.dependencyIds.length) throw new TaskDomainError('Duplicate task dependency')
      for (const dependencyId of command.dependencyIds) {
        if (dependencyId === command.id) throw new TaskDomainError('Task cannot depend on itself')
        task(tasks, dependencyId)
      }
      tasks.set(command.id, { id: command.id, parentId: command.parentId, title: command.title, goal: command.goal, scope: [...command.scope], acceptance: [...command.acceptance], dependencyIds: [...command.dependencyIds], workingDirectory: command.workingDirectory ?? null, executionBoundary: command.executionBoundary ?? null, status: 'pending', blockedReason: null })
      assertTaskOrder(tasks)
      break
    case 'task.reparent': {
      const current = task(tasks, command.taskId)
      assertOpen(current)
      if (command.parentId !== null) assertOpen(task(tasks, command.parentId))
      assertNoCycle(tasks, command.taskId, command.parentId)
      replace(tasks, { ...current, parentId: command.parentId })
      assertTaskOrder(tasks)
      break
    }
    case 'task.transition': {
      const current = task(tasks, command.taskId)
      requireTransition(taskTransitions, current.status, command.status)
      if (command.status === 'active') assertDependencies(tasks, current)
      if (command.status === 'completed' && cannotCompleteParent(tasks, current.id)) throw new TaskDomainError('Task has unfinished child tasks')
      if ((command.status === 'completed' || command.status === 'cancelled') && [...sessions.values()].some(value => value.taskId === current.id && (value.status === 'running' || value.status === 'waiting' || value.status === 'paused'))) throw new TaskDomainError('Task has an active attempt')
      replace(tasks, { ...current, status: command.status, blockedReason: null })
      break
    }
    case 'task.continue': {
      const current = task(tasks, command.taskId)
      requireTransition(taskTransitions, current.status, 'active')
      assertDependencies(tasks, current)
      replace(tasks, { ...current, status: 'active', blockedReason: null })
      break
    }
    case 'task.pause': {
      control(command.taskId, 'paused', null)
      break
    }
    case 'task.block': {
      control(command.taskId, 'blocked', command.reason)
      break
    }
    case 'task.fail': {
      control(command.taskId, 'failed', command.reason)
      break
    }
    case 'task.cancel': {
      control(command.taskId, 'cancelled', null)
      break
    }
    case 'session.create': {
      if (sessions.has(command.id)) duplicate('session', command.id)
      const owner = task(tasks, command.taskId)
      assertOpen(owner)
      if ([...sessions.values()].some(value => value.taskId === owner.id)) throw new TaskDomainError(`Task already has a primary session: ${owner.id}`)
      if (command.externalSessionId !== null && [...sessions.values()].some(value => value.externalSessionId === command.externalSessionId)) throw new TaskDomainError('External session is already bound')
      sessions.set(command.id, { id: command.id, taskId: owner.id, externalSessionId: command.externalSessionId, status: 'idle' })
      break
    }
    case 'session.bind': {
      const current = session(sessions, command.sessionId)
      assertOpen(task(tasks, current.taskId))
      if (current.externalSessionId !== null) throw new TaskDomainError('Primary session is already provisioned')
      if ([...sessions.values()].some(value => value.externalSessionId === command.externalSessionId)) throw new TaskDomainError('External session is already bound')
      replace(sessions, { ...current, externalSessionId: command.externalSessionId })
      break
    }
    case 'attempt.start': {
      if (attempts.has(command.id)) duplicate('attempt', command.id)
      const owner = session(sessions, command.sessionId)
      assertOpen(task(tasks, owner.taskId))
      assertDependencies(tasks, task(tasks, owner.taskId))
      if (owner.status === 'running' || owner.status === 'waiting' || owner.status === 'paused') throw new TaskDomainError(`Session already has an active attempt: ${owner.id}`)
      assertSingleExecutor(attempts)
      const number = Math.max(0, ...[...attempts.values()].filter(value => value.sessionId === owner.id).map(value => value.number)) + 1
      attempts.set(command.id, { id: command.id, sessionId: owner.id, agentId: command.agentId, number, status: 'running' })
      replace(sessions, { ...owner, status: 'running' })
      break
    }
    case 'task.retry': {
      if (attempts.has(command.id)) duplicate('attempt', command.id)
      const owner = task(tasks, command.taskId)
      assertOpen(owner)
      assertDependencies(tasks, owner)
      if (owner.status !== 'active') requireTransition(taskTransitions, owner.status, 'active')
      const bound = primarySession(sessions, owner.id)
      if (bound.status === 'running' || bound.status === 'waiting' || bound.status === 'paused') throw new TaskDomainError(`Session already has an active attempt: ${bound.id}`)
      if (![...attempts.values()].some(value => value.sessionId === bound.id)) throw new TaskDomainError(`Task has no previous attempt to retry: ${owner.id}`)
      assertSingleExecutor(attempts)
      const number = Math.max(0, ...[...attempts.values()].filter(value => value.sessionId === bound.id).map(value => value.number)) + 1
      attempts.set(command.id, { id: command.id, sessionId: bound.id, agentId: command.agentId, number, status: 'running' })
      replace(sessions, { ...bound, status: 'running' })
      if (owner.status !== 'active') replace(tasks, { ...owner, status: 'active', blockedReason: null })
      break
    }
    case 'attempt.transition': {
      const current = attempt(attempts, command.attemptId)
      if (command.status === 'running') {
        const owner = task(tasks, session(sessions, current.sessionId).taskId)
        assertOpen(owner)
        assertDependencies(tasks, owner)
        if (owner.status !== 'active') throw new TaskDomainError('Continue the task before resuming its attempt')
      }
      changeAttempt(current, command.status)
      break
    }
    case 'execution.settle': {
      const current = attempt(attempts, command.attemptId)
      if (current.status !== 'running') throw new TaskDomainError('Execution result is stale')
      const owner = task(tasks, session(sessions, current.sessionId).taskId)
      if (owner.status !== 'active') throw new TaskDomainError('Execution result requires an active task')
      const status = command.outcome === 'succeeded' ? 'review' : command.outcome
      requireTransition(taskTransitions, owner.status, status)
      if ((status === 'blocked' || status === 'failed') && command.reason === null) throw new TaskDomainError('Blocked or failed execution requires a reason')
      changeAttempt(current, command.outcome === 'blocked' ? 'waiting' : command.outcome)
      replace(tasks, { ...owner, status, blockedReason: status === 'blocked' || status === 'failed' ? command.reason : null })
      break
    }
    case 'artifact.create': {
      if (artifacts.has(command.id)) duplicate('artifact', command.id)
      task(tasks, command.taskId)
      if (command.attemptId !== null && session(sessions, attempt(attempts, command.attemptId).sessionId).taskId !== command.taskId) throw new TaskDomainError('Artifact attempt belongs to another task')
      artifacts.set(command.id, { id: command.id, taskId: command.taskId, attemptId: command.attemptId, kind: command.kind, uri: command.uri, status: 'draft' })
      break
    }
    case 'artifact.transition': {
      const current = artifact(artifacts, command.artifactId)
      requireTransition(artifactTransitions, current.status, command.status)
      replace(artifacts, { ...current, status: command.status })
      break
    }
    case 'integration.create': {
      if (integrations.has(command.id)) duplicate('integration', command.id)
      const owner = task(tasks, command.taskId)
      if (command.artifactId !== null && artifact(artifacts, command.artifactId).taskId !== owner.id) throw new TaskDomainError('Integration artifact belongs to another task')
      integrations.set(command.id, { id: command.id, taskId: owner.id, artifactId: command.artifactId, provider: command.provider, url: command.url, status: 'draft' })
      break
    }
    case 'integration.transition': {
      const current = integration(integrations, command.integrationId)
      requireTransition(integrationTransitions, current.status, command.status)
      replace(integrations, { ...current, status: command.status })
      break
    }
    case 'lease.reserve':
      if (leases.has(command.id)) duplicate('workspace lease', command.id)
      task(tasks, command.taskId)
      if ([...leases.values()].some(value => value.taskId === command.taskId && value.status !== 'released')) throw new TaskDomainError(`Task already owns an active workspace lease: ${command.taskId}`)
      leases.set(command.id, { id: command.id, taskId: command.taskId, path: command.path, kind: command.kind, status: 'reserved' })
      break
    case 'lease.activate': {
      const current = lease(leases, command.leaseId)
      if (current.status !== 'reserved') throw new TaskDomainError(`Workspace lease is not reserved: ${current.id}`)
      replace(leases, { ...current, status: 'active' })
      break
    }
    case 'lease.release': {
      const current = lease(leases, command.leaseId)
      if (current.status === 'released') throw new TaskDomainError(`Workspace lease is already released: ${current.id}`)
      replace(leases, { ...current, status: 'released' })
      break
    }
  }
  return { revision: event.sequence, tasks: [...tasks.values()], sessions: [...sessions.values()], attempts: [...attempts.values()], artifacts: [...artifacts.values()], integrations: [...integrations.values()], leases: [...leases.values()] }
}

export function replay(log: TaskLog): TaskProjection { return log.events.reduce(applyEvent, initial()) }
