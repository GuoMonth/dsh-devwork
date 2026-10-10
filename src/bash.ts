import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ToolExecutionResult, ToolRunContext } from '@deepseek-ai/dsh-tools'

/** A call-scoped denial after official asynchronous permission/pre-execute policy. */
export async function guardedBash(ctx: Context, agent: Agent, exec: ToolRunContext, command: string, cwd: string, signal: AbortSignal, guard: () => void, description: string): Promise<ToolExecutionResult> {
  const callId = ToolCallId(`devwork-bash-${randomUUID()}`)
  const dispose = agent.ctx.tools.guard(call => {
    if (call.callId !== callId) return undefined
    try { guard(); return undefined }
    catch (error) { return error instanceof Error ? error.message : 'Devwork directory guard failed' }
  })
  try {
    guard()
    return await ctx.tools.execute({ callId, rootCallId: exec.rootCallId, parent: exec.token, agent, name: 'bash', signal,
      arguments: { command, description, workdir: cwd, timeoutMs: 30_000 } })
  } finally { dispose() }
}

/** Preserve the caller's official tool identity, policy and cancellation. */
export async function settledBash(ctx: Context, agent: Agent, exec: ToolRunContext, command: string, cwd: string, signal: AbortSignal, guard: () => void): Promise<void> {
  const result = await guardedBash(ctx, agent, exec, command, cwd, signal, guard, 'Manage the explicitly requested Devwork task worktree')
  for (const context of result.additionalContexts ?? []) exec.deferContext(context)
  const value = result.value
  if (result.isError || typeof value !== 'object' || value === null || Array.isArray(value) || value.kind !== 'foreground'
    || value.exitCode !== 0 || value.aborted !== false || value.timedOut !== false || value.signal !== null) throw new Error('Official worktree command denied, canceled or failed; inspect the nested Bash result')
}

/** One POSIX-shell argument; paths and summaries never become shell syntax. */
export function shellQuote(value: string): string { return "'" + value.replaceAll("'", "'\\''") + "'" }
