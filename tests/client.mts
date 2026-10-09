import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { apply, inject, StartAction } from '../lib/client/index.js'
import type { StartProps } from '../lib/client/index.js'
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
    const loaded = factory(new URL('../lib/client.js', import.meta.url).pathname)
    assert.ok(client(loaded))
    assert.deepEqual([...loaded.inject], [...inject])
    const feature = await ctx.plugin({ inject: loaded.inject, apply: loaded.apply })
    assert.equal(ctx.slots.entries('conversation.input.left').length, 0)
    const declarationFixture = (props: PropsRenderSlots<'conversation.input.left'>) => { void props.renderSlot; return null }
    const declare = () => ctx.slots.register({ name: 'root', inject: () => ({}), children: { 'conversation.input.left': { kind: 'list', scope: 'session' } } }, declarationFixture)
    const collapse = declare()
    assert.equal(ctx.slots.entries('conversation.input.left').length, 1)
    collapse()
    assert.equal(ctx.slots.entries('conversation.input.left').length, 0)
    const redeclare = declare()
    assert.equal(ctx.slots.entries('conversation.input.left').length, 1)
    await feature.dispose()
    assert.equal(ctx.slots.entries('conversation.input.left').length, 0)
    redeclare()
  } finally { await ctx.fiber.dispose() }
})

test('UI is an editable explicit request, preserves insertion revision and never submits', async () => {
  const ctx = new Context()
  try {
    const module = factory(require.resolve('@deepseek-ai/dsh-client-ui-renderer/client'))
    assert.ok(renderer(module))
    await ctx.plugin(module.SlotRegistry)
    const locale = await ctx.plugin(LocaleFixture)
    const feature = await ctx.plugin({ inject, apply })
    const instance = locale.ctx.get('locale')
    // Use this fixture's concrete provider only to inspect its owned dictionaries.
    assert.ok(instance instanceof LocaleFixture)
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
    assert.equal(submissions, 0)
    assert.match(renderToStaticMarkup(createElement(StartAction, props)), /Devwork/)
    await feature.dispose()
    assert.equal(instance.dictionaries.has('dsh-devwork'), false)
  } finally { await ctx.fiber.dispose() }
})
