import type { Context } from '@deepseek-ai/cordis'
import { Devwork } from './service.js'

export const name = 'dsh-devwork'
export const inject = ['agents', 'agentTeams', 'tools', 'systemPrompt', 'workspaceChanges']
export { Devwork }
export type * from './types.js'

/**
 * Host feature whose dependencies and resources are owned by Cordis.
 */
export function apply(ctx: Context): void { ctx.plugin(Devwork) }
