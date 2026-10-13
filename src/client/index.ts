/// <reference types="@deepseek-ai/dsh-client-ui-conversation/client" preserve="true" />
/// <reference types="@deepseek-ai/dsh-api-session-controller/remote" preserve="true" />
/// <reference types="@deepseek-ai/dsh-api-workspace-controller/remote" preserve="true" />
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Public remote declarations complete the independently compiled Client map.
import type {} from '@deepseek-ai/dsh-api-session-controller/remote'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/remote'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChangeEvent } from 'react'
import { createElement, useEffect, useState } from 'react'
import { TYPERT_REMOTE } from './remote.js'
import type { DevworkRemoteBrief } from './remote.js'


const NS = 'dsh-devwork'
type Key = 'start' | 'hint' | 'prompt' | 'panel' | 'loading' | 'unavailable' | 'error' | 'goal' | 'stage' | 'checks' | 'attention' | 'cleanup' | 'feedbackPlaceholder' | 'insertFeedback' | 'refresh' | 'noAttention' | 'noCleanup'
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'dsh-devwork': Key } }
export const inject = ['slots', 'remote', 'locale']
export type StartProps = Pick<PropsRuntime<'conversation.input.left'>, 'inputActions'> & PropsLocale<typeof NS>
type PanelRuntimeProps = Pick<PropsRuntime<'conversation.input.left'>, 'inputActions' | 'sessionId'> & PropsLocale<typeof NS>
export type PanelProps = PanelRuntimeProps & { context: Context }

type PanelState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'available'; readonly brief: DevworkRemoteBrief }

// The slot can mount while the Cordis effect is still awaiting Gateway registration.
let remoteReady: Promise<void> = Promise.resolve()

export function StartAction({ inputActions, t }: StartProps) {
  return createElement('button', {
    type: 'button', title: t('hint'),
    style: { color: 'inherit', background: 'transparent', border: '1px solid currentColor', borderRadius: 6, padding: '3px 8px', font: 'inherit', cursor: 'pointer' },
    onClick: () => { inputActions.insertText(t('prompt'), inputActions.captureInsertion()) },
  }, t('start'))
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}

function SnapshotDetails({ brief, t }: { brief: DevworkRemoteBrief; t: PanelProps['t'] }) {
  return createElement('div', { style: { display: 'grid', gap: 4, marginTop: 6, fontSize: '0.9em' } },
    createElement('div', null, `${t('goal')}: ${brief.goal}`),
    createElement('div', null, `${t('stage')}: ${brief.stage} · ${brief.completed}/${brief.total}`),
    createElement('div', null, `${t('checks')}:`),
    ...brief.checks.map(check => createElement('div', { key: check.command, style: { paddingLeft: 8 } }, `${check.status} · ${check.command}`)),
    createElement('div', null, `${t('attention')}: ${brief.attention.length ? brief.attention.join('; ') : t('noAttention')}`),
    createElement('div', null, `${t('cleanup')}: ${brief.cleanupPending.length ? brief.cleanupPending.join('; ') : t('noCleanup')}`),
  )
}

export function DevworkPanel({ context, inputActions, sessionId, t }: PanelProps) {
  const [state, setState] = useState<PanelState>({ kind: 'loading' })
  const [feedback, setFeedback] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        await remoteReady
        const result = await context.remote.devwork.snapshot({ sessionId }, controller.signal)
        if (!active) return
        if (!result.ok) setState({ kind: 'error', message: result.error.message })
        else if (result.value.status === 'available') setState({ kind: 'available', brief: result.value.brief })
        else if (result.value.status === 'error') setState({ kind: 'error', message: result.value.error })
        else setState({ kind: 'unavailable' })
      } catch (error) {
        if (active && !controller.signal.aborted) setState({ kind: 'error', message: errorMessage(error) })
      }
    })()
    return () => { active = false; controller.abort() }
  }, [context, sessionId, refreshToken])

  const body = state.kind === 'loading'
    ? t('loading')
    : state.kind === 'unavailable'
      ? t('unavailable')
      : state.kind === 'error'
        ? `${t('error')}: ${state.message}`
        : createElement(SnapshotDetails, { brief: state.brief, t })
  const onFeedbackChange = (event: ChangeEvent<HTMLTextAreaElement>) => { setFeedback(event.currentTarget.value) }
  const insertFeedback = () => {
    const text = feedback.trim()
    if (!text) return
    inputActions.insertText(`\nDevwork feedback for the current result:\n${text}\n`, inputActions.captureInsertion())
    setFeedback('')
  }
  return createElement('details', { style: { margin: '4px 0', maxWidth: 560 } },
    createElement('summary', { style: { cursor: 'pointer' } }, t('panel')),
    createElement('button', { type: 'button', onClick: () => { setRefreshToken(value => value + 1) }, style: { marginTop: 4, cursor: 'pointer' } }, t('refresh')),
    createElement('div', { style: { padding: '6px 0' } }, body),
    createElement('textarea', {
      value: feedback,
      onChange: onFeedbackChange,
      placeholder: t('feedbackPlaceholder'),
      rows: 2,
      style: { width: '100%', boxSizing: 'border-box', marginTop: 6, font: 'inherit' },
    }),
    createElement('button', {
      type: 'button',
      disabled: feedback.trim().length === 0,
      onClick: insertFeedback,
      style: { marginTop: 4, cursor: feedback.trim().length ? 'pointer' : 'default' },
    }, t('insertFeedback')),
  )
}

/** Thin UI: show the current result and insert an editable feedback draft; never submit or create agents. */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const mounted = ctx.remote.$mount(TYPERT_REMOTE)
    remoteReady = mounted.then(() => undefined)
    return async () => { const dispose = await mounted; await dispose() }
  }, 'devwork.client.remote')
  ctx.effect(() => ctx.locale.register(NS, {
    en: {
      start: 'Devwork', hint: 'Draft a local Team development request; edit before sending.',
      prompt: '\nPlease use Agent Teams for a Devwork local development round.\nGoal: \nUse one writer and a read-only reviewer; define tasks and acceptance checks, then call devwork_open and devwork_verify. Keep progress, review and important decisions in this Leader conversation.\n',
      panel: 'Devwork result', loading: 'Loading the current round…', unavailable: 'No active Devwork round.', error: 'Unable to read Devwork', goal: 'Goal', stage: 'Stage', checks: 'Checks', attention: 'Attention', cleanup: 'Cleanup', noAttention: 'none', noCleanup: 'none', feedbackPlaceholder: 'Write feedback for this result…', insertFeedback: 'Insert feedback draft', refresh: 'Refresh',
    },
    zh: {
      start: 'Devwork', hint: '起草本地团队开发请求，编辑后再发送。',
      prompt: '\n请使用 Agent Teams 进行 Devwork 本地开发。\n目标：\n先安排一个开发成员和一个只读审查成员；明确任务与验收命令，然后调用 devwork_open 和 devwork_verify。进度、审查和重要决策统一交给当前 Leader 汇总。\n',
      panel: 'Devwork 结果', loading: '正在读取当前轮次…', unavailable: '当前没有进行中的 Devwork 轮次。', error: '无法读取 Devwork', goal: '目标', stage: '阶段', checks: '验收', attention: '需关注', cleanup: '待清理', noAttention: '无', noCleanup: '无', feedbackPlaceholder: '为当前结果填写反馈…', insertFeedback: '插入反馈草稿', refresh: '刷新',
    },
  }), 'devwork.client.locale')
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'guomonth-devwork-start', order: 20, locale: NS }, StartAction))
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'guomonth-devwork-result', order: 21, locale: NS }, props => createElement(DevworkPanel, { ...props, context: ctx })))
}
