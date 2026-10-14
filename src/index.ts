import type { Context } from '@deepseek-ai/cordis'
import { Devwork } from './service.js'

export const name = 'dsh-devwork'
export const inject = ['agents', 'agentTeams', 'tools', 'systemPrompt', 'workspaceChanges', 'workingDirectory']
export { Devwork }
export type * from './types.js'
export * from './task-center/index.js'

/**
 * Host feature whose dependencies and resources are owned by Cordis.
 */
import { TaskPanelHost } from './task-center/host.js'
import type { TaskPanelHostOptions } from './task-center/host.js'

export function apply(ctx: Context, options?: TaskPanelHostOptions): void {
  ctx.plugin(Devwork)
  ctx.plugin(TaskPanelHost, options)
}
