import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { createElement, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { taskTree } from '../task-center/tree.js'
import type { TaskTreeNode } from '../task-center/tree.js'
import type { IntegrationRef, TaskArtifact, TaskProjection, TaskStatus } from '../task-center/types.js'

/** A point-in-time panel input. The panel never owns or mutates this state. */
export type TaskPanelData =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable'; readonly message?: string | undefined }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly projection: TaskProjection }

export type TaskPanelLocaleKey = 'panel' | 'create' | 'loading' | 'unavailable' | 'empty' | 'error' | 'session' | 'status' | 'blocked' | 'failed' | 'progress' | 'progressNone' | 'progressCompleted' | 'progressBlocked' | 'acceptance' | 'noAcceptance' | 'acceptancePending' | 'checks' | 'noChecks' | 'cleanup' | 'noCleanup' | 'artifacts' | 'noArtifacts' | 'pullRequest' | 'noPullRequest' | 'view' | 'open' | 'continue' | 'expand' | 'collapse' | 'noSession' | 'noReason' | 'attempt' | 'children' | 'noTask'
export type TaskPanelTranslate = (key: TaskPanelLocaleKey) => string

export interface TaskPanelLabels {
  readonly title: string
  readonly create: string
  readonly loading: string
  readonly unavailable: string
  readonly empty: string
  readonly error: string
  readonly session: string
  readonly status: string
  readonly blocked: string
  readonly failed: string
  readonly progress: string
  readonly progressNone: string
  readonly progressCompleted: string
  readonly progressBlocked: string
  readonly acceptance: string
  readonly noAcceptance: string
  readonly acceptancePending: string
  readonly checks: string
  readonly noChecks: string
  readonly cleanup: string
  readonly noCleanup: string
  readonly artifacts: string
  readonly noArtifacts: string
  readonly pullRequest: string
  readonly noPullRequest: string
  readonly view: string
  readonly open: string
  readonly continue: string
  readonly expand: string
  readonly collapse: string
  readonly noSession: string
  readonly noReason: string
  readonly attempt: string
  readonly children: string
  readonly noTask: string
}

export const defaultTaskPanelLabels: TaskPanelLabels = {
  title: 'Tasks',
  create: 'Create task',
  loading: 'Loading tasks…',
  unavailable: 'Task source unavailable; Host transport is not connected.',
  empty: 'No tasks yet.',
  error: 'Unable to load tasks',
  session: 'Session',
  status: 'Status',
  blocked: 'Blocked',
  failed: 'Failed',
  progress: 'Recent progress',
  progressNone: 'none recorded',
  progressCompleted: 'completed',
  progressBlocked: 'blocked',
  acceptance: 'Acceptance evidence',
  noAcceptance: 'No acceptance criteria recorded.',
  acceptancePending: 'No result recorded in this projection.',
  checks: 'Checks',
  noChecks: 'No check result recorded.',
  cleanup: 'Cleanup',
  noCleanup: 'No cleanup state recorded.',
  artifacts: 'Artifacts',
  noArtifacts: 'No artifacts recorded.',
  pullRequest: 'PR/MR',
  noPullRequest: 'No PR/MR recorded.',
  view: 'View',
  open: 'Open',
  continue: 'Continue',
  expand: 'Expand',
  collapse: 'Collapse',
  noSession: 'No primary Session bound.',
  noReason: 'Reason not recorded.',
  attempt: 'Attempt',
  children: 'children',
  noTask: 'This Session has no linked task.',
}

export interface TaskPanelActions {
  readonly onCreate?: (() => void) | undefined
  readonly onOpen?: ((taskId: string, sessionId: string | null) => void) | undefined
  readonly onContinue?: ((taskId: string, sessionId: string | null) => void) | undefined
  readonly onView?: ((target: TaskArtifact | IntegrationRef) => void) | undefined
  readonly onToggle?: ((taskId: string, expanded: boolean) => void) | undefined
  readonly onExpand?: ((taskId: string) => void) | undefined
  readonly onCollapse?: ((taskId: string) => void) | undefined
}

/** Browser-side transport boundary. Host adapters own projection state. */
export interface TaskPanelSource {
  /** Scope the boundary to the current Session supplied by the public slot. */
  readonly forSession?: ((sessionId: string) => TaskPanelSource) | undefined
  readonly getSnapshot: (view: ConvViewProps) => TaskPanelData
  readonly subscribe: (view: ConvViewProps, listener: () => void) => () => void
  readonly actions: {
    readonly create?: ((view: ConvViewProps) => void | Promise<void>) | undefined
    readonly open?: ((taskId: string, sessionId: string | null, view: ConvViewProps) => void | Promise<void>) | undefined
    readonly continue?: ((taskId: string, sessionId: string | null, view: ConvViewProps) => void | Promise<void>) | undefined
    readonly view?: ((target: TaskArtifact | IntegrationRef, view: ConvViewProps) => void | Promise<void>) | undefined
  }
}

export const unavailableTaskPanelData: TaskPanelData = { kind: 'unavailable' }

/** Bind source commands once per scoped Conversation View occurrence. */
export function bindTaskPanelActions(source: TaskPanelSource | undefined, view: ConvViewProps): TaskPanelActions {
  return {
    onCreate: source?.actions.create ? () => { void source.actions.create?.(view) } : undefined,
    onOpen: source?.actions.open ? (taskId, sessionId) => { void source.actions.open?.(taskId, sessionId, view) } : undefined,
    onContinue: source?.actions.continue ? (taskId, sessionId) => { void source.actions.continue?.(taskId, sessionId, view) } : undefined,
    onView: source?.actions.view ? target => { void source.actions.view?.(target, view) } : undefined,
  }
}

export interface TaskPanelProps extends TaskPanelActions {
  /** Pass one shared Stage 1 projection; no client-side store is created. */
  readonly projection?: TaskProjection | undefined
  /** Explicit remote/mock lifecycle state. Ready with no tasks is the empty state. */
  readonly data?: TaskPanelData | undefined
  readonly labels?: Partial<TaskPanelLabels> | undefined
  readonly t?: TaskPanelTranslate | undefined
  /** Controlled expanded task ids. Native details state is used when omitted. */
  readonly expandedIds?: ReadonlySet<string> | undefined
  readonly className?: string | undefined
}

export interface SessionTaskViewProps extends TaskPanelActions {
  readonly projection?: TaskProjection | undefined
  readonly data?: TaskPanelData | undefined
  /** Task identity takes precedence; session identity is used as a fallback. */
  readonly taskId?: string | undefined
  readonly sessionId?: string | undefined
  readonly labels?: Partial<TaskPanelLabels> | undefined
  readonly t?: TaskPanelTranslate | undefined
  readonly expandedIds?: ReadonlySet<string> | undefined
  readonly className?: string | undefined
}

/**
 * The public Client slot receives the same owner/runtime props as any other
 * conversation view. Projection and callbacks are optional until the Host task
 * source is connected; the slot therefore renders an honest empty state.
 */
export type TaskPanelViewProps = ConvViewProps & { readonly taskPanelSource?: TaskPanelSource | undefined; readonly t?: TaskPanelTranslate | undefined }

export interface TaskPanelTreeProps extends TaskPanelActions {
  readonly nodes: readonly TaskTreeNode[]
  readonly projection: TaskProjection
  readonly labels: TaskPanelLabels
  readonly expandedIds?: ReadonlySet<string> | undefined
}

/** Keep the projection boundary visible for both the panel and Session view. */
export function projectTaskTree(projection: TaskProjection): readonly TaskTreeNode[] {
  return taskTree(projection)
}

/** Session view uses this exact projection function; it does not copy task state. */
export function projectSessionTree(projection: TaskProjection): readonly TaskTreeNode[] {
  return projectTaskTree(projection)
}

function labelsOf(labels: Partial<TaskPanelLabels> | undefined, t: TaskPanelTranslate | undefined): TaskPanelLabels {
  const base = { ...defaultTaskPanelLabels, ...labels }
  if (!t) return base
  const translated = (key: TaskPanelLocaleKey): string => t(key)
  return {
    title: translated('panel'), create: translated('create'), loading: translated('loading'), unavailable: translated('unavailable'),
    empty: translated('empty'), error: translated('error'), session: translated('session'), status: translated('status'),
    blocked: translated('blocked'), failed: translated('failed'), progress: translated('progress'), progressNone: translated('progressNone'),
    progressCompleted: translated('progressCompleted'), progressBlocked: translated('progressBlocked'), acceptance: translated('acceptance'),
    noAcceptance: translated('noAcceptance'), acceptancePending: translated('acceptancePending'), checks: translated('checks'),
    noChecks: translated('noChecks'), cleanup: translated('cleanup'), noCleanup: translated('noCleanup'), artifacts: translated('artifacts'),
    noArtifacts: translated('noArtifacts'), pullRequest: translated('pullRequest'), noPullRequest: translated('noPullRequest'),
    view: translated('view'), open: translated('open'), continue: translated('continue'), expand: translated('expand'),
    collapse: translated('collapse'), noSession: translated('noSession'), noReason: translated('noReason'), attempt: translated('attempt'),
    children: translated('children'), noTask: translated('noTask'),
  }
}

function dataOf(props: Pick<TaskPanelProps, 'data' | 'projection'>): TaskPanelData {
  if (props.data) return props.data
  if (props.projection) return { kind: 'ready', projection: props.projection }
  return unavailableTaskPanelData
}

function statusLabel(status: TaskStatus): string { return status }
function sessionLabel(node: TaskTreeNode, labels: TaskPanelLabels): string {
  return node.session ? `${labels.session}: ${node.session.id} (${node.session.status})` : labels.noSession
}
function descendantsLabel(node: TaskTreeNode, labels: TaskPanelLabels): string {
  if (node.progress.total === 0) return `${labels.progress}: ${labels.progressNone}`
  return `${labels.progress}: ${node.progress.completed}/${node.progress.total} ${labels.progressCompleted} · ${node.progress.blocked} ${labels.progressBlocked}`
}
function attemptsLabel(node: TaskTreeNode, projection: TaskProjection, labels: TaskPanelLabels): string | null {
  if (!node.session) return null
  const attempts = projection.attempts.filter(attempt => attempt.sessionId === node.session?.id)
  if (attempts.length === 0) return null
  const latest = attempts[attempts.length - 1]
  return latest ? `${labels.attempt} #${latest.number}: ${latest.status}` : null
}
function checksLabel(taskId: string, projection: TaskProjection, labels: TaskPanelLabels): string {
  const result = projection.artifacts.find(value => value.taskId === taskId && value.kind === 'test_result')
  return result ? `${labels.checks}: ${result.status} · ${result.uri}` : `${labels.checks}: ${labels.noChecks}`
}
function cleanupLabel(taskId: string, projection: TaskProjection, labels: TaskPanelLabels): string {
  const leases = projection.leases.filter(value => value.taskId === taskId)
  return leases.length > 0
    ? `${labels.cleanup}: ${leases.map(lease => `${lease.status} · ${lease.path}`).join(' · ')}`
    : `${labels.cleanup}: ${labels.noCleanup}`
}
function findNode(nodes: readonly TaskTreeNode[], taskId: string | undefined, sessionId: string | undefined): TaskTreeNode | null {
  for (const node of nodes) {
    if (taskId && node.task.id === taskId) return node
    if (sessionId && node.session?.id === sessionId) return node
    const nested = findNode(node.children, taskId, sessionId)
    if (nested) return nested
  }
  return null
}

function ActionButton({ label, onClick, disabled = false }: { readonly label: string; readonly onClick?: (() => void) | undefined; readonly disabled?: boolean | undefined }) {
  return createElement('button', { type: 'button', disabled, onClick, style: { cursor: disabled ? 'default' : 'pointer', marginRight: 4 } }, label)
}

function ArtifactCard({ artifacts, integrations, labels, onView }: { readonly artifacts: readonly TaskArtifact[]; readonly integrations: readonly IntegrationRef[]; readonly labels: TaskPanelLabels; readonly onView?: ((target: TaskArtifact | IntegrationRef) => void) | undefined }): ReactNode {
  if (artifacts.length === 0 && integrations.length === 0) return createElement('div', { 'data-testid': 'task-artifacts-empty' }, `${labels.artifacts}: ${labels.noArtifacts} · ${labels.pullRequest}: ${labels.noPullRequest}`)
  const rows: ReactNode[] = []
  for (const artifact of artifacts) rows.push(createElement('div', { key: artifact.id, 'data-testid': `task-artifact-${artifact.id}` }, `${labels.artifacts}: ${artifact.kind} · ${artifact.status} · ${artifact.uri}`, ActionButton({ label: labels.view, onClick: onView ? () => onView(artifact) : undefined, disabled: !onView })))
  for (const integration of integrations) rows.push(createElement('div', { key: integration.id, 'data-testid': `task-integration-${integration.id}` }, `${labels.pullRequest}: ${integration.provider} · ${integration.status} · ${integration.url}`, ActionButton({ label: labels.view, onClick: onView ? () => onView(integration) : undefined, disabled: !onView })))
  return createElement('div', { 'data-testid': 'task-artifact-card', style: { display: 'grid', gap: 2 } }, ...rows)
}

type TaskNodeProps = Omit<TaskPanelTreeProps, 'nodes'> & { readonly treeNode: TaskTreeNode }

function TaskNode({ treeNode, projection, labels, expandedIds, onOpen, onContinue, onView, onToggle, onExpand, onCollapse }: TaskNodeProps): ReactNode {
  const node = treeNode
  const expanded = expandedIds?.has(node.task.id)
  const artifacts = projection.artifacts.filter(value => value.taskId === node.task.id)
  const integrations = projection.integrations.filter(value => value.taskId === node.task.id)
  const onDetailsToggle = (event: { readonly currentTarget: { readonly open: boolean } }) => {
    const open = event.currentTarget.open
    onToggle?.(node.task.id, open)
    if (open) onExpand?.(node.task.id)
    else onCollapse?.(node.task.id)
  }
  const children: ReactNode = node.children.length > 0
    ? createElement('div', { role: 'group', style: { marginLeft: 14, borderLeft: '1px solid currentColor', paddingLeft: 8 } }, ...node.children.map(child => createElement(TaskNode, { key: child.task.id, treeNode: child, projection, labels, expandedIds, onOpen, onContinue, onView, onToggle, onExpand, onCollapse })))
    : null
  const reason = node.task.status === 'blocked'
    ? ` · ${labels.blocked}: ${node.task.blockedReason ?? labels.noReason}`
    : node.task.status === 'failed'
      ? ` · ${labels.failed}: ${node.task.blockedReason ?? labels.noReason}`
      : ''
  const attempt = attemptsLabel(node, projection, labels)
  return createElement('details', { open: expanded, onToggle: onDetailsToggle, 'data-task-id': node.task.id },
    createElement('summary', { style: { cursor: 'pointer' } }, `${node.task.title} · ${statusLabel(node.task.status)}${reason}`),
    createElement('div', { style: { display: 'grid', gap: 4, padding: '5px 0 7px 15px' } },
      createElement('div', null, `${labels.status}: ${statusLabel(node.task.status)}`),
      createElement('div', null, sessionLabel(node, labels)),
      createElement('div', null, descendantsLabel(node, labels)),
      attempt ? createElement('div', null, attempt) : null,
      node.task.status === 'blocked' ? createElement('div', { role: 'alert' }, `${labels.blocked}: ${node.task.blockedReason ?? labels.noReason}`) : null,
      node.task.status === 'failed' ? createElement('div', { role: 'alert' }, `${labels.failed}: ${node.task.blockedReason ?? labels.noReason}`) : null,
      createElement('div', null, checksLabel(node.task.id, projection, labels)),
      createElement('div', null, cleanupLabel(node.task.id, projection, labels)),
      createElement('div', null, `${labels.acceptance}:`),
      node.task.acceptance.length > 0
        ? createElement('ul', { style: { margin: 0 } }, ...node.task.acceptance.map((criterion, index) => createElement('li', { key: `${node.task.id}-acceptance-${index}` }, `${criterion} · ${labels.acceptancePending}`)))
        : createElement('div', null, labels.noAcceptance),
      createElement(ArtifactCard, { artifacts, integrations, labels, onView }),
      createElement('div', null,
        ActionButton({ label: labels.open, onClick: onOpen ? () => onOpen(node.task.id, node.session?.id ?? null) : undefined, disabled: !onOpen }),
        ActionButton({ label: labels.continue, onClick: onContinue ? () => onContinue(node.task.id, node.session?.id ?? null) : undefined, disabled: !onContinue || node.task.status === 'completed' || node.task.status === 'cancelled' || node.task.status === 'review' }),
      ),
      children,
    ),
  )
}

export function TaskPanelTree(props: TaskPanelTreeProps) {
  return createElement('div', { 'data-testid': 'task-tree', role: 'tree' }, ...props.nodes.map(treeNode => createElement(TaskNode, { key: treeNode.task.id, treeNode, ...props })))
}

export function TaskPanel(props: TaskPanelProps) {
  const labels = labelsOf(props.labels, props.t)
  const data = dataOf(props)
  const nodes = data.kind === 'ready' ? projectTaskTree(data.projection) : []
  const body = data.kind === 'loading'
    ? createElement('div', { role: 'status', 'data-testid': 'task-panel-loading' }, labels.loading)
    : data.kind === 'unavailable'
      ? createElement('div', { role: 'status', 'data-testid': 'task-panel-unavailable' }, data.message ?? labels.unavailable)
    : data.kind === 'error'
      ? createElement('div', { role: 'alert', 'data-testid': 'task-panel-error' }, `${labels.error}: ${data.message}`)
      : nodes.length === 0
        ? createElement('div', { 'data-testid': 'task-panel-empty' }, labels.empty)
        : createElement(TaskPanelTree, { nodes, projection: data.projection, labels, expandedIds: props.expandedIds, onOpen: props.onOpen, onContinue: props.onContinue, onView: props.onView, onToggle: props.onToggle, onExpand: props.onExpand, onCollapse: props.onCollapse })
  return createElement('section', { className: props.className, 'data-testid': 'task-panel', 'aria-label': labels.title, style: { display: 'grid', gap: 8, maxWidth: 640, font: 'inherit' } },
    createElement('header', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      createElement('strong', null, labels.title),
      ActionButton({ label: labels.create, onClick: props.onCreate, disabled: !props.onCreate }),
    ),
    body,
  )
}

export function SessionTaskView(props: SessionTaskViewProps) {
  const labels = labelsOf(props.labels, props.t)
  const data = dataOf(props)
  if (data.kind !== 'ready') return createElement(TaskPanel, { ...props, data, labels })
  const nodes = projectSessionTree(data.projection)
  const node = findNode(nodes, props.taskId, props.sessionId)
  if (!node) return createElement('section', { 'data-testid': 'session-task-empty' }, labels.noTask)
  return createElement('section', { 'data-testid': 'session-task-view', 'aria-label': node.task.title, style: { display: 'grid', gap: 6 } },
    createElement('div', null, `${node.task.title} · ${statusLabel(node.task.status)}`),
    createElement(TaskPanelTree, { nodes: [node], projection: data.projection, labels, expandedIds: props.expandedIds, onOpen: props.onOpen, onContinue: props.onContinue, onView: props.onView, onToggle: props.onToggle, onExpand: props.onExpand, onCollapse: props.onCollapse }),
  )
}

/** Adapter used by the public conversation.view registration. */
export function TaskPanelView(props: TaskPanelViewProps) {
  const source = props.taskPanelSource
  const getSnapshot = () => source?.getSnapshot(props) ?? unavailableTaskPanelData
  const subscribe = (listener: () => void) => source?.subscribe(props, listener) ?? (() => {})
  const data = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return createElement(TaskPanel, { data, t: props.t, ...bindTaskPanelActions(source, props) })
}
