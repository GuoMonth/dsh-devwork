import type {
  RemoteResult,
  TypertSchema,
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

type JsonRecord = Record<string, unknown>
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function stringField(value: JsonRecord, field: string): string {
  const result = value[field]
  if (typeof result !== 'string') throw new Error(`Invalid Devwork snapshot field: ${field}`)
  return result
}
function stringArrayField(value: JsonRecord, field: string): string[] {
  const result = value[field]
  if (!Array.isArray(result)) throw new Error(`Invalid Devwork snapshot field: ${field}`)
  return result.map(item => { if (typeof item !== 'string') throw new Error(`Invalid Devwork snapshot field: ${field}`); return item })
}
function requestSchema(): TypertSchema {
  return { parse(value: unknown): unknown { if (!isRecord(value)) throw new Error('Invalid Devwork snapshot request'); return { sessionId: stringField(value, 'sessionId') } } }
}
function checkSchema(value: unknown): unknown {
  if (!isRecord(value)) throw new Error('Invalid Devwork snapshot check')
  const status = stringField(value, 'status')
  if (!['not-run', 'passed', 'failed', 'stale'].includes(status)) throw new Error('Invalid Devwork snapshot check status')
  return { command: stringField(value, 'command'), status, detail: stringField(value, 'detail') }
}
function briefSchema(value: unknown): unknown {
  if (!isRecord(value)) throw new Error('Invalid Devwork snapshot brief')
  const completed = value.completed
  const total = value.total
  const checks = value.checks
  const stage = stringField(value, 'stage')
  if (typeof completed !== 'number' || typeof total !== 'number' || !Number.isInteger(completed) || !Number.isInteger(total) || !Array.isArray(checks)) throw new Error('Invalid Devwork snapshot progress')
  if (!['working', 'needs-attention', 'ready-for-review'].includes(stage)) throw new Error('Invalid Devwork snapshot stage')
  return {
    roundId: stringField(value, 'roundId'), integrationRoot: stringField(value, 'integrationRoot'), goal: stringField(value, 'goal'), stage,
    completed, total, checks: checks.map(checkSchema), attention: stringArrayField(value, 'attention'), cleanupPending: stringArrayField(value, 'cleanupPending'),
  }
}
function snapshotSchema(): TypertSchema {
  return { parse(value: unknown): unknown {
    if (!isRecord(value)) throw new Error('Invalid Devwork snapshot')
    const status = stringField(value, 'status')
    if (status === 'unavailable') return { status }
    if (status === 'error') return { status, error: stringField(value, 'error') }
    if (status === 'available') return { status, brief: briefSchema(value.brief) }
    throw new Error('Invalid Devwork snapshot status')
  } }
}

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
    parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'strict', typeSymbol: '@guosheng_047/dsh-devwork#DevworkRemoteRequest', create: requestSchema } }],
    cancellation: { parameter: 'signal' },
    result: { mode: 'strict', typeSymbol: '@guosheng_047/dsh-devwork#DevworkRemoteSnapshot', create: snapshotSchema },
  }],
}

export type DevworkRemote = TypertRemoteNamespaceMap['devwork']
