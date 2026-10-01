import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import TeamService from '@deepseek-ai/dsh-experimental-agent-team'
import type { TeamTaskId } from '@deepseek-ai/dsh-experimental-agent-team'
import * as TeamTools from '@deepseek-ai/dsh-experimental-tool-agent-team'
import { createUserMessage, LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionQuery from '@deepseek-ai/dsh-session-query-sqlite'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import LocalSubprocess from '@deepseek-ai/dsh-subprocess-local'
import LocalBash from '@deepseek-ai/dsh-bash-local'
import * as ShellEnv from '@deepseek-ai/dsh-shell-env'
import * as BashTool from '@deepseek-ai/dsh-tool-bash'
import * as WorkspaceChanges from '@deepseek-ai/dsh-workspace-changes'
import * as Plugin from '../lib/index.js'

export const SIGNAL = new AbortController().signal
export const CHECK = 'node check.ts'
export const INITIAL = 'export function add(a: number, b: number): number { return a - b }\n'
export const FIXED = 'export function add(a: number, b: number): number { return a + b }\n'
export const REVISED = '// Reviewed: preserve zero and negative inputs.\n' + FIXED

/** Independent deterministic model fixture; all domain services remain real. */
export class ScriptedModel extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  private readonly scripts = new Map<string, StreamChunk[][]>()
  script(agent: Pick<Agent, 'id'>, entries: StreamChunk[][]): void { this.scripts.set(agent.id, [...entries]) }
  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model })
  }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    options.signal?.throwIfAborted()
    const chunks = this.scripts.get(options.sessionId ?? '')?.shift() ?? text('Ready for a task contract.')
    for (const chunk of chunks) { options.signal?.throwIfAborted(); yield chunk }
  }
}
export function text(value: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: value },
    { type: 'block-end', index: 0, block: { type: 'text', text: value } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}
let call = 0
export function tool(name: string, args: object): StreamChunk[] {
  const id = ToolCallId(`poc-model-${++call}`)
  const json = JSON.stringify(args)
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: json },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: json } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}
export function prompt(agent: Agent, value: string): void {
  agent.followup(createUserMessage({ content: [{ type: 'text', text: value }], source: { kind: 'user' } }))
}
export function quote(value: string): string { return "'" + value.replaceAll("'", "'\\''") + "'" }
export function writeCommand(content: string): string {
  return `node -e ${quote(`require('node:fs').writeFileSync('math.ts', ${JSON.stringify(content)})`)}`
}
export async function until(predicate: () => boolean, message: string): Promise<void> {
  const end = Date.now() + 10_000
  while (!predicate()) {
    if (Date.now() > end) throw new Error(message)
    await setTimeout(20)
  }
}
export async function boot(options: { plugin?: boolean; changes?: boolean } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'devwork-headless-'))
  const ctx = new Context()
  try {
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Devwork POC', '-c', 'user.email=poc@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' })
    git('init', '-q', '-b', 'main')
    await writeFile(join(cwd, 'math.ts'), INITIAL)
    await writeFile(join(cwd, 'check.ts'), "import assert from 'node:assert/strict'\nimport { add } from './math.ts'\nassert.equal(add(2, 3), 5)\nassert.equal(add(-2, 2), 0)\nconsole.log('acceptance passed')\n")
    await writeFile(join(cwd, 'README.md'), 'User-owned notes.\n')
    await writeFile(join(cwd, '.gitignore'), '.sessions/\n')
    git('add', '-A'); git('commit', '-q', '-m', 'fixture baseline')
    // This dirty content must not be attributed to the Agent round.
    await writeFile(join(cwd, 'README.md'), 'Existing user edit; preserve me.\n')
    await mountAgentLoopTestDependencies(ctx, { tools: { mode: 'native' } })
    await ctx.plugin(JsonlSessionPersistence, { root: join(cwd, '.sessions') })
    await ctx.plugin(SessionQuery, { path: ':memory:', openAt: 'never' })
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(Subagents)
    await ctx.plugin(Spawn, { providerName: 'spawn' })
    const teamFiber = await ctx.plugin(TeamService)
    await ctx.plugin(TeamTools)
    await ctx.plugin(LocalSubprocess)
    await ctx.plugin(LocalBash, { cwd, timeoutMs: 10_000, maxTimeoutMs: 30_000, maxOutputBytes: 64 * 1024, maxSpillBytes: 64 * 1024, graceMs: 100 })
    await ctx.plugin(ShellEnv, { dshHome: join(cwd, '.sessions') })
    await ctx.plugin(BashTool, { enableRunInBackground: false, promoteOnTimeout: false })
    const changesFiber = options.changes === false ? undefined : await ctx.plugin(WorkspaceChanges)
    const pluginFiber = options.plugin === false ? undefined : await ctx.plugin(Plugin)
    const model = new ScriptedModel()
    ctx.llm.registerAdapter(['poc'], model)
    const lead = await ctx.agentLoop.create(SessionId(`poc-lead-${Date.now()}`), { provider: 'poc', model: 'deterministic' }, { cwd })
    return { ctx, cwd, lead, model, teamFiber, changesFiber, pluginFiber,
      async close() { await ctx.fiber.dispose(); await rm(cwd, { recursive: true, force: true }) } }
  } catch (error) { await ctx.fiber.dispose(); await rm(cwd, { recursive: true, force: true }); throw error }
}
export async function teammate(runtime: Awaited<ReturnType<typeof boot>>, name: string) {
  const result = await runtime.ctx.agentTeams.spawnTeammate(runtime.lead, { name, description: name === 'writer' ? 'Write math.ts only' : 'Read-only code review', prompt: [{ type: 'text', text: `You are ${name}. Wait for the explicit task contract.` }], context: 'fresh', provider: 'spawn', signal: SIGNAL })
  await until(() => runtime.ctx.agentTeams.listMembers(runtime.lead).some(member => member.id === result.member.id && member.status === 'inactive'), 'Teammate did not settle')
  // Initial teammate reports can wake the Leader; settle that bootstrap turn
  // before a test replaces its model script or starts a development turn.
  await runtime.lead.whenIdle()
  return result.member
}
export async function task(runtime: Awaited<ReturnType<typeof boot>>, subject = 'Fix addition') {
  return runtime.ctx.agentTeams.createTask(runtime.lead, { subject, description: 'Change math.ts only; pass node check.ts; report evidence to Leader.', writeScopes: ['math.ts'] })
}
export async function complete(runtime: Awaited<ReturnType<typeof boot>>, id: TeamTaskId) {
  const claimed = await runtime.ctx.agentTeams.updateTask(runtime.lead, { taskId: id, expectedRevision: runtime.ctx.agentTeams.getTask(runtime.lead, id).revision, action: 'claim' })
  return runtime.ctx.agentTeams.updateTask(runtime.lead, { taskId: id, expectedRevision: claimed.revision, action: 'complete' })
}
