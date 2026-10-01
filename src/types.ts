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
  goal: string
  stage: 'working' | 'needs-attention' | 'ready-for-review'
  completed: number
  total: number
  checks: CheckEvidence[]
  attention: string[]
}
export interface ReviewSnapshot {
  roundId: string
  /** Sequence of the official workspace/changes event. */
  seq: number
  fingerprint: string
  files: string[]
}
/** POC anchors use the new side of one text hunk, with 1-based lines. */
export interface ReviewComment {
  readonly file: string
  readonly startLine: number
  readonly endLine: number
  readonly text: string
}
export interface FeedbackBatch {
  id: string
  roundId: string
  seq: number
  fingerprint: string
  prompt: string
}
