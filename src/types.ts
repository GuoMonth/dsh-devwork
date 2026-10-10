import type { TeamTaskId } from '@deepseek-ai/dsh-experimental-agent-team'

export interface DevelopmentContract {
  readonly goal: string
  /** References into the official task board; no mirrored task state. */
  readonly taskIds: readonly TeamTaskId[]
  /** Local acceptance commands, executed through DSH's bash tool. */
  readonly checks: readonly string[]
}
export interface CheckEvidence {
  command: string
  status: 'not-run' | 'passed' | 'failed' | 'stale'
  detail: string
}
export interface DevelopmentBrief {
  roundId: string
  /** Fixed Leader integration directory for this round. */
  integrationRoot: string
  goal: string
  stage: 'working' | 'needs-attention' | 'ready-for-review'
  completed: number
  total: number
  checks: CheckEvidence[]
  attention: string[]
  /** Temporary task checkouts still awaiting a committed handoff/cleanup. */
  cleanupPending: string[]
}
export interface ReviewSnapshot {
  roundId: string
  /** Fixed Leader integration directory for this round. */
  integrationRoot: string
  /** Unique owned cumulative review identity. */
  id: string
  /** Supplemental latest official event, or zero when none exists; not coverage evidence. */
  seq: number
  scope: 'round-start-to-current'
  coverage: 'tracked-and-unignored-content'
  baselineFingerprint: string
  fingerprint: string
  files: string[]
}
export interface LineReviewComment {
  readonly kind?: 'line'
  readonly file: string
  readonly startLine: number
  readonly endLine: number
  readonly text: string
}
export interface FileReviewComment {
  readonly kind: 'file'
  readonly file: string
  readonly text: string
}
/** Line anchors use the current side of the coarse cumulative comparison, with 1-based lines. */
export type ReviewComment = LineReviewComment | FileReviewComment
export type ReviewSide = { kind: 'absent' } | { kind: 'file'; mode: number; bytes: number } | { kind: 'symlink'; target: string }
export type ReviewFileDiff = { path: string; before: ReviewSide; after: ReviewSide } & (
  { kind: 'text'; coarse: true; oldText: string; newText: string } | { kind: 'metadata' }
)
export interface FeedbackBatch {
  reviewId: string
  id: string
  roundId: string
  /** Fixed Leader integration directory for this round. */
  integrationRoot: string
  seq: number
  fingerprint: string
  prompt: string
}
export interface TaskWorktree {
  id: string
  roundId: string
  taskId: string
  path: string
  baseCommit: string
}
export interface TaskHandoff {
  worktreeId: string
  sourceCommit: string
  summaryPath: string
  markdown: string
  commitTrailers: string
}
export interface WorktreeReceipt {
  worktreeId: string
  taskId: string
  sourceCommit: string
  integratedCommit: string
  summaryPath: string
}
