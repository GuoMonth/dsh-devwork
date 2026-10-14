export type TaskStatus = 'pending' | 'active' | 'blocked' | 'review' | 'completed' | 'cancelled'
export type AttemptStatus = 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled'
export type SessionStatus = 'idle' | AttemptStatus
export type ArtifactStatus = 'draft' | 'ready' | 'accepted' | 'superseded'
export type IntegrationStatus = 'draft' | 'open' | 'merged' | 'closed'
export type LeaseStatus = 'reserved' | 'active' | 'released'
export type ArtifactKind = 'patch' | 'commit' | 'note' | 'test_result'
export type IntegrationProvider = 'github' | 'gitlab'
export type WorkspaceKind = 'existing' | 'worktree'

export interface Task {
  readonly id: string
  readonly parentId: string | null
  readonly title: string
  readonly goal: string
  readonly scope: readonly string[]
  readonly acceptance: readonly string[]
  readonly dependencyIds: readonly string[]
  readonly status: TaskStatus
  readonly blockedReason: string | null
}

// A task has exactly one primary Session. Attempts are the retry/continuation records.
export interface TaskSession {
  readonly id: string
  readonly taskId: string
  readonly externalSessionId: string | null
  readonly status: SessionStatus
}

export interface AgentAttempt {
  readonly id: string
  readonly sessionId: string
  readonly agentId: string
  readonly number: number
  readonly status: AttemptStatus
}

export interface TaskArtifact {
  readonly id: string
  readonly taskId: string
  readonly attemptId: string | null
  readonly kind: ArtifactKind
  readonly uri: string
  readonly status: ArtifactStatus
}

export interface IntegrationRef {
  readonly id: string
  readonly taskId: string
  readonly artifactId: string | null
  readonly provider: IntegrationProvider
  readonly url: string
  readonly status: IntegrationStatus
}

// Reservation is persisted before a host starts creating a worktree.
// This record alone never creates, deletes or proves ownership of a checkout.
export interface WorkspaceLease {
  readonly id: string
  readonly taskId: string
  readonly path: string
  readonly kind: WorkspaceKind
  readonly status: LeaseStatus
}

export interface TaskProjection {
  readonly revision: number
  readonly tasks: readonly Task[]
  readonly sessions: readonly TaskSession[]
  readonly attempts: readonly AgentAttempt[]
  readonly artifacts: readonly TaskArtifact[]
  readonly integrations: readonly IntegrationRef[]
  readonly leases: readonly WorkspaceLease[]
}

export type TaskCommand =
  | { readonly type: 'task.create'; readonly id: string; readonly parentId: string | null; readonly title: string; readonly goal: string; readonly scope: readonly string[]; readonly acceptance: readonly string[]; readonly dependencyIds: readonly string[] }
  | { readonly type: 'task.reparent'; readonly taskId: string; readonly parentId: string | null }
  | { readonly type: 'task.transition'; readonly taskId: string; readonly status: Exclude<TaskStatus, 'blocked'> }
  | { readonly type: 'task.block'; readonly taskId: string; readonly reason: string }
  | { readonly type: 'session.create'; readonly id: string; readonly taskId: string; readonly externalSessionId: string | null }
  | { readonly type: 'attempt.start'; readonly id: string; readonly sessionId: string; readonly agentId: string }
  | { readonly type: 'attempt.transition'; readonly attemptId: string; readonly status: AttemptStatus }
  | { readonly type: 'artifact.create'; readonly id: string; readonly taskId: string; readonly attemptId: string | null; readonly kind: ArtifactKind; readonly uri: string }
  | { readonly type: 'artifact.transition'; readonly artifactId: string; readonly status: ArtifactStatus }
  | { readonly type: 'integration.create'; readonly id: string; readonly taskId: string; readonly artifactId: string | null; readonly provider: IntegrationProvider; readonly url: string }
  | { readonly type: 'integration.transition'; readonly integrationId: string; readonly status: IntegrationStatus }
  | { readonly type: 'lease.reserve'; readonly id: string; readonly taskId: string; readonly path: string; readonly kind: WorkspaceKind }
  | { readonly type: 'lease.activate'; readonly leaseId: string }
  | { readonly type: 'lease.release'; readonly leaseId: string }

export interface TaskEvent {
  readonly sequence: number
  readonly occurredAt: string
  readonly command: TaskCommand
}

export interface TaskLog {
  readonly version: 1
  readonly events: readonly TaskEvent[]
}

export class TaskDomainError extends Error {
  override readonly name = 'TaskDomainError'
}
