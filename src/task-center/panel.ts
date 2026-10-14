import type { IntegrationRef, TaskArtifact, TaskProjection } from './types.js'

/** Minimal view identity accepted at the Host/Client bridge. */
export interface TaskPanelViewContext {
  readonly sessionId?: string | undefined
}

export type TaskPanelData =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable'; readonly message?: string | undefined }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly projection: TaskProjection }

/** Host-owned projection and command boundary consumed by the public Client slot. */
export interface TaskPanelSource {
  /** Scope the boundary to one selected Conversation Session. */
  readonly forSession?: ((sessionId: string) => TaskPanelSource) | undefined
  getSnapshot(view: TaskPanelViewContext): TaskPanelData
  subscribe(view: TaskPanelViewContext, listener: () => void): () => void
  readonly actions: {
    create?(view: TaskPanelViewContext, input?: unknown): void | Promise<void>
    open?(taskId: string, sessionId: string | null, view: TaskPanelViewContext): void | Promise<void>
    continue?(taskId: string, sessionId: string | null, view: TaskPanelViewContext): void | Promise<void>
    view?(target: TaskArtifact | IntegrationRef, view: TaskPanelViewContext): void | Promise<void>
    /** User-facing authorization handoff; it never performs a merge itself. */
    authorize?(integrationId: string, view: TaskPanelViewContext): void | Promise<void>
    merge?(integrationId: string, authorization: unknown, view: TaskPanelViewContext): void | Promise<void>
  }
}

export const unavailableTaskPanelData: TaskPanelData = { kind: 'unavailable' }
