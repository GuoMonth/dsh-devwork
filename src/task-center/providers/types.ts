import type { DeliveryChecks, DeliveryReviewStatus, IntegrationProvider, IntegrationStatus } from '../types.js'

export interface ProviderCredentials {
  /** Read lazily so a token is never retained in a provider log or error. */
  readonly token: string | (() => string | Promise<string>)
}

export interface ProviderCreateRequest {
  readonly repository: string
  readonly sourceRef: string
  readonly targetRef: string
  readonly headSha: string
  readonly title: string
  readonly body?: string | undefined
  readonly draft?: boolean | undefined
}

export interface ProviderIntegration {
  readonly provider: IntegrationProvider
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

export interface ProviderRef {
  readonly provider: IntegrationProvider
  readonly providerRef: string
  readonly repository: string
  readonly sourceRef: string
  readonly targetRef: string
  readonly headSha: string
}

export interface DeliveryProvider {
  readonly provider: IntegrationProvider
  create(request: ProviderCreateRequest, signal?: AbortSignal): Promise<ProviderIntegration>
  refresh(reference: ProviderRef, signal?: AbortSignal): Promise<ProviderIntegration>
  merge(reference: ProviderRef, signal?: AbortSignal): Promise<ProviderIntegration>
}

export class ProviderHttpError extends Error {
  override readonly name = 'ProviderHttpError'
  readonly status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.status = status
  }
}
