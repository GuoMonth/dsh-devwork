import assert from 'node:assert/strict'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'
import type { FiberState } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as WorkspaceChanges from '@deepseek-ai/dsh-workspace-changes'
import * as Plugin from '../lib/index.js'
import { boot, CHECK, complete, FIXED, INITIAL, prompt, quote, REVISED, SIGNAL, task, teammate, text, tool, until, writeCommand } from './runtime.mts'
import { parseJson, record, string } from '../scripts/data.mts'

// Published Cordis declares a const enum; native Node stripping cannot inline it.
const PENDING: FiberState = 0
const ACTIVE: FiberState = 2

test('owned worktree: real Team edits, committed Leader handoff, verified integration and non-forced cleanup', { timeout: 60_000 }, async () => {
  const r = await boot()
  let checkout: string | undefined
  try {
    const writer = await teammate(r, 'writer')
    const writing = await task(r)
    r.ctx.devwork.open(r.lead, { goal: 'Deliver the task and remove its temporary checkout', taskIds: [writing.id], checks: [CHECK] })
    const invoke = async (name: string, args: object) => {
      await r.lead.whenIdle()
      r.model.script(r.lead, [tool(name, args), text('Leader task operation settled.')])
      prompt(r.lead, 'Use the authorized Devwork task operation.')
      await r.lead.whenIdle()
      const event = r.lead.session.snapshotEvents().filter(event => event.type === 'tool/result').at(-1)
      assert.ok(event?.type === 'tool/result')
      return event.data.message
    }
    const value = (message: Awaited<ReturnType<typeof invoke>>) => {
      assert.ok(!message.isError, JSON.stringify(message.content))
      const block = message.content.find(content => content.type === 'text')
      assert.ok(block?.type === 'text')
      return record(parseJson(block.text))
    }
    const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' })
    const commit = (message: string) => `git -c user.name='Devwork POC' -c user.email=poc@example.invalid -c commit.gpgsign=false commit -m ${quote(message)}`
    const lease = value(await invoke('devwork_worktree', { taskId: writing.id }))
    checkout = string(lease.path)
    const worktreeId = string(lease.id)
    assert.equal(string(lease.taskId), writing.id)
    assert.equal(git(checkout, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'HEAD', 'No long-lived task branch')
    assert.equal((await r.ctx.devwork.brief(r.lead, SIGNAL)).cleanupPending.length, 1)
    assert.throws(() => r.ctx.devwork.open(r.lead, { goal: 'Replace', taskIds: [writing.id], checks: [CHECK] }), /Finish the owned worktree/)
    r.model.script(writer, [
      tool('team_task_update', { task_id: writing.id, expected_revision: 1, action: 'claim' }),
      tool('bash', { command: `${writeCommand(FIXED)} && git add -- math.ts && ${commit('fix: addition')}`, workdir: checkout, description: 'Implement and commit in the explicitly assigned checkout' }),
      tool('bash', { command: CHECK, workdir: checkout, description: 'Check the isolated task result' }),
      tool('team_task_update', { task_id: writing.id, expected_revision: 2, action: 'complete' }),
      tool('send_message', { target: 'lead', message: 'Committed and checked in the assigned worktree; integrate and verify before cleanup.' }), text('Writer stopped.'),
    ])
    await r.ctx.agentTeams.sendMessage(r.lead, { target: 'writer', content: [{ type: 'text', text: `Use this explicit workdir for every command: ${checkout}` }], signal: SIGNAL })
    await until(() => r.ctx.agentTeams.listMembers(r.lead).find(member => member.name === 'writer')?.status === 'inactive', 'Isolated writer did not settle')
    await r.lead.whenIdle()
    assert.equal(r.ctx.agentTeams.getTask(r.lead, writing.id).status, 'completed')
    assert.equal(await readFile(join(r.cwd, 'math.ts'), 'utf8'), INITIAL, 'Task worktree did not change the main checkout')
    assert.equal(await readFile(join(checkout, 'math.ts'), 'utf8'), FIXED)

    await writeFile(join(checkout, 'notes.txt'), 'Uncommitted work must stay.\n')
    await assert.rejects(() => r.ctx.devwork.prepareHandoff(r.lead, worktreeId, 'Fix addition.', SIGNAL), /uncommitted or untracked/)
    await rm(join(checkout, 'notes.txt'))
    const summary = 'Correct addition; zero and negative inputs are covered. Preserve the public function signature.'
    let handoff = value(await invoke('devwork_handoff', { worktreeId, summary }))
    assert.ok(!string(handoff.markdown).includes(checkout), 'Document knowledge and Git provenance, not temporary paths')
    assert.match(string(handoff.commitTrailers), /Devwork-Source:/)

    // Passing dirty root contents is not proof that source commits were merged.
    await writeFile(join(r.cwd, 'math.ts'), FIXED)
    value(await invoke('devwork_verify', {}))
    assert.ok(!(await invoke('bash', { workdir: checkout, command: "git -c user.name='Devwork POC' -c user.email=poc@example.invalid -c commit.gpgsign=false commit --allow-empty -m 'task: extra provenance'", description: 'Exercise a source commit changing after its draft handoff' })).isError)
    const staleHandoff = await invoke('devwork_cleanup', { worktreeId })
    assert.ok(staleHandoff.isError)
    assert.match(JSON.stringify(staleHandoff.content), /changed after handoff/)
    handoff = value(await invoke('devwork_handoff', { worktreeId, summary }))
    const sourceCommit = string(handoff.sourceCommit)
    const markdown = string(handoff.markdown)
    const summaryPath = string(handoff.summaryPath)
    const notMerged = await invoke('devwork_cleanup', { worktreeId })
    assert.ok(notMerged.isError)
    assert.match(JSON.stringify(notMerged.content), /not integrated/)
    assert.ok(existsSync(checkout))
    await writeFile(join(r.cwd, 'math.ts'), INITIAL)
    assert.ok(!(await invoke('bash', { command: `git merge --ff-only ${quote(sourceCommit)}`, description: 'Integrate the authorized task source commit' })).isError)
    value(await invoke('devwork_verify', {}))
    const missingSummary = await invoke('devwork_cleanup', { worktreeId })
    assert.ok(missingSummary.isError)
    assert.match(JSON.stringify(missingSummary.content), /Commit the exact Leader summary/)
    assert.ok(existsSync(checkout))

    // Persist only the compact handoff. Main README remains user-owned/dirty.
    const writeSummary = `node -e ${quote(`const fs = require('node:fs'); fs.mkdirSync('docs/devwork', { recursive: true }); fs.writeFileSync(${JSON.stringify(summaryPath)}, ${JSON.stringify(markdown)})`)}`
    assert.ok(!(await invoke('bash', { command: `${writeSummary} && git add -- ${quote(summaryPath)} && ${commit(`docs: summarize task delivery\n\n${string(handoff.commitTrailers)}`)}`, description: 'Commit the Leader summary with source provenance' })).isError)
    value(await invoke('devwork_verify', {}))
    let denyRemoval = true
    r.ctx.on('tools/pre-execute', async (exec, next) => {
      if (denyRemoval && exec.name === 'bash') return { kind: 'deny', reason: 'POC policy denies removal' }
      return next()
    })
    const denied = await invoke('devwork_cleanup', { worktreeId })
    assert.ok(denied.isError)
    assert.ok(existsSync(checkout), 'Official denial must keep the checkout')
    denyRemoval = false
    await writeFile(join(checkout, 'math.ts'), REVISED)
    const dirty = await invoke('devwork_cleanup', { worktreeId })
    assert.ok(dirty.isError)
    assert.match(JSON.stringify(dirty.content), /uncommitted or untracked/)
    await writeFile(join(checkout, 'math.ts'), FIXED)

    r.ctx.tools.register(defineTool({
      name: 'poc_cleanup_twice', description: 'Fixture: two concurrent clicks share one trusted tool caller.', parameters: {},
      output: { schema: { type: 'string' }, render: (_args, output) => [{ type: 'text', text: output }] },
      execute: async (_args, exec) => {
        const outcomes = await Promise.allSettled([r.ctx.devwork.cleanupWorktree(r.lead, worktreeId, exec), r.ctx.devwork.cleanupWorktree(r.lead, worktreeId, exec)])
        assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1)
        const done = outcomes.find(outcome => outcome.status === 'fulfilled')
        assert.ok(done?.status === 'fulfilled')
        return JSON.stringify(done.value)
      },
    }))
    const receipt = value(await invoke('poc_cleanup_twice', {}))
    assert.equal(string(receipt.sourceCommit), sourceCommit)
    assert.equal(string(receipt.summaryPath), summaryPath)
    assert.ok(!existsSync(checkout))
    assert.equal((await r.ctx.devwork.brief(r.lead, SIGNAL)).cleanupPending.length, 0)
    assert.equal(git(r.cwd, 'worktree', 'list', '--porcelain').match(/^worktree /gm)?.length, 1)
    assert.equal(await readFile(join(r.cwd, summaryPath), 'utf8'), markdown)
    assert.match(git(r.cwd, 'log', '-1', '--format=%B'), /Devwork-Task:/)
    assert.equal(await readFile(join(r.cwd, 'README.md'), 'utf8'), 'Existing user edit; preserve me.\n')
    const duplicate = await invoke('devwork_cleanup', { worktreeId })
    assert.ok(duplicate.isError)
    assert.match(JSON.stringify(duplicate.content), /Unknown or already cleaned/)
  } finally {
    await r.close()
    // Fixture-only cleanup on assertion failure; product uses Git without force.
    if (checkout !== undefined) await rm(checkout, { recursive: true, force: true })
  }
})

test('real Team + AgentLoop + bash + diff: develop, review, batch feedback, revise', { timeout: 40_000 }, async () => {
  const r = await boot()
  try {
    const writer = await teammate(r, 'writer')
    const reviewer = await teammate(r, 'reviewer')
    const writing = await task(r)
    const reviewing = await r.ctx.agentTeams.createTask(r.lead, { subject: 'Read-only review', description: 'Read the math.ts diff and check zero/negative inputs; report to Leader.', blockedBy: [writing.id], writeScopes: [] })
    r.ctx.devwork.open(r.lead, { goal: 'Correct addition and make one reviewable result', taskIds: [writing.id, reviewing.id], checks: [CHECK] })
    assert.equal((await r.ctx.devwork.brief(r.lead, SIGNAL)).stage, 'working')
    await assert.rejects(() => r.ctx.agentTeams.updateTask(r.lead, { taskId: reviewing.id, expectedRevision: 1, action: 'claim' }))

    const script = (revision: number, content: string) => [
      tool('team_task_update', { task_id: writing.id, expected_revision: revision, action: 'claim' }),
      tool('bash', { command: writeCommand(content), description: 'Implement addition in the assigned file' }),
      tool('team_task_update', { task_id: writing.id, expected_revision: revision + 1, action: 'complete' }),
      tool('send_message', { target: 'lead', message: 'Implementation done. Review and run the declared acceptance check.' }), text('Writer finished.'),
    ]
    const reviewScript = (revision: number) => [
      tool('team_task_update', { task_id: reviewing.id, expected_revision: revision, action: 'claim' }),
      tool('bash', { command: CHECK, description: 'Review zero and negative addition cases' }),
      tool('team_task_update', { task_id: reviewing.id, expected_revision: revision + 1, action: 'complete' }),
      tool('send_message', { target: 'lead', message: 'Review passed; zero and negative inputs are covered.' }), text('Reviewer finished.'),
    ]
    let pass = 0
    r.ctx.tools.register(defineTool({
      name: 'poc_coordinate', description: 'Deterministic local test driver; not a shipped plugin tool.', parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      execute: async (_args, exec) => {
        pass++
        r.model.script(writer, script(r.ctx.agentTeams.getTask(r.lead, writing.id).revision, pass === 1 ? FIXED : REVISED))
        r.model.script(reviewer, reviewScript(r.ctx.agentTeams.getTask(r.lead, reviewing.id).revision))
        await r.ctx.agentTeams.sendMessage(r.lead, { target: 'writer', content: [{ type: 'text', text: 'Apply the task contract and consolidated feedback.' }], signal: exec.signal })
        await until(() => r.ctx.agentTeams.listMembers(r.lead).find(member => member.name === 'writer')?.status === 'inactive', 'Writer did not settle')
        assert.equal(r.ctx.agentTeams.getTask(r.lead, writing.id).status, 'completed')
        await r.ctx.agentTeams.sendMessage(r.lead, { target: 'reviewer', content: [{ type: 'text', text: 'Perform the dependent read-only review.' }], signal: exec.signal })
        await until(() => r.ctx.agentTeams.listMembers(r.lead).find(member => member.name === 'reviewer')?.status === 'inactive', 'Reviewer did not settle')
        assert.equal(r.ctx.agentTeams.getTask(r.lead, reviewing.id).status, 'completed')
        return 'Both official tasks completed; Leader must still verify.'
      },
    }))
    r.model.script(r.lead, [tool('poc_coordinate', {}), tool('devwork_verify', {}), text('Leader: addition fixed, review and acceptance passed; ready for your review.')])
    prompt(r.lead, 'Please explicitly use Agent Teams for this Devwork development round.')
    await r.lead.whenIdle()
    try { await until(() => r.lead.session.snapshotEvents().some(event => event.type === 'workspace/changes'), 'Official diff was not announced') }
    catch (error) {
      throw new Error(JSON.stringify({ logs: r.logs, header: r.lead.session.header, events: r.lead.session.snapshotEvents().filter(event => ['turn/start', 'turn/end', 'tool/result', 'workspace/changes'].includes(event.type)) }), { cause: error })
    }
    const brief = await r.ctx.devwork.brief(r.lead, SIGNAL)
    assert.equal(brief.stage, 'ready-for-review')
    assert.equal(brief.completed, 2)
    assert.equal(brief.checks[0]?.status, 'passed')
    assert.equal(await readFile(join(r.cwd, 'math.ts'), 'utf8'), FIXED)
    const snapshot = await r.ctx.devwork.review(r.lead, SIGNAL)
    assert.deepEqual(snapshot.files, ['math.ts'])
    assert.equal(await readFile(join(r.cwd, 'README.md'), 'utf8'), 'Existing user edit; preserve me.\n')
    const batch = await r.ctx.devwork.prepareFeedback(r.lead, snapshot, [
      { file: 'math.ts', startLine: 1, endLine: 1, text: 'Document that zero and negative inputs are intentional.' },
      { file: 'math.ts', startLine: 1, endLine: 1, text: 'Keep the function signature unchanged.' },
    ], SIGNAL)
    assert.match(batch.prompt, /return a \+ b/)
    assert.match(batch.prompt, /snapshotSeq/)
    await writeFile(join(r.cwd, 'math.ts'), REVISED)
    await assert.rejects(() => r.ctx.devwork.sendFeedback(r.lead, batch.id, SIGNAL), /Stale feedback/)
    await writeFile(join(r.cwd, 'math.ts'), FIXED)
    await assert.rejects(() => r.ctx.devwork.prepareFeedback(r.lead, snapshot, [{ file: 'README.md', startLine: 1, endLine: 1, text: 'Wrong file' }], SIGNAL))
    await assert.rejects(() => r.ctx.devwork.prepareFeedback(r.lead, snapshot, [{ file: 'math.ts', startLine: 10, endLine: 10, text: 'Wrong line' }], SIGNAL))
    await r.ctx.agentTeams.updateTask(r.lead, { taskId: writing.id, expectedRevision: r.ctx.agentTeams.getTask(r.lead, writing.id).revision, action: 'reopen' })
    await r.ctx.agentTeams.updateTask(r.lead, { taskId: reviewing.id, expectedRevision: r.ctx.agentTeams.getTask(r.lead, reviewing.id).revision, action: 'reopen' })
    const turnsBefore = r.lead.session.snapshotEvents().filter(event => event.type === 'turn/start').length
    r.model.script(r.lead, [tool('poc_coordinate', {}), tool('devwork_verify', {}), text('Leader: both comments addressed and checks rerun.')])
    const sends = await Promise.allSettled([r.ctx.devwork.sendFeedback(r.lead, batch.id, SIGNAL), r.ctx.devwork.sendFeedback(r.lead, batch.id, SIGNAL)])
    assert.equal(sends.filter(send => send.status === 'fulfilled').length, 1, 'Concurrent clicks enqueue one Leader turn')
    await assert.rejects(() => r.ctx.devwork.sendFeedback(r.lead, batch.id, SIGNAL))
    await r.lead.whenIdle()
    assert.equal(await readFile(join(r.cwd, 'math.ts'), 'utf8'), REVISED)
    assert.equal((await r.ctx.devwork.brief(r.lead, SIGNAL)).stage, 'ready-for-review')
    assert.equal(r.lead.session.snapshotEvents().filter(event => event.type === 'turn/start').length, turnsBefore + 1)
    assert.equal(r.ctx.agentTeams.listMembers(r.lead).length, 3, 'Reuse the same Leader, writer and reviewer')
    assert.equal(r.ctx.agentTeams.listTasks(r.lead).length, 2, 'No mirrored/new task board')
    assert.ok(r.model.requests.some(request => request.messages.some(message => message.role === 'system' && JSON.stringify(message).includes('Task completed or member inactive is not verification evidence'))))
    assert.ok(r.lead.session.snapshotEvents().some(event => event.type === 'team/message/queued'))
  } finally { await r.close() }
})

test('plugin unload cancels and drains in-flight official verification', { timeout: 20_000 }, async () => {
  const r = await boot()
  try {
    assert.ok(r.pluginFiber)
    const writing = await task(r)
    await complete(r, writing.id)
    const command = `node -e ${quote("require('node:fs').writeFileSync('.sessions/check-started', 'yes'); setTimeout(() => {}, 15000)")}`
    const old = r.ctx.devwork
    old.open(r.lead, { goal: 'Cancel owned work on disable', taskIds: [writing.id], checks: [command] })
    r.model.script(r.lead, [tool('devwork_verify', {}), text('Verification stopped when the feature unloaded.')])
    prompt(r.lead, 'Run the declared check.')
    await until(() => existsSync(join(r.cwd, '.sessions/check-started')), 'Verification process never started')
    const start = Date.now()
    await r.pluginFiber.dispose()
    assert.ok(Date.now() - start < 5000, 'Unloading must drain an aborted process instead of waiting its full runtime')
    await r.lead.whenIdle()
    assert.equal(r.ctx.get('devwork'), undefined)
    assert.equal(r.ctx.tools.get('devwork_verify'), undefined)
    assert.throws(() => old.brief(r.lead, SIGNAL), /unloaded/)
    assert.ok(r.lead.session.snapshotEvents().some(event => event.type === 'tool/result' && event.data.message.isError))
  } finally { await r.close() }
})

test('completion is not evidence; failed check and edited checkout block readiness', { timeout: 30_000 }, async () => {
  const r = await boot()
  try {
    const writing = await task(r)
    await complete(r, writing.id)
    r.ctx.devwork.open(r.lead, { goal: 'Verify addition', taskIds: [writing.id], checks: [CHECK] })
    assert.equal((await r.ctx.devwork.brief(r.lead, SIGNAL)).checks[0]?.status, 'not-run')
    r.model.script(r.lead, [tool('devwork_verify', {}), text('Check failed; needs correction.')])
    prompt(r.lead, 'Verify the completed task.')
    await r.lead.whenIdle()
    assert.equal((await r.ctx.devwork.brief(r.lead, SIGNAL)).checks[0]?.status, 'failed')
    await writeFile(join(r.cwd, 'math.ts'), FIXED)
    r.model.script(r.lead, [tool('devwork_verify', {}), text('Verification passed.')])
    prompt(r.lead, 'Recheck the corrected implementation.')
    await r.lead.whenIdle()
    assert.equal((await r.ctx.devwork.brief(r.lead, SIGNAL)).stage, 'ready-for-review')
    await writeFile(join(r.cwd, 'math.ts'), INITIAL)
    const stale = await r.ctx.devwork.brief(r.lead, SIGNAL)
    assert.equal(stale.stage, 'needs-attention')
    assert.equal(stale.checks[0]?.status, 'stale')
  } finally { await r.close() }
})

test('official pre-execute denial reaches nested verification; no shell-policy bypass', { timeout: 30_000 }, async () => {
  const r = await boot()
  try {
    const writing = await task(r)
    await complete(r, writing.id)
    await writeFile(join(r.cwd, 'math.ts'), FIXED)
    r.ctx.devwork.open(r.lead, { goal: 'Respect host policy', taskIds: [writing.id], checks: [CHECK] })
    let denied = 0
    r.ctx.on('tools/pre-execute', async (exec, next) => {
      if (exec.name === 'bash') { denied++; return { kind: 'deny', reason: 'POC policy denies shell' } }
      return next()
    })
    r.model.script(r.lead, [tool('devwork_verify', {}), text('Official policy denied verification.')])
    prompt(r.lead, 'Run the declared verification through host policy.')
    await r.lead.whenIdle()
    assert.equal(denied, 1)
    assert.equal((await r.ctx.devwork.brief(r.lead, SIGNAL)).checks[0]?.status, 'failed')
  } finally { await r.close() }
})

test('inactive task owner is attention, not completion; teammate cannot open Leader round', { timeout: 30_000 }, async () => {
  const r = await boot()
  try {
    const writer = await teammate(r, 'writer')
    const writing = await task(r)
    r.ctx.tools.register(defineTool({
      name: 'poc_child_control', description: 'Assert child authority in a real live child turn.', parameters: {},
      output: { schema: { type: 'boolean' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
      execute: async (_args, exec) => {
        const child = exec.agent
        assert.ok(child)
        assert.throws(() => r.ctx.devwork.open(child, { goal: 'Unauthorized child control', taskIds: [writing.id], checks: [CHECK] }), /Only the Leader/)
        return true
      },
    }))
    r.model.script(writer, [tool('poc_child_control', {}), tool('team_task_update', { task_id: writing.id, expected_revision: 1, action: 'claim' }), text('Paused; task remains owned.')])
    await r.ctx.agentTeams.sendMessage(r.lead, { target: 'writer', content: [{ type: 'text', text: 'Claim the task, then pause.' }], signal: SIGNAL })
    await until(() => r.ctx.agentTeams.listMembers(r.lead).find(member => member.name === 'writer')?.status === 'inactive', 'Writer did not settle')
    r.ctx.devwork.open(r.lead, { goal: 'Do not mistake idle for done', taskIds: [writing.id], checks: [CHECK] })
    await r.ctx.agentTeams.interrupt(r.lead, 'writer')
    const brief = await r.ctx.devwork.brief(r.lead, SIGNAL)
    assert.equal(brief.completed, 0)
    assert.equal(brief.stage, 'needs-attention')
    assert.match(brief.attention.join('\n'), /Owner inactive/)
    assert.equal(r.ctx.agentTeams.getTask(r.lead, writing.id).ownerName, 'writer')
    const result = await r.ctx.tools.execute({ callId: ToolCallId('missing-agent'), name: 'devwork_brief', arguments: {}, signal: SIGNAL })
    assert.equal(result.isError, true)
  } finally { await r.close() }
})

test('real Cordis lifecycle: pending dependencies, activation, cleanup and reactivation', { timeout: 30_000 }, async () => {
  const r = await boot({ plugin: false, changes: false })
  try {
    const fiber = r.ctx.plugin(Plugin)
    assert.equal(fiber.state, PENDING)
    assert.equal(r.ctx.get('devwork'), undefined)
    const changes = await r.ctx.plugin(WorkspaceChanges)
    await fiber
    assert.equal(fiber.state, ACTIVE)
    const old = r.ctx.devwork
    const writing = await task(r)
    old.open(r.lead, { goal: 'Test scope lifecycle', taskIds: [writing.id], checks: [CHECK] })
    assert.ok(r.ctx.tools.get('devwork_open'))
    await changes.dispose()
    await until(() => fiber.state === PENDING, 'Devwork did not suspend on dependency loss')
    assert.equal(r.ctx.get('devwork'), undefined)
    assert.equal(r.ctx.tools.get('devwork_open'), undefined)
    assert.equal(r.ctx.tools.get('devwork_worktree'), undefined)
    assert.equal(r.ctx.tools.get('devwork_handoff'), undefined)
    assert.equal(r.ctx.tools.get('devwork_cleanup'), undefined)
    assert.throws(() => old.open(r.lead, { goal: 'Old reference must fail', taskIds: [writing.id], checks: [CHECK] }), /unloaded/)
    await r.ctx.plugin(WorkspaceChanges)
    await until(() => fiber.state === ACTIVE, 'Devwork did not reactivate')
    assert.notEqual(r.ctx.devwork, old)
    assert.throws(() => r.ctx.devwork.brief(r.lead, SIGNAL), /No Devwork round/)
    await fiber.dispose()
    assert.equal(r.ctx.tools.get('devwork_verify'), undefined)
    const assembly = await r.ctx.systemPrompt.assemble({ agent: r.lead })
    assert.ok(!assembly.sections.some(section => section.name === 'devwork:development-round'))
  } finally { await r.close() }
})
