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
import { TaskPanel, TaskPanelView } from './task-panel.js'
import type { TaskPanelSource } from './task-panel.js'
import type { TaskPanelSource as HostTaskPanelSource } from '../task-center/panel.js'
export { bindTaskPanelActions, defaultTaskPanelLabels, projectSessionTree, projectTaskTree, SessionTaskView, TaskPanel, TaskPanelTree, TaskPanelView, unavailableTaskPanelData } from './task-panel.js'
export type { SessionTaskViewProps, TaskPanelActions, TaskPanelData, TaskPanelLabels, TaskPanelLocaleKey, TaskPanelProps, TaskPanelSource, TaskPanelTranslate, TaskPanelViewContext, TaskPanelTreeProps, TaskPanelViewProps } from './task-panel.js'

const NS = 'dsh-devwork'
type Key = 'start' | 'hint' | 'prompt' | 'panel' | 'create' | 'loading' | 'unavailable' | 'empty' | 'error' | 'session' | 'status' | 'blocked' | 'failed' | 'progress' | 'progressNone' | 'progressCompleted' | 'progressBlocked' | 'acceptance' | 'noAcceptance' | 'acceptancePending' | 'checks' | 'noChecks' | 'cleanup' | 'noCleanup' | 'artifacts' | 'noArtifacts' | 'pullRequest' | 'noPullRequest' | 'view' | 'authorize' | 'open' | 'continue' | 'expand' | 'collapse' | 'noSession' | 'noReason' | 'attempt' | 'children' | 'noTask'
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'dsh-devwork': Key } }
// Host integration provides taskPanelSource through the public Host bridge.
declare module '@deepseek-ai/cordis' { interface Context { readonly taskPanelSource?: HostTaskPanelSource | undefined } }
export const inject = ['slots', 'locale']
export type StartProps = Pick<PropsRuntime<'conversation.input.left'>, 'inputActions'> & PropsLocale<typeof NS>

const TaskPanelSlot = (props: PropsRuntime<'conversation.view'> & PropsLocale<typeof NS> & { readonly taskPanelSource?: TaskPanelSource | undefined }) => createElement(TaskPanelView, props)

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
    en: {
      start: 'Devwork', hint: 'Draft a local task request; edit before sending.', prompt: '\nCreate a Devwork task for this goal.\nGoal: \nAssign one active executor and keep progress, status, review decisions and acceptance evidence in this Leader conversation.\n',
      panel: 'Tasks', create: 'Create task', loading: 'Loading tasks…', unavailable: 'Task source unavailable; Host transport is not connected.', empty: 'No tasks yet.', error: 'Unable to load tasks', session: 'Session', status: 'Status', blocked: 'Blocked', failed: 'Failed', progress: 'Recent progress', progressNone: 'none recorded', progressCompleted: 'completed', progressBlocked: 'blocked', acceptance: 'Acceptance evidence', noAcceptance: 'No acceptance criteria recorded.', acceptancePending: 'No result recorded in this projection.', checks: 'Checks', noChecks: 'No check result recorded.', cleanup: 'Cleanup', noCleanup: 'No cleanup state recorded.', artifacts: 'Artifacts', noArtifacts: 'No artifacts recorded.', pullRequest: 'PR/MR', noPullRequest: 'No PR/MR recorded.', view: 'View', authorize: 'Authorize merge', open: 'Open', continue: 'Continue', expand: 'Expand', collapse: 'Collapse', noSession: 'No primary Session bound.', noReason: 'Reason not recorded.', attempt: 'Attempt', children: 'children', noTask: 'This Session has no linked task.',
    },
    zh: {
      start: 'Devwork', hint: '起草本地任务请求，编辑后再发送。', prompt: '\n为此目标创建一个 Devwork 任务。\n目标：\n指定一个活跃执行者，在当前 Leader 会话中保留进度、状态、审查决定和验收证据。\n',
      panel: '任务', create: '创建任务', loading: '正在加载任务…', unavailable: '任务源不可用；Host 传输尚未连接。', empty: '暂无任务。', error: '无法加载任务', session: 'Session', status: '状态', blocked: '阻塞', failed: '失败', progress: '最近进度', progressNone: '未记录', progressCompleted: '已完成', progressBlocked: '已阻塞', acceptance: '验收证据', noAcceptance: '未记录验收条件。', acceptancePending: '此投影未记录结果。', checks: '检查', noChecks: '未记录检查结果。', cleanup: '清理', noCleanup: '未记录清理状态。', artifacts: 'Artifact', noArtifacts: '未记录 Artifact。', pullRequest: 'PR/MR', noPullRequest: '未记录 PR/MR。', view: '查看', authorize: '授权合并', open: '打开', continue: '继续', expand: '展开', collapse: '收起', noSession: '未绑定主 Session。', noReason: '未记录原因。', attempt: '尝试', children: '个子任务', noTask: '此 Session 未关联任务。',
    },
  }), 'devwork.client.locale')
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'guomonth-devwork-start', order: 20, locale: NS }, StartAction))
  ctx.slots.inject('conversation.view', () => ctx.slots.register({ name: 'conversation.view', id: 'guomonth-devwork-task-panel', order: 70, label: 'Tasks', locale: NS, inject: (sessionId) => {
    const source = ctx.get('taskPanelSource')
    return { taskPanelSource: source?.forSession?.(sessionId) ?? source }
  } }, TaskPanelSlot))
}
