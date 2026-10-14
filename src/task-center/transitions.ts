import { TaskDomainError } from './types.js'
import type { ArtifactStatus, AttemptStatus, IntegrationStatus, SessionStatus, TaskStatus } from './types.js'

export const taskTransitions: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  pending: ['active', 'blocked', 'cancelled'],
  active: ['blocked', 'review', 'cancelled'],
  blocked: ['active', 'cancelled'],
  review: ['active', 'blocked', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export const sessionTransitions: Readonly<Record<SessionStatus, readonly SessionStatus[]>> = {
  idle: ['running'],
  running: ['waiting', 'succeeded', 'failed', 'cancelled'],
  waiting: ['running', 'succeeded', 'failed', 'cancelled'],
  succeeded: ['running'],
  failed: ['running'],
  cancelled: ['running'],
}

export const attemptTransitions: Readonly<Record<AttemptStatus, readonly AttemptStatus[]>> = {
  running: ['waiting', 'succeeded', 'failed', 'cancelled'],
  waiting: ['running', 'succeeded', 'failed', 'cancelled'],
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
  draft: ['open', 'closed'],
  open: ['draft', 'merged', 'closed'],
  merged: [],
  closed: ['open'],
}

export function requireTransition<T extends string>(table: Readonly<Record<T, readonly T[]>>, from: T, to: T): void {
  if (!table[from].includes(to)) throw new TaskDomainError(`Illegal transition: ${from} -> ${to}`)
}
