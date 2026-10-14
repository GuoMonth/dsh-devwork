import { TaskDomainError } from './types.js'
import type { ArtifactStatus, AttemptStatus, IntegrationStatus, SessionStatus, TaskStatus } from './types.js'

export const taskTransitions: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  pending: ['active', 'paused', 'blocked', 'failed', 'cancelled'],
  active: ['paused', 'blocked', 'failed', 'review', 'cancelled'],
  paused: ['active', 'blocked', 'failed', 'cancelled'],
  blocked: ['active', 'paused', 'failed', 'cancelled'],
  failed: ['active', 'paused', 'blocked', 'cancelled'],
  review: ['active', 'blocked', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export const sessionTransitions: Readonly<Record<SessionStatus, readonly SessionStatus[]>> = {
  idle: ['running'],
  running: ['waiting', 'paused', 'succeeded', 'failed', 'cancelled'],
  waiting: ['running', 'paused', 'succeeded', 'failed', 'cancelled'],
  paused: ['running', 'waiting', 'succeeded', 'failed', 'cancelled'],
  succeeded: ['running'],
  failed: ['running'],
  cancelled: ['running'],
}

export const attemptTransitions: Readonly<Record<AttemptStatus, readonly AttemptStatus[]>> = {
  running: ['waiting', 'paused', 'succeeded', 'failed', 'cancelled'],
  waiting: ['running', 'paused', 'succeeded', 'failed', 'cancelled'],
  paused: ['running', 'waiting', 'succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: [],
}

export const artifactTransitions: Readonly<Record<ArtifactStatus, readonly ArtifactStatus[]>> = {
  draft: ['ready', 'superseded'],
  ready: ['draft', 'accepted', 'superseded'],
  accepted: ['superseded'],
  superseded: [],
}

export const integrationTransitions: Readonly<Record<IntegrationStatus, readonly IntegrationStatus[]>> = {
  draft: ['draft', 'open', 'checks_failed', 'reviewable', 'changes_requested', 'approved', 'closed'],
  open: ['draft', 'open', 'checks_failed', 'reviewable', 'changes_requested', 'approved', 'merged', 'closed', 'unknown'],
  checks_failed: ['open', 'checks_failed', 'reviewable', 'changes_requested', 'approved', 'merged', 'closed', 'unknown'],
  reviewable: ['open', 'checks_failed', 'reviewable', 'changes_requested', 'approved', 'merged', 'closed', 'unknown'],
  changes_requested: ['open', 'checks_failed', 'reviewable', 'changes_requested', 'approved', 'merged', 'closed', 'unknown'],
  approved: ['open', 'checks_failed', 'reviewable', 'changes_requested', 'approved', 'merged', 'closed', 'unknown'],
  merged: [],
  closed: ['open', 'closed', 'unknown'],
  unknown: ['draft', 'open', 'checks_failed', 'reviewable', 'changes_requested', 'approved', 'merged', 'closed', 'unknown'],
}

export function requireTransition<T extends string>(table: Readonly<Record<T, readonly T[]>>, from: T, to: T): void {
  if (!table[from].includes(to)) throw new TaskDomainError(`Illegal transition: ${from} -> ${to}`)
}
