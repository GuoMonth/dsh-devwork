import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { boot, CHECK, complete, FIXED, prompt, SIGNAL, task, text, tool, writeCommand } from '../runtime.mts'

test('mock integration: scripted Leader uses official tools for a business workflow', { timeout: 30_000 }, async () => {
  const runtime = await boot()
  try {
    const writing = await task(runtime, 'Correct addition')
    await complete(runtime, writing.id)
    runtime.model.script(runtime.lead, [
      tool('devwork_open', { goal: 'Correct addition', taskIds: [writing.id], checks: [CHECK] }),
      tool('bash', { command: writeCommand(FIXED), description: 'Implement the assigned addition change' }),
      tool('devwork_verify', {}),
      text('The scripted Leader completed the declared business workflow.'),
    ])
    prompt(runtime.lead, 'Use the official Devwork tools to correct addition and verify the acceptance check.')
    await runtime.lead.whenIdle()
    const brief = await runtime.ctx.devwork.brief(runtime.lead, SIGNAL)
    assert.equal(brief.goal, 'Correct addition')
    assert.equal(brief.completed, 1)
    assert.equal(brief.checks[0]?.status, 'passed')
    assert.equal(brief.stage, 'ready-for-review')
    assert.equal(await readFile(join(runtime.cwd, 'math.ts'), 'utf8'), FIXED)
  } finally { await runtime.close() }
})
