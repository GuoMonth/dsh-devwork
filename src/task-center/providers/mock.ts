import type { DeliveryChecks, DeliveryReviewStatus, IntegrationProvider, IntegrationStatus } from '../types.js'
import type { DeliveryProvider, ProviderCreateRequest, ProviderIntegration, ProviderRef } from './types.js'

export interface MockProviderState {
  readonly providerRef: string
  readonly repository: string
  readonly url: string
  readonly sourceRef: string
  readonly targetRef: string
  readonly headSha: string
  readonly status: IntegrationStatus
  readonly checks: DeliveryChecks
  readonly review: { readonly status: DeliveryReviewStatus; readonly summary: string | null; readonly updatedAt: string | null }
  readonly mergedAt: string | null
  readonly closedAt: string | null
}

/** In-memory provider for integration tests; it never performs network writes. */
export class MockDeliveryProvider implements DeliveryProvider {
  private readonly calls: { readonly operation: 'create' | 'refresh' | 'merge'; readonly reference: string }[] = []
  get requests(): readonly { readonly operation: 'create' | 'refresh' | 'merge'; readonly reference: string }[] { return this.calls }
  private readonly values = new Map<string, MockProviderState>()
  private sequence = 0
  private failure: Error | null = null
  constructor(readonly provider: IntegrationProvider = 'github') {}
  failNext(error = new Error('mock network failure')): void { this.failure = error }
  set(reference: string, value: Partial<MockProviderState> & Pick<MockProviderState, 'repository' | 'sourceRef' | 'targetRef' | 'headSha'>): void {
    const current = this.values.get(reference)
    const now = new Date().toISOString()
    this.values.set(reference, { providerRef: reference, repository: value.repository, url: value.url ?? `https://example.invalid/${value.repository}/${reference}`, sourceRef: value.sourceRef, targetRef: value.targetRef, headSha: value.headSha, status: value.status ?? current?.status ?? 'open', checks: value.checks ?? current?.checks ?? { status: 'pending', summary: null, updatedAt: now }, review: value.review ?? current?.review ?? { status: 'pending', summary: null, updatedAt: now }, mergedAt: value.mergedAt ?? current?.mergedAt ?? null, closedAt: value.closedAt ?? current?.closedAt ?? null })
  }
  private take(operation: 'create' | 'refresh' | 'merge', reference: string): void {
    this.calls.push({ operation, reference })
    if (this.failure !== null) { const error = this.failure; this.failure = null; throw error }
  }
  private output(value: MockProviderState): ProviderIntegration { return { provider: this.provider, ...structuredClone(value) } }
  async create(request: ProviderCreateRequest): Promise<ProviderIntegration> {
    const existing = [...this.values.entries()].find(([, value]) => value.repository === request.repository && value.sourceRef === request.sourceRef && value.targetRef === request.targetRef)
    const id = existing?.[0] ?? `${this.provider}-${++this.sequence}`
    this.take('create', id)
    if (existing !== undefined) return this.output(existing[1])
    this.set(id, { repository: request.repository, sourceRef: request.sourceRef, targetRef: request.targetRef, headSha: request.headSha, status: request.draft === true ? 'draft' : 'open' })
    const value = this.values.get(id)
    if (value === undefined) throw new Error('Mock provider failed to create state')
    return this.output(value)
  }
  async refresh(reference: ProviderRef): Promise<ProviderIntegration> {
    this.take('refresh', reference.providerRef)
    const value = this.values.get(reference.providerRef)
    if (value === undefined) throw new Error(`Unknown mock integration: ${reference.providerRef}`)
    return this.output(value)
  }
  async merge(reference: ProviderRef): Promise<ProviderIntegration> {
    this.take('merge', reference.providerRef)
    const value = this.values.get(reference.providerRef)
    if (value === undefined) throw new Error(`Unknown mock integration: ${reference.providerRef}`)
    const now = new Date().toISOString()
    this.set(reference.providerRef, { ...value, status: 'merged', mergedAt: now, closedAt: now, checks: { ...value.checks, status: 'passing', updatedAt: now }, review: { ...value.review, status: 'approved', updatedAt: now } })
    const merged = this.values.get(reference.providerRef)
    if (merged === undefined) throw new Error('Mock provider failed to merge state')
    return this.output(merged)
  }
}
