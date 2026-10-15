import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-devwork'
export * from './task-center/index.js'

/**
 * Host feature whose dependencies and resources are owned by Cordis.
 */
import { TaskPanelHost } from './task-center/host.js'
import type { TaskPanelHostOptions } from './task-center/host.js'

export function apply(ctx: Context, options?: TaskPanelHostOptions): void {
  ctx.plugin(TaskPanelHost, options)
}
