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
import { createElement } from 'react'

const NS = 'dsh-devwork'
type Key = 'start' | 'hint' | 'prompt'
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'dsh-devwork': Key } }
export const inject = ['slots', 'locale']
export type StartProps = Pick<PropsRuntime<'conversation.input.left'>, 'inputActions'> & PropsLocale<typeof NS>

export function StartAction({ inputActions, t }: StartProps) {
  return createElement('button', {
    type: 'button', title: t('hint'),
    style: { color: 'inherit', background: 'transparent', border: '1px solid currentColor', borderRadius: 6, padding: '3px 8px', font: 'inherit', cursor: 'pointer' },
    onClick: () => { inputActions.insertText(t('prompt'), inputActions.captureInsertion()) },
  }, t('start'))
}

/** Thin UI: insert an editable, explicit opt-in; never submit or create agents. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, {
    en: { start: 'Devwork', hint: 'Draft a local Team development request; edit before sending.', prompt: '\nPlease use Agent Teams for a Devwork local development round.\nGoal: \nUse one writer and a read-only reviewer; define tasks and acceptance checks, then call devwork_open and devwork_verify. Keep progress, review and important decisions in this Leader conversation.\n' },
    zh: { start: 'Devwork', hint: '起草本地团队开发请求，编辑后再发送。', prompt: '\n请使用 Agent Teams 进行 Devwork 本地开发。\n目标：\n先安排一个开发成员和一个只读审查成员；明确任务与验收命令，然后调用 devwork_open 和 devwork_verify。进度、审查和重要决策统一交给当前 Leader 汇总。\n' },
  }), 'devwork.client.locale')
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'guomonth-devwork-start', order: 20, locale: NS }, StartAction))
}
