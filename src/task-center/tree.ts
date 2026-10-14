import type { Task, TaskProjection, TaskSession } from './types.js'

export interface TaskTreeNode {
  readonly task: Task
  readonly session: TaskSession | null
  readonly parentSessionId: string | null
  readonly children: readonly TaskTreeNode[]
  /** Descendant counts are progress evidence, never a replacement for task.status. */
  readonly progress: { readonly total: number; readonly completed: number; readonly cancelled: number; readonly blocked: number }
}

export function taskTree(view: TaskProjection): readonly TaskTreeNode[] {
  const sessions = new Map(view.sessions.map(session => [session.taskId, session]))
  const groups = new Map<string | null, Task[]>()
  for (const task of view.tasks) {
    const group = groups.get(task.parentId) ?? []
    group.push(task)
    groups.set(task.parentId, group)
  }
  const node = (task: Task): TaskTreeNode => {
    const children = (groups.get(task.id) ?? []).map(node)
    const progress = { total: 0, completed: 0, cancelled: 0, blocked: 0 }
    for (const child of children) {
      progress.total += child.progress.total + 1
      progress.completed += child.progress.completed + Number(child.task.status === 'completed')
      progress.cancelled += child.progress.cancelled + Number(child.task.status === 'cancelled')
      progress.blocked += child.progress.blocked + Number(child.task.status === 'blocked')
    }
    return { task, session: sessions.get(task.id) ?? null, parentSessionId: task.parentId === null ? null : sessions.get(task.parentId)?.id ?? null, children, progress }
  }
  return (groups.get(null) ?? []).map(node)
}
