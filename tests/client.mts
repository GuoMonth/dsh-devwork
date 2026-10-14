import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { apply, inject, StartAction } from '../lib/client/index.js'
import type { StartProps } from '../lib/client/index.js'
import { SessionTaskView, TaskPanel } from '../lib/client/task-panel.js'
import { MemoryTaskLogStore, TaskRepository } from '../lib/task-center/index.js'
import type { TaskProjection } from '../lib/task-center/index.js'
import { record } from '../scripts/data.mts'

const require = createRequire(import.meta.url)

/** Evaluate the published closure-factory using a shared module table, no DOM. */
function factory(path: string): unknown {
  let loaded: unknown
  runInNewContext(readFileSync(path, 'utf8'), { window: { __ModuleLoader__: {
    load(value: unknown) {
      const declaration = record(value)
      const create = declaration.factory
      assert.ok(typeof create === 'function')
      const result: unknown = create((name: string): unknown => require(name))
      loaded = result
    },
  } } }, { timeout: 2000 })
  return loaded
}
function renderer(value: unknown): value is { SlotRegistry: new (ctx: Context) => SlotRegistry } {
  return typeof value === 'object' && value !== null && 'SlotRegistry' in value && typeof value.SlotRegistry === 'function'
}
function client(value: unknown): value is { apply: (ctx: Context) => void; inject: string[] } {
  return typeof value === 'object' && value !== null && 'apply' in value && typeof value.apply === 'function' && 'inject' in value && Array.isArray(value.inject) && value.inject.every(item => typeof item === 'string')
}
function localeFixture(value: unknown): value is LocaleFixture {
  if (typeof value !== 'object' || value === null || !('dictionaries' in value)) return false
  return value.dictionaries instanceof Map
}

/** Locale boundary fixture; SlotRegistry and Cordis are production implementations. */
class LocaleFixture extends Service {
  readonly dictionaries = new Map<string, Record<string, Record<string, string>>>()
  constructor(ctx: Context) { super(ctx, 'locale') }
  register(ns: string, dictionaries: Record<string, Record<string, string>>) {
    return this.ctx.effect(() => {
      this.dictionaries.set(ns, dictionaries)
      return () => { this.dictionaries.delete(ns) }
    })
  }
}

test('Client factory: official slot registers lazily and disposes with its declaration and plugin', async () => {
  const ctx = new Context()
  try {
    const module = factory(require.resolve('@deepseek-ai/dsh-client-ui-renderer/client'))
    assert.ok(renderer(module))
    await ctx.plugin(module.SlotRegistry)
    await ctx.plugin(LocaleFixture)
    const loaded = factory(fileURLToPath(new URL('../lib/client.js', import.meta.url)))
    assert.ok(client(loaded))
    assert.deepEqual([...loaded.inject], [...inject])
    const feature = await ctx.plugin({ inject: loaded.inject, apply: loaded.apply })
    assert.equal(ctx.slots.entries('conversation.input.left').length, 0)
    const declarationFixture = (props: PropsRenderSlots<'conversation.input.left' | 'conversation.view'>) => { void props.renderSlot; return null }
    const declare = () => ctx.slots.register({ name: 'root', inject: () => ({}), children: { 'conversation.input.left': { kind: 'list', scope: 'session' }, 'conversation.view': { kind: 'list', scope: 'session' } } }, declarationFixture)
    const collapse = declare()
    assert.equal(ctx.slots.entries('conversation.input.left').length, 1)
    assert.equal(ctx.slots.entries('conversation.view').length, 1)
    collapse()
    assert.equal(ctx.slots.entries('conversation.input.left').length, 0)
    assert.equal(ctx.slots.entries('conversation.view').length, 0)
    const redeclare = declare()
    assert.equal(ctx.slots.entries('conversation.input.left').length, 1)
    assert.equal(ctx.slots.entries('conversation.view').length, 1)
    await feature.dispose()
    assert.equal(ctx.slots.entries('conversation.input.left').length, 0)
    assert.equal(ctx.slots.entries('conversation.view').length, 0)
    redeclare()
  } finally { await ctx.fiber.dispose() }
})

const projection = (status: TaskProjection['tasks'][number]['status'] = 'active'): TaskProjection => ({
  revision: 8,
  tasks: [
    { id: 'root', parentId: null, title: 'Ship panel', goal: 'Ship panel', scope: ['client'], acceptance: ['renders tree'], dependencyIds: [], status, blockedReason: status === 'blocked' ? 'waiting for host source' : null },
    { id: 'child', parentId: 'root', title: 'Write view', goal: 'Write view', scope: ['client'], acceptance: ['has artifact'], dependencyIds: [], status: 'completed', blockedReason: null },
  ],
  sessions: [{ id: 'session-root', taskId: 'root', externalSessionId: null, status: 'waiting' }, { id: 'session-child', taskId: 'child', externalSessionId: null, status: 'succeeded' }],
  attempts: [{ id: 'attempt-root', sessionId: 'session-root', agentId: 'writer', number: 1, status: 'waiting' }],
  artifacts: [{ id: 'artifact', taskId: 'root', attemptId: 'attempt-root', kind: 'commit', uri: 'commit:abc', status: 'ready' }],
  integrations: [{ id: 'pr', taskId: 'root', artifactId: 'artifact', provider: 'github', url: 'https://github.com/example/repo/pull/1', status: 'open' }],
  leases: [],
})

test('Task panel renders loading, error, and empty states', () => {
  assert.match(renderToStaticMarkup(createElement(TaskPanel, { data: { kind: 'loading' } })), /Loading tasks/)
  assert.match(renderToStaticMarkup(createElement(TaskPanel, { data: { kind: 'error', message: 'disk unavailable' } })), /disk unavailable/)
  assert.match(renderToStaticMarkup(createElement(TaskPanel, { projection: { revision: 0, tasks: [], sessions: [], attempts: [], artifacts: [], integrations: [], leases: [] } })), /No tasks yet/)
})

test('Task panel and Session view consume one projection tree and show blocked/status/artifact evidence', () => {
  const view = projection('blocked')
  const panelMarkup = renderToStaticMarkup(createElement(TaskPanel, { projection: view, expandedIds: new Set(['root']) }))
  const sessionMarkup = renderToStaticMarkup(createElement(SessionTaskView, { projection: view, taskId: 'root', expandedIds: new Set(['root']) }))
  assert.match(panelMarkup, /Ship panel/)
  assert.match(panelMarkup, /waiting for host source/)
  assert.match(panelMarkup, /Artifacts: commit · ready · commit:abc/)
  assert.match(panelMarkup, /PR\/MR: github · open/)
  assert.match(sessionMarkup, /Ship panel/)
  assert.match(sessionMarkup, /Write view/)
  assert.match(sessionMarkup, /blocked/)
  const updatedMarkup = renderToStaticMarkup(createElement(TaskPanel, { projection: projection('completed') }))
  assert.match(updatedMarkup, /Ship panel · completed/)
})

const createTask = (id: string, parentId: string | null = null) => ({ type: 'task.create', id, parentId, title: id, goal: id, scope: ['client'], acceptance: ['record evidence'], dependencyIds: [] })

test('mock TaskLogStore projection is identical in the panel and Session view', async () => {
  const store = new MemoryTaskLogStore()
  const repository = new TaskRepository(store)
  await repository.dispatch(createTask('root'))
  await repository.dispatch(createTask('child', 'root'))
  await repository.dispatch({ type: 'session.create', id: 'session-root', taskId: 'root', externalSessionId: null })
  await repository.dispatch({ type: 'session.create', id: 'session-child', taskId: 'child', externalSessionId: null })
  const view = await repository.snapshot()
  const panelMarkup = renderToStaticMarkup(createElement(TaskPanel, { projection: view, expandedIds: new Set(['root']) }))
  const sessionMarkup = renderToStaticMarkup(createElement(SessionTaskView, { projection: view, taskId: 'root', expandedIds: new Set(['root']) }))
  for (const text of ['root', 'child', 'pending', 'Session: session-root']) {
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.match(panelMarkup, new RegExp(escaped))
    assert.match(sessionMarkup, new RegExp(escaped))
  }
})

test('UI is an editable explicit request, preserves insertion revision and never submits', async () => {
  const ctx = new Context()
  try {
    const module = factory(require.resolve('@deepseek-ai/dsh-client-ui-renderer/client'))
    assert.ok(renderer(module))
    await ctx.plugin(module.SlotRegistry)
    const locale = await ctx.plugin(LocaleFixture)
    const feature = await ctx.plugin({ inject, apply })
    const instance: unknown = locale.ctx.get('locale')
    // Use this fixture's concrete provider only to inspect its owned dictionaries.
    if (!localeFixture(instance)) throw new Error('Locale fixture was not registered')
    const dictionary = instance.dictionaries.get('dsh-devwork')?.zh
    assert.ok(dictionary)
    const insertions: string[] = []
    let submissions = 0
    const span = { start: 0, end: 0, draftRev: 7 }
    const actions: StartProps['inputActions'] = {
      captureInsertion: () => span,
      insertText: (value, captured) => { assert.equal(captured, span); insertions.push(value); return true },
      setDraft: () => { throw new Error('Must not replace the existing draft') },
      persistDraft: () => { throw new Error('Only the official insertion action owns draft persistence') },
      addAttachments: () => true, removeAttachment: () => {}, pruneAttachments: () => {}, submit: () => { submissions++ },
    }
    const props: StartProps = { inputActions: actions, t: key => dictionary[key] ?? key }
    const element = StartAction(props)
    assert.ok(element.props.onClick)
    // Handler uses no browser event; trigger through its zero-argument closure.
    const click = element.props.onClick
    if (click.length === 0) Reflect.apply(click, undefined, [])
    else throw new Error('Unexpected browser-event dependency')
    assert.equal(insertions.length, 1)
    assert.match(insertions[0] ?? '', /请使用 Agent Teams/)
    assert.match(insertions[0] ?? '', /devwork_open.*devwork_verify/)
    assert.equal(submissions, 0)
    assert.match(renderToStaticMarkup(createElement(StartAction, props)), /Devwork/)
    await feature.dispose()
    assert.equal(instance.dictionaries.has('dsh-devwork'), false)
  } finally { await ctx.fiber.dispose() }
})
