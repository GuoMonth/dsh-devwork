import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { lstat, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import { shellQuote } from './bash.js'
import type { TaskHandoff, TaskWorktree, WorktreeReceipt } from './types.js'

const run = promisify(execFile)
type Mutate = (command: string) => Promise<void>
interface Owned { lease: TaskWorktree; common: string; handoff?: TaskHandoff }

/** Read-only Git facts. Mutations are supplied by the official tool pipeline. */
async function git(cwd: string, signal: AbortSignal, ...args: string[]): Promise<string> {
  const result = await run('git', args, { cwd, signal, timeout: 10_000, maxBuffer: 1024 * 1024,
    env: { ...scrubbedParentEnv(), GIT_CONFIG_COUNT: '0', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' } })
  return result.stdout
}
async function head(cwd: string, signal: AbortSignal): Promise<string> {
  const value = (await git(cwd, signal, 'rev-parse', '--verify', 'HEAD^{commit}')).trim()
  if (!/^[a-f0-9]{40,64}$/.test(value)) throw new Error('Invalid Git commit identity')
  return value
}
async function common(cwd: string, signal: AbortSignal): Promise<string> {
  return realpath((await git(cwd, signal, 'rev-parse', '--path-format=absolute', '--git-common-dir')).trim())
}
async function clean(cwd: string, signal: AbortSignal): Promise<void> {
  if ((await git(cwd, signal, 'status', '--porcelain=v1', '--untracked-files=all', '-z')).length) throw new Error('Worktree has uncommitted or untracked files; keep it for the Leader')
}

/** Small task-scoped lease; no worker engine, branch archive or forced deletion. */
export class TaskWorktrees {
  private readonly owned = new Map<string, Owned>()
  private readonly busy = new Set<string>()
  list(): TaskWorktree[] { return [...this.owned.values()].map(entry => structuredClone(entry.lease)) }
  private entry(id: string): Owned {
    const entry = this.owned.get(id)
    if (entry === undefined) throw new Error('Unknown or already cleaned Devwork worktree')
    return entry
  }
  private async exclusive<T>(id: string, operation: () => Promise<T>): Promise<T> {
    if (this.busy.has(id)) throw new Error('Worktree operation already running')
    this.busy.add(id)
    try { return await operation() } finally { this.busy.delete(id) }
  }
  private async validate(cwd: string, entry: Owned, signal: AbortSignal): Promise<void> {
    const stat = await lstat(entry.lease.path)
    if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(entry.lease.path) !== entry.lease.path) throw new Error('Owned worktree path changed')
    if (await common(cwd, signal) !== entry.common || await common(entry.lease.path, signal) !== entry.common) throw new Error('Worktree repository identity changed')
    // A linked checkout has a .git file, never the main checkout's directory.
    if (!(await lstat(join(entry.lease.path, '.git'))).isFile()) throw new Error('Refuse to remove a primary checkout')
  }
  async create(cwd: string, roundId: string, taskId: string, signal: AbortSignal, mutate: Mutate): Promise<TaskWorktree> {
    return this.exclusive(taskId, async () => {
      if (this.list().some(lease => lease.taskId === taskId)) throw new Error('Task already owns a worktree')
      if (await realpath(cwd) !== await realpath((await git(cwd, signal, 'rev-parse', '--show-toplevel')).trim())) throw new Error('Worktree owner must use the Git root')
      const id = randomUUID()
      const lease: TaskWorktree = { id, roundId, taskId, path: join(await realpath(tmpdir()), `dsh-devwork-${id}`), baseCommit: await head(cwd, signal) }
      const entry: Owned = { lease, common: await common(cwd, signal) }
      // Register before starting: failed/canceled creation must not hide a path.
      this.owned.set(id, entry)
      try {
        await mutate(`git worktree add --detach -- ${shellQuote(lease.path)} ${shellQuote(lease.baseCommit)}`)
        await this.validate(cwd, entry, signal)
        return structuredClone(lease)
      } catch (error) {
        const absent = await lstat(lease.path).then(() => false, (failure: unknown) => {
          if (failure instanceof Error && 'code' in failure && failure.code === 'ENOENT') return true
          throw failure
        })
        if (absent) this.owned.delete(id)
        throw error
      }
    })
  }
  async handoff(cwd: string, id: string, summary: string, checks: readonly string[], signal: AbortSignal): Promise<TaskHandoff> {
    return this.exclusive(id, async () => {
      if (!summary.trim() || summary.length > 8000) throw new Error('Provide a concise Leader summary')
      const entry = this.entry(id)
      await this.validate(cwd, entry, signal)
      await clean(entry.lease.path, signal)
      const sourceCommit = await head(entry.lease.path, signal)
      const summaryPath = `docs/devwork/${entry.lease.roundId}-${entry.lease.id}.md`
      const commitTrailers = `Devwork-Round: ${entry.lease.roundId}\nDevwork-Task: ${entry.lease.taskId}\nDevwork-Source: ${sourceCommit}`
      const markdown = `# Devwork task delivery\n\n${summary.trim()}\n\n## Git provenance\n\n${commitTrailers}\n\nBase: ${entry.lease.baseCommit}\n\n## Declared checks\n\n${checks.map(command => `- ${JSON.stringify(command)}`).join('\n')}\n\nThe declared commands are not proof of execution; inspect the Leader verification evidence.\n`
      const handoff = { worktreeId: id, sourceCommit, summaryPath, markdown, commitTrailers }
      entry.handoff = handoff
      return structuredClone(handoff)
    })
  }
  async cleanup(cwd: string, id: string, signal: AbortSignal, mutate: Mutate): Promise<WorktreeReceipt> {
    return this.exclusive(id, async () => {
      const entry = this.entry(id)
      const handoff = entry.handoff
      if (handoff === undefined) throw new Error('Prepare a Leader handoff before cleanup')
      await this.validate(cwd, entry, signal)
      await clean(entry.lease.path, signal)
      if (await head(entry.lease.path, signal) !== handoff.sourceCommit) throw new Error('Worktree changed after handoff; refresh the summary')
      const integratedCommit = await head(cwd, signal)
      try { await git(cwd, signal, 'merge-base', '--is-ancestor', handoff.sourceCommit, integratedCommit) }
      catch { signal.throwIfAborted(); throw new Error('Source commits are not integrated into the Leader checkout; keep the worktree') }
      const stored = await git(cwd, signal, 'show', `${integratedCommit}:${handoff.summaryPath}`).catch(() => undefined)
      const file = await git(cwd, signal, 'ls-tree', integratedCommit, '--', handoff.summaryPath)
      if (!file.startsWith('100644 blob ') || stored !== handoff.markdown) throw new Error('Commit the exact Leader summary as a regular document in the target checkout before cleanup')
      const receipt: WorktreeReceipt = { worktreeId: id, taskId: entry.lease.taskId, sourceCommit: handoff.sourceCommit, integratedCommit, summaryPath: handoff.summaryPath }
      // Recheck identities at the mutation boundary. Git refuses dirty removal.
      await mutate(`test "$(git -C ${shellQuote(entry.lease.path)} rev-parse HEAD)" = ${shellQuote(handoff.sourceCommit)} && test "$(git rev-parse HEAD)" = ${shellQuote(integratedCommit)} && git worktree remove -- ${shellQuote(entry.lease.path)}`)
      this.owned.delete(id)
      return receipt
    })
  }
}
