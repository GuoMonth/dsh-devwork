import { TaskDomainError } from './types.js'
import type { ArtifactCommit, ArtifactSource, DeliveryChecks, DeliveryReviewStatus, IntegrationStatus, TaskCommand, TaskEvent, TaskLog, TaskRegistration } from './types.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TaskDomainError('Expected an object')
  }
  return value
}

function fields(value: Record<string, unknown>, names: readonly string[], optional: readonly string[] = []): void {
  for (const key of Object.keys(value)) {
    if (!names.includes(key) && !optional.includes(key)) throw new TaskDomainError(`Unknown field: ${key}`)
  }
  for (const key of names) {
    if (!Object.hasOwn(value, key)) throw new TaskDomainError(`Missing field: ${key}`)
  }
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TaskDomainError('Expected non-empty text')
  return value
}

function nullableText(value: unknown): string | null {
  return value === null ? null : text(value)
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new TaskDomainError('Expected a text array')
  return value.map(text)
}

function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  for (const candidate of choices) if (value === candidate) return candidate
  throw new TaskDomainError(`Expected one of: ${choices.join(', ')}`)
}

function optionalText(value: unknown): string | undefined {
  return value === undefined ? undefined : text(value)
}

function nullableOptionalText(value: unknown): string | null | undefined {
  return value === undefined ? undefined : nullableText(value)
}

function parseChecks(value: unknown): DeliveryChecks {
  const item = record(value)
  fields(item, ['status'], ['summary', 'updatedAt'])
  const updatedAt = nullableOptionalText(item.updatedAt) ?? null
  if (updatedAt !== null && (!Number.isFinite(Date.parse(updatedAt)) || new Date(updatedAt).toISOString() !== updatedAt)) throw new TaskDomainError('Expected an ISO checks timestamp')
  return { status: choice(item.status, ['pending', 'passing', 'failing', 'unknown']), summary: nullableOptionalText(item.summary) ?? null, updatedAt }
}

function parseOptionalChecks(value: unknown): DeliveryChecks | undefined { return value === undefined ? undefined : parseChecks(value) }

function parseSource(value: unknown): ArtifactSource {
  const item = record(value)
  fields(item, ['sessionId', 'attemptId'])
  return { sessionId: nullableText(item.sessionId), attemptId: nullableText(item.attemptId) }
}

function parseOptionalSource(value: unknown): ArtifactSource | undefined { return value === undefined ? undefined : parseSource(value) }

function parseCommit(value: unknown): ArtifactCommit {
  const item = record(value)
  fields(item, ['sha', 'branch'])
  return { sha: nullableText(item.sha), branch: nullableText(item.branch) }
}

function parseOptionalCommit(value: unknown): ArtifactCommit | undefined { return value === undefined ? undefined : parseCommit(value) }

function parseReview(value: unknown): { readonly status: DeliveryReviewStatus; readonly summary: string | null; readonly updatedAt: string | null } {
  const item = record(value)
  fields(item, ['status'], ['summary', 'updatedAt'])
  const updatedAt = nullableOptionalText(item.updatedAt) ?? null
  if (updatedAt !== null && (!Number.isFinite(Date.parse(updatedAt)) || new Date(updatedAt).toISOString() !== updatedAt)) throw new TaskDomainError('Expected an ISO review timestamp')
  return { status: choice(item.status, ['pending', 'approved', 'changes_requested', 'unknown']), summary: nullableOptionalText(item.summary) ?? null, updatedAt }
}

export function parseCommand(input: unknown): TaskCommand {
  const value = record(input)
  switch (value.type) {
    case 'task.intake':
      fields(value, ['type', 'tasks'])
      return { type: value.type, tasks: list(value.tasks).map(parseRegistration) }
    case 'task.create':
      fields(value, ['type', 'id', 'parentId', 'title', 'goal', 'scope', 'acceptance', 'dependencyIds'], ['workingDirectory', 'executionBoundary'])
      return { type: value.type, id: text(value.id), parentId: nullableText(value.parentId), title: text(value.title), goal: text(value.goal), scope: textList(value.scope), acceptance: textList(value.acceptance), dependencyIds: textList(value.dependencyIds), workingDirectory: value.workingDirectory === undefined ? null : nullableText(value.workingDirectory), executionBoundary: value.executionBoundary === undefined ? null : nullableText(value.executionBoundary) }
    case 'task.reparent':
      fields(value, ['type', 'taskId', 'parentId'])
      return { type: value.type, taskId: text(value.taskId), parentId: nullableText(value.parentId) }
    case 'task.transition':
      fields(value, ['type', 'taskId', 'status'])
      return { type: value.type, taskId: text(value.taskId), status: choice(value.status, ['pending', 'active', 'review', 'completed', 'cancelled']) }
    case 'task.continue':
    case 'task.pause':
    case 'task.cancel':
      fields(value, ['type', 'taskId'])
      return { type: value.type, taskId: text(value.taskId) }
    case 'task.block':
      fields(value, ['type', 'taskId', 'reason'])
      return { type: value.type, taskId: text(value.taskId), reason: text(value.reason) }
    case 'task.fail':
      fields(value, ['type', 'taskId', 'reason'])
      return { type: value.type, taskId: text(value.taskId), reason: text(value.reason) }
    case 'task.retry':
      fields(value, ['type', 'id', 'taskId', 'agentId'])
      return { type: value.type, id: text(value.id), taskId: text(value.taskId), agentId: text(value.agentId) }
    case 'session.create':
      fields(value, ['type', 'id', 'taskId', 'externalSessionId'])
      return { type: value.type, id: text(value.id), taskId: text(value.taskId), externalSessionId: nullableText(value.externalSessionId) }
    case 'session.bind':
      fields(value, ['type', 'sessionId', 'externalSessionId'])
      return { type: value.type, sessionId: text(value.sessionId), externalSessionId: text(value.externalSessionId) }
    case 'attempt.start':
      fields(value, ['type', 'id', 'sessionId', 'agentId'])
      return { type: value.type, id: text(value.id), sessionId: text(value.sessionId), agentId: text(value.agentId) }
    case 'attempt.transition':
      fields(value, ['type', 'attemptId', 'status'])
      return { type: value.type, attemptId: text(value.attemptId), status: choice(value.status, ['running', 'waiting', 'paused', 'succeeded', 'failed', 'cancelled']) }
    case 'execution.settle':
      fields(value, ['type', 'attemptId', 'outcome', 'reason'])
      return { type: value.type, attemptId: text(value.attemptId), outcome: choice(value.outcome, ['succeeded', 'paused', 'blocked', 'failed', 'cancelled']), reason: nullableText(value.reason) }
    case 'artifact.create':
      fields(value, ['type', 'id', 'taskId', 'attemptId', 'kind', 'uri'], ['source', 'commit', 'checks'])
      return { type: value.type, id: text(value.id), taskId: text(value.taskId), attemptId: nullableText(value.attemptId), kind: choice(value.kind, ['patch', 'commit', 'note', 'test_result', 'build', 'summary']), uri: text(value.uri), source: parseOptionalSource(value.source), commit: parseOptionalCommit(value.commit), checks: parseOptionalChecks(value.checks) }
    case 'artifact.sync':
      fields(value, ['type', 'artifactId'], ['source', 'commit', 'checks', 'uri'])
      if (value.source === undefined && value.commit === undefined && value.checks === undefined && value.uri === undefined) throw new TaskDomainError('Artifact sync requires metadata')
      return { type: value.type, artifactId: text(value.artifactId), source: parseOptionalSource(value.source), commit: parseOptionalCommit(value.commit), checks: parseOptionalChecks(value.checks), uri: optionalText(value.uri) }
    case 'artifact.transition':
      fields(value, ['type', 'artifactId', 'status'])
      return { type: value.type, artifactId: text(value.artifactId), status: choice(value.status, ['draft', 'ready', 'accepted', 'superseded']) }
    case 'integration.create': {
      fields(value, ['type', 'id', 'taskId', 'artifactId', 'provider', 'url'], ['providerRef', 'repository', 'ref', 'targetRef', 'headSha'])
      const url = text(value.url)
      const parsed = URL.parse(url)
      if (parsed === null) throw new TaskDomainError('Expected a valid integration URL')
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new TaskDomainError('Expected an HTTPS integration URL without credentials')
      return { type: value.type, id: text(value.id), taskId: text(value.taskId), artifactId: nullableText(value.artifactId), provider: choice(value.provider, ['github', 'gitlab']), url, providerRef: optionalText(value.providerRef), repository: optionalText(value.repository), ref: optionalText(value.ref), targetRef: optionalText(value.targetRef), headSha: optionalText(value.headSha) }
    }
    case 'integration.sync': {
      fields(value, ['type', 'integrationId', 'syncStatus'], ['status', 'headSha', 'checks', 'review', 'syncError', 'lastSyncedAt', 'mergedAt', 'closedAt'])
      const lastSyncedAt = nullableOptionalText(value.lastSyncedAt) ?? null
      if (lastSyncedAt !== null && (!Number.isFinite(Date.parse(lastSyncedAt)) || new Date(lastSyncedAt).toISOString() !== lastSyncedAt)) throw new TaskDomainError('Expected an ISO integration timestamp')
      const mergedAt = nullableOptionalText(value.mergedAt)
      const closedAt = nullableOptionalText(value.closedAt)
      for (const date of [mergedAt, closedAt]) if (date !== undefined && date !== null && (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString() !== date)) throw new TaskDomainError('Expected an ISO integration timestamp')
      return { type: value.type, integrationId: text(value.integrationId), status: value.status === undefined ? undefined : choice(value.status, ['draft', 'open', 'checks_failed', 'reviewable', 'changes_requested', 'approved', 'merged', 'closed', 'unknown'] satisfies readonly IntegrationStatus[]), headSha: optionalText(value.headSha), checks: parseOptionalChecks(value.checks), review: value.review === undefined ? undefined : parseReview(value.review), syncStatus: choice(value.syncStatus, ['fresh', 'uncertain']), syncError: nullableOptionalText(value.syncError) ?? null, lastSyncedAt, mergedAt, closedAt }
    }
    case 'integration.transition':
      fields(value, ['type', 'integrationId', 'status'])
      return { type: value.type, integrationId: text(value.integrationId), status: choice(value.status, ['draft', 'open', 'merged', 'closed']) }
    case 'lease.reserve':
      fields(value, ['type', 'id', 'taskId', 'path', 'kind'])
      return { type: value.type, id: text(value.id), taskId: text(value.taskId), path: text(value.path), kind: choice(value.kind, ['existing', 'worktree']) }
    case 'lease.activate':
    case 'lease.release':
      fields(value, ['type', 'leaseId'])
      return { type: value.type, leaseId: text(value.leaseId) }
    default:
      throw new TaskDomainError('Unknown command type')
  }
}

function parseRegistration(input: unknown): TaskRegistration {
  const value = record(input)
  fields(value, ['id', 'parentId', 'title', 'goal', 'scope', 'acceptance', 'dependencyIds', 'workingDirectory', 'executionBoundary', 'sessionId'])
  return { id: text(value.id), parentId: nullableText(value.parentId), title: text(value.title), goal: text(value.goal), scope: textList(value.scope), acceptance: textList(value.acceptance), dependencyIds: textList(value.dependencyIds), workingDirectory: nullableText(value.workingDirectory), executionBoundary: nullableText(value.executionBoundary), sessionId: text(value.sessionId) }
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TaskDomainError('Expected an event array')
  return value
}

export function parseEvent(input: unknown): TaskEvent {
  const value = record(input)
  fields(value, ['sequence', 'occurredAt', 'command'])
  if (typeof value.sequence !== 'number' || !Number.isSafeInteger(value.sequence) || value.sequence < 1) {
    throw new TaskDomainError('Expected a positive safe event sequence')
  }
  const occurredAt = text(value.occurredAt)
  const time = Date.parse(occurredAt)
  if (!Number.isFinite(time) || new Date(time).toISOString() !== occurredAt) throw new TaskDomainError('Expected an ISO event timestamp')
  return { sequence: value.sequence, occurredAt, command: parseCommand(value.command) }
}

export function parseTaskLog(input: unknown): TaskLog {
  const value = record(input)
  fields(value, ['version', 'events'])
  if (value.version !== 1) throw new TaskDomainError('Unsupported task log version')
  return { version: 1, events: list(value.events).map(parseEvent) }
}
