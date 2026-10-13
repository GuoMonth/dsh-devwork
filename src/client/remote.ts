import type {
  RemoteResult,
  TypertRemoteContribution,
  TypertRemoteNamespace,
  TypertRemoteNamespaceMap,
} from '@deepseek-ai/dsh-typert-protocol'

export interface DevworkRemoteRequest {
  readonly sessionId: string
}
export interface DevworkRemoteCheck {
  readonly command: string
  readonly status: 'not-run' | 'passed' | 'failed' | 'stale'
  readonly detail: string
}
export interface DevworkRemoteBrief {
  readonly roundId: string
  readonly integrationRoot: string
  readonly goal: string
  readonly stage: 'working' | 'needs-attention' | 'ready-for-review'
  readonly completed: number
  readonly total: number
  readonly checks: readonly DevworkRemoteCheck[]
  readonly attention: readonly string[]
  readonly cleanupPending: readonly string[]
}
export type DevworkRemoteSnapshot =
  | { readonly status: 'unavailable' }
  | { readonly status: 'available'; readonly brief: DevworkRemoteBrief }
  | { readonly status: 'error'; readonly error: string }

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'devwork/snapshot': (request: DevworkRemoteRequest, signal?: AbortSignal) => Promise<RemoteResult<DevworkRemoteSnapshot>>
  }
  interface TypertRemoteNamespaceMap {
    devwork: TypertRemoteNamespace<'devwork'>
  }
}

export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: '@guosheng_047/dsh-devwork',
  descriptors: [{
    id: '@guosheng_047/dsh-devwork#devwork/snapshot',
    service: 'devwork',
    namespace: 'devwork',
    method: 'snapshot',
    invocation: { kind: 'direct' },
    parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'src-json' } }],
    cancellation: { parameter: 'signal' },
    result: { mode: 'src-json' },
  }],
}

export type DevworkRemote = TypertRemoteNamespaceMap['devwork']
