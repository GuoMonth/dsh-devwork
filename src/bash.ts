import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'

/** Preserve the caller's official tool identity, policy and cancellation. */
export async function settledBash(ctx: Context, agent: Agent, exec: ToolRunContext, command: string, cwd: string, signal: AbortSignal): Promise<void> {
  const result = await ctx.tools.execute({ callId: ToolCallId(`devwork-git-${randomUUID()}`), rootCallId: exec.rootCallId, parent: exec.token, agent, name: 'bash', signal,
    arguments: { command, description: 'Manage the explicitly requested Devwork task worktree', workdir: cwd, timeoutMs: 30_000 } })
  for (const context of result.additionalContexts ?? []) exec.deferContext(context)
  const value = result.value
  if (result.isError || typeof value !== 'object' || value === null || Array.isArray(value) || value.kind !== 'foreground'
    || value.exitCode !== 0 || value.aborted !== false || value.timedOut !== false || value.signal !== null) throw new Error('Official worktree command denied, canceled or failed; inspect the nested Bash result')
}

/** One POSIX-shell argument; paths and summaries never become shell syntax. */
export function shellQuote(value: string): string { return "'" + value.replaceAll("'", "'\\''") + "'" }
