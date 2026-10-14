import { artifactTransitions, attemptTransitions, integrationTransitions, requireTransition, sessionTransitions, taskTransitions } from './transitions.js'
import { TaskDomainError } from './types.js'
import type { AgentAttempt, IntegrationRef, Task, TaskArtifact, TaskEvent, TaskLog, TaskProjection, TaskSession, WorkspaceLease } from './types.js'

function duplicate(kind: string, id: string): never { throw new TaskDomainError(`Duplicate ${kind}: ${id}`) }
function missing(kind: string, id: string): never { throw new TaskDomainError(`Unknown ${kind}: ${id}`) }
function task(tasks: Map<string, Task>, id: string): Task { return tasks.get(id) ?? missing('task', id) }
function session(sessions: Map<string, TaskSession>, id: string): TaskSession { return sessions.get(id) ?? missing('session', id) }
function attempt(attempts: Map<string, AgentAttempt>, id: string): AgentAttempt { return attempts.get(id) ?? missing('attempt', id) }
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

  switch (command.type) {
    case 'task.create':
      if (tasks.has(command.id)) duplicate('task', command.id)
      if (command.parentId !== null) assertOpen(task(tasks, command.parentId))
      if (command.acceptance.length === 0) throw new TaskDomainError('Task requires acceptance criteria')
      if (new Set(command.dependencyIds).size !== command.dependencyIds.length) throw new TaskDomainError('Duplicate task dependency')
      for (const dependencyId of command.dependencyIds) {
        if (dependencyId === command.id) throw new TaskDomainError('Task cannot depend on itself')
        task(tasks, dependencyId)
      }
      tasks.set(command.id, { id: command.id, parentId: command.parentId, title: command.title, goal: command.goal, scope: [...command.scope], acceptance: [...command.acceptance], dependencyIds: [...command.dependencyIds], status: 'pending', blockedReason: null })
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
      if ((command.status === 'completed' || command.status === 'cancelled') && [...sessions.values()].some(value => value.taskId === current.id && (value.status === 'running' || value.status === 'waiting'))) throw new TaskDomainError('Task has an active attempt')
      replace(tasks, { ...current, status: command.status, blockedReason: null })
      break
    }
    case 'task.block': {
      const current = task(tasks, command.taskId)
      requireTransition(taskTransitions, current.status, 'blocked')
      replace(tasks, { ...current, status: 'blocked', blockedReason: command.reason })
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
    case 'attempt.start': {
      if (attempts.has(command.id)) duplicate('attempt', command.id)
      const owner = session(sessions, command.sessionId)
      assertOpen(task(tasks, owner.taskId))
      assertDependencies(tasks, task(tasks, owner.taskId))
      if (owner.status === 'running' || owner.status === 'waiting') throw new TaskDomainError(`Session already has an active attempt: ${owner.id}`)
      const number = Math.max(0, ...[...attempts.values()].filter(value => value.sessionId === owner.id).map(value => value.number)) + 1
      attempts.set(command.id, { id: command.id, sessionId: owner.id, agentId: command.agentId, number, status: 'running' })
      replace(sessions, { ...owner, status: 'running' })
      break
    }
    case 'attempt.transition': {
      const current = attempt(attempts, command.attemptId)
      requireTransition(attemptTransitions, current.status, command.status)
      replace(attempts, { ...current, status: command.status })
      const owner = session(sessions, current.sessionId)
      requireTransition(sessionTransitions, owner.status, command.status)
      replace(sessions, { ...owner, status: command.status })
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
