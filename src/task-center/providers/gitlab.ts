import type { DeliveryChecks, DeliveryReviewStatus, IntegrationStatus } from '../types.js'
import { bool, encodedProject, iso, number, object, requestJson, text, type FetchLike } from './http.js'
import { ProviderHttpError } from './types.js'
import type { DeliveryProvider, ProviderCreateRequest, ProviderCredentials, ProviderIntegration, ProviderRef } from './types.js'

export interface GitlabOptions {
  readonly fetch?: FetchLike
  readonly credentials: ProviderCredentials
  readonly baseUrl?: string
}
function baseUrl(value: string | undefined): URL {
  const parsed = new URL(value ?? 'https://gitlab.com/api/v4/')
  if (parsed.protocol !== 'https:') throw new ProviderHttpError('GitLab API base URL must use HTTPS')
  return parsed
}
function path(api: URL, suffix: string): URL { return new URL(suffix.replace(/^\//, ''), api) }
function checks(status: DeliveryChecks['status'], summary: string): DeliveryChecks { return { status, summary, updatedAt: new Date().toISOString() } }
function review(status: DeliveryReviewStatus, summary: string): { readonly status: DeliveryReviewStatus; readonly summary: string; readonly updatedAt: string } { return { status, summary, updatedAt: new Date().toISOString() } }
function mergeStatus(value: unknown, field: string): string { return text(value, field).toLowerCase() }
function parseMr(value: unknown, fallback: ProviderCreateRequest | ProviderRef): { readonly providerRef: string; readonly url: string; readonly sourceRef: string; readonly targetRef: string; readonly headSha: string; readonly state: string; readonly draft: boolean; readonly mergedAt: string | null; readonly closedAt: string | null; readonly detailed: string | null } {
  const item = object(value, 'GitLab merge request response must be an object')
  return { providerRef: String(number(item.iid, 'merge request IID')), url: text(item.web_url, 'merge request URL'), sourceRef: text(item.source_branch, 'source branch'), targetRef: text(item.target_branch, 'target branch'), headSha: text(item.sha, 'head SHA'), state: mergeStatus(item.state, 'merge request state'), draft: item.draft === undefined ? Boolean(item.work_in_progress) : bool(item.draft, 'draft'), mergedAt: iso(item.merged_at, 'merged_at'), closedAt: iso(item.closed_at, 'closed_at'), detailed: item.detailed_merge_status === undefined || item.detailed_merge_status === null ? null : text(item.detailed_merge_status, 'detailed merge status') }
}
function statusOf(mr: ReturnType<typeof parseMr>, check: DeliveryChecks, reviewState: ReturnType<typeof review>): IntegrationStatus {
  if (mr.mergedAt !== null || mr.state === 'merged') return 'merged'
  if (mr.state === 'closed') return 'closed'
  if (mr.draft) return 'draft'
  if (check.status === 'failing') return 'checks_failed'
  if (reviewState.status === 'changes_requested') return 'changes_requested'
  if (reviewState.status === 'approved') return 'approved'
  if (check.status === 'passing') return 'reviewable'
  return 'open'
}
function pipelineChecks(value: unknown): DeliveryChecks {
  if (!Array.isArray(value)) throw new ProviderHttpError('GitLab pipelines response must be an array')
  if (value.length === 0) return checks('pending', 'No pipeline reported')
  const statuses = value.map(entry => mergeStatus(object(entry, 'GitLab pipeline must be an object').status, 'pipeline status'))
  if (statuses.some(status => ['failed', 'canceled', 'skipped'].includes(status))) return checks('failing', 'A pipeline failed')
  if (statuses.some(status => !['success'].includes(status))) return checks('pending', 'Pipelines are still running')
  return checks('passing', 'All reported pipelines passed')
}
function approval(value: unknown): { readonly status: DeliveryReviewStatus; readonly summary: string; readonly updatedAt: string } {
  const item = object(value, 'GitLab approvals response must be an object')
  if (item.approved === true) return review('approved', 'Merge request approved')
  if (item.approved === false && item.approved_by !== undefined && Array.isArray(item.approved_by) && item.approved_by.length > 0) return review('changes_requested', 'Approval state requires changes')
  return review('pending', 'No approval recorded')
}

/** GitLab v4 REST adapter. Tokens and fetch are injected and never included in errors. */
export class GitLabProvider implements DeliveryProvider {
  readonly provider = 'gitlab' as const
  private readonly fetcher: FetchLike
  private readonly api: URL
  constructor(private readonly options: GitlabOptions) {
    this.fetcher = options.fetch ?? (async (input, init) => globalThis.fetch(input, init))
    this.api = baseUrl(options.baseUrl)
  }
  private async call(url: URL, init: RequestInit = {}, signal?: AbortSignal): Promise<unknown> { const request = signal === undefined ? init : { ...init, signal }; return requestJson(this.fetcher, this.options.credentials, url, request, 'PRIVATE-TOKEN') }
  async create(request: ProviderCreateRequest, signal?: AbortSignal): Promise<ProviderIntegration> {
    const project = encodedProject(request.repository)
    const value = await this.call(path(this.api, `/projects/${project}/merge_requests`), { method: 'POST', body: JSON.stringify({ source_branch: request.sourceRef, target_branch: request.targetRef, title: request.title, description: request.body ?? '', draft: request.draft ?? false }) }, signal)
    const mr = parseMr(value, request)
    const check = checks('pending', 'Pipelines not reported yet')
    const reviewState = review('pending', 'No approval recorded')
    return { provider: 'gitlab', providerRef: mr.providerRef, repository: request.repository, url: mr.url, sourceRef: mr.sourceRef, targetRef: mr.targetRef, headSha: mr.headSha, status: statusOf(mr, check, reviewState), checks: check, review: reviewState, mergedAt: mr.mergedAt, closedAt: mr.closedAt }
  }
  async refresh(reference: ProviderRef, signal?: AbortSignal): Promise<ProviderIntegration> {
    const project = encodedProject(reference.repository)
    const mrValue = await this.call(path(this.api, `/projects/${project}/merge_requests/${encodeURIComponent(reference.providerRef)}`), {}, signal)
    const mr = parseMr(mrValue, reference)
    const [pipelineValue, approvalValue] = await Promise.all([
      this.call(path(this.api, `/projects/${project}/merge_requests/${encodeURIComponent(mr.providerRef)}/pipelines`), {}, signal),
      this.call(path(this.api, `/projects/${project}/merge_requests/${encodeURIComponent(mr.providerRef)}/approvals`), {}, signal),
    ])
    const check = pipelineChecks(pipelineValue)
    const reviewState = approval(approvalValue)
    return { provider: 'gitlab', providerRef: mr.providerRef, repository: reference.repository, url: mr.url, sourceRef: mr.sourceRef, targetRef: mr.targetRef, headSha: mr.headSha, status: statusOf(mr, check, reviewState), checks: check, review: reviewState, mergedAt: mr.mergedAt, closedAt: mr.closedAt }
  }
  async merge(reference: ProviderRef, signal?: AbortSignal): Promise<ProviderIntegration> {
    const project = encodedProject(reference.repository)
    const value = await this.call(path(this.api, `/projects/${project}/merge_requests/${encodeURIComponent(reference.providerRef)}/merge`), { method: 'PUT', body: JSON.stringify({ sha: reference.headSha }) }, signal)
    const mr = parseMr(value, reference)
    if (mr.state !== 'merged' && mr.mergedAt === null) throw new ProviderHttpError('GitLab did not merge the merge request')
    const check = checks('passing', 'Merged by GitLab')
    const reviewState = review('approved', 'Merged by GitLab')
    return { provider: 'gitlab', providerRef: mr.providerRef, repository: reference.repository, url: mr.url, sourceRef: mr.sourceRef, targetRef: mr.targetRef, headSha: mr.headSha, status: 'merged', checks: check, review: reviewState, mergedAt: mr.mergedAt ?? new Date().toISOString(), closedAt: mr.closedAt ?? new Date().toISOString() }
  }
}
export const GitLabMergeRequestProvider = GitLabProvider
export const GitLabProviderAdapter = GitLabProvider
