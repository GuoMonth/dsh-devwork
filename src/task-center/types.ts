export type TaskStatus = 'pending' | 'active' | 'paused' | 'blocked' | 'failed' | 'review' | 'completed' | 'cancelled'
export type AttemptStatus = 'running' | 'waiting' | 'paused' | 'succeeded' | 'failed' | 'cancelled'
export type SessionStatus = 'idle' | AttemptStatus
export type ArtifactStatus = 'draft' | 'ready' | 'accepted' | 'superseded'
/** The integration status is the last known remote state. Sync uncertainty is
 * kept separately on IntegrationRef so a transport error never erases truth. */
export type IntegrationStatus = 'draft' | 'open' | 'checks_failed' | 'reviewable' | 'changes_requested' | 'approved' | 'merged' | 'closed' | 'unknown'
export type IntegrationSyncStatus = 'fresh' | 'uncertain'
export type DeliveryCheckStatus = 'pending' | 'passing' | 'failing' | 'unknown'
export type DeliveryReviewStatus = 'pending' | 'approved' | 'changes_requested' | 'unknown'
export type LeaseStatus = 'reserved' | 'active' | 'released'
export type ArtifactKind = 'patch' | 'commit' | 'note' | 'test_result' | 'build' | 'summary'
export type IntegrationProvider = 'github' | 'gitlab'
export type WorkspaceKind = 'existing' | 'worktree'

export interface ArtifactSource {
  readonly sessionId: string | null
  readonly attemptId: string | null
}

export interface ArtifactCommit {
  readonly sha: string | null
  readonly branch: string | null
}

export interface DeliveryChecks {
  readonly status: DeliveryCheckStatus
  readonly summary: string | null
  readonly updatedAt: string | null
}

export interface Task {
  readonly id: string
  readonly parentId: string | null
  readonly title: string
  readonly goal: string
  readonly scope: readonly string[]
  readonly acceptance: readonly string[]
  readonly dependencyIds: readonly string[]
  /** The execution boundary is descriptive metadata; the engine never changes a Session cwd. */
  readonly workingDirectory?: string | null
  readonly executionBoundary?: string | null
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
  /** Durable provenance retained after a workspace lease is released. */
  readonly source: ArtifactSource
  readonly commit: ArtifactCommit
  readonly checks: DeliveryChecks
  readonly metadataVersion: 1
}

export interface IntegrationRef {
  readonly id: string
  readonly taskId: string
  readonly artifactId: string | null
  readonly provider: IntegrationProvider
  readonly url: string
  readonly status: IntegrationStatus
  /** Provider-native number/IID, persisted independently of the URL. */
  readonly providerRef: string
  readonly repository: string
  readonly ref: string
  readonly targetRef: string
  readonly headSha: string
  readonly checks: DeliveryChecks
  readonly review: { readonly status: DeliveryReviewStatus; readonly summary: string | null; readonly updatedAt: string | null }
  readonly syncStatus: IntegrationSyncStatus
  readonly syncError: string | null
  readonly lastSyncedAt: string | null
  readonly mergedAt: string | null
  readonly closedAt: string | null
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

export interface TaskRegistration {
  readonly id: string
  readonly parentId: string | null
  readonly title: string
  readonly goal: string
  readonly scope: readonly string[]
  readonly acceptance: readonly string[]
  readonly dependencyIds: readonly string[]
  readonly workingDirectory: string | null
  readonly executionBoundary: string | null
  readonly sessionId: string
}

export type ExecutionOutcome = 'succeeded' | 'paused' | 'blocked' | 'failed' | 'cancelled'

export type TaskCommand =
  | { readonly type: 'task.create'; readonly id: string; readonly parentId: string | null; readonly title: string; readonly goal: string; readonly scope: readonly string[]; readonly acceptance: readonly string[]; readonly dependencyIds: readonly string[]; readonly workingDirectory?: string | null; readonly executionBoundary?: string | null }
  | { readonly type: 'task.intake'; readonly tasks: readonly TaskRegistration[] }
  | { readonly type: 'task.reparent'; readonly taskId: string; readonly parentId: string | null }
  | { readonly type: 'task.transition'; readonly taskId: string; readonly status: Exclude<TaskStatus, 'blocked' | 'paused' | 'failed'> }
  | { readonly type: 'task.continue'; readonly taskId: string }
  | { readonly type: 'task.pause'; readonly taskId: string }
  | { readonly type: 'task.block'; readonly taskId: string; readonly reason: string }
  | { readonly type: 'task.fail'; readonly taskId: string; readonly reason: string }
  | { readonly type: 'task.cancel'; readonly taskId: string }
  | { readonly type: 'task.retry'; readonly id: string; readonly taskId: string; readonly agentId: string }
  | { readonly type: 'session.create'; readonly id: string; readonly taskId: string; readonly externalSessionId: string | null }
  | { readonly type: 'session.bind'; readonly sessionId: string; readonly externalSessionId: string }
  | { readonly type: 'attempt.start'; readonly id: string; readonly sessionId: string; readonly agentId: string }
  | { readonly type: 'attempt.transition'; readonly attemptId: string; readonly status: AttemptStatus }
  | { readonly type: 'execution.settle'; readonly attemptId: string; readonly outcome: ExecutionOutcome; readonly reason: string | null }
  | { readonly type: 'artifact.create'; readonly id: string; readonly taskId: string; readonly attemptId: string | null; readonly kind: ArtifactKind; readonly uri: string; readonly source?: ArtifactSource | undefined; readonly commit?: ArtifactCommit | undefined; readonly checks?: DeliveryChecks | undefined }
  | { readonly type: 'artifact.sync'; readonly artifactId: string; readonly source?: ArtifactSource | undefined; readonly commit?: ArtifactCommit | undefined; readonly checks?: DeliveryChecks | undefined; readonly uri?: string | undefined }
  | { readonly type: 'artifact.transition'; readonly artifactId: string; readonly status: ArtifactStatus }
  | { readonly type: 'integration.create'; readonly id: string; readonly taskId: string; readonly artifactId: string | null; readonly provider: IntegrationProvider; readonly url: string; readonly providerRef?: string | undefined; readonly repository?: string | undefined; readonly ref?: string | undefined; readonly targetRef?: string | undefined; readonly headSha?: string | undefined }
  | { readonly type: 'integration.sync'; readonly integrationId: string; readonly status?: IntegrationStatus | undefined; readonly headSha?: string | undefined; readonly checks?: DeliveryChecks | undefined; readonly review?: { readonly status: DeliveryReviewStatus; readonly summary: string | null; readonly updatedAt: string | null } | undefined; readonly syncStatus: IntegrationSyncStatus; readonly syncError?: string | null | undefined; readonly lastSyncedAt?: string | null | undefined; readonly mergedAt?: string | null | undefined; readonly closedAt?: string | null | undefined }
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
