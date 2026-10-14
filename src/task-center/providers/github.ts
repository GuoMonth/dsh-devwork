import type { DeliveryChecks, DeliveryReviewStatus, IntegrationStatus } from '../types.js'
import { bool, iso, number, object, pathRepository, requestJson, text, type FetchLike } from './http.js'
import { ProviderHttpError } from './types.js'
import type { DeliveryProvider, ProviderCreateRequest, ProviderCredentials, ProviderIntegration, ProviderRef } from './types.js'

export interface GithubOptions {
  readonly fetch?: FetchLike
  readonly credentials: ProviderCredentials
  readonly baseUrl?: string
}

function baseUrl(value: string | undefined): URL {
  const parsed = new URL(value ?? 'https://api.github.com/')
  if (parsed.protocol !== 'https:') throw new ProviderHttpError('GitHub API base URL must use HTTPS')
  return parsed
}
function path(api: URL, suffix: string): URL { return new URL(suffix.replace(/^\//, ''), api) }
function parseOwner(repository: string): string { return pathRepository(repository) }
function checkSummary(status: DeliveryChecks['status'], summary: string | null, now = new Date().toISOString()): DeliveryChecks { return { status, summary, updatedAt: now } }
function review(status: DeliveryReviewStatus, summary: string | null, now = new Date().toISOString()): { readonly status: DeliveryReviewStatus; readonly summary: string | null; readonly updatedAt: string | null } { return { status, summary, updatedAt: now } }

function checkRuns(value: unknown): readonly Record<string, unknown>[] {
  const root = object(value, 'GitHub checks response must be an object')
  if (!Array.isArray(root.check_runs)) throw new ProviderHttpError('GitHub checks response missing check_runs')
  return root.check_runs.map(item => object(item, 'GitHub check run must be an object'))
}
function checks(value: unknown): DeliveryChecks {
  const runs = checkRuns(value)
  if (runs.length === 0) return checkSummary('pending', 'No check runs reported')
  const statuses = runs.map(run => run.status)
  const conclusions = runs.map(run => run.conclusion)
  if (conclusions.some(item => ['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'].includes(String(item)))) return checkSummary('failing', 'At least one check failed')
  if (statuses.some(item => item !== 'completed')) return checkSummary('pending', 'Checks are still running')
  return checkSummary('passing', 'All reported checks passed')
}
function reviews(value: unknown): { readonly status: DeliveryReviewStatus; readonly summary: string | null; readonly updatedAt: string | null } {
  if (!Array.isArray(value)) throw new ProviderHttpError('GitHub reviews response must be an array')
  let approved = false
  let changes = false
  for (const entry of value) {
    const item = object(entry, 'GitHub review must be an object')
    const state = text(item.state, 'review state').toUpperCase()
    if (state === 'CHANGES_REQUESTED') changes = true
    if (state === 'APPROVED') approved = true
  }
  if (changes) return review('changes_requested', 'A reviewer requested changes')
  if (approved) return review('approved', 'A reviewer approved the change')
  return review('pending', 'No approval recorded')
}
function pull(value: unknown, repository: string, fallback: { sourceRef: string; targetRef: string; headSha: string; providerRef?: string } = { sourceRef: '', targetRef: '', headSha: '' }): { readonly providerRef: string; readonly url: string; readonly sourceRef: string; readonly targetRef: string; readonly headSha: string; readonly draft: boolean; readonly state: string; readonly mergedAt: string | null; readonly closedAt: string | null } {
  const item = object(value, 'GitHub pull response must be an object')
  const head = object(item.head, 'GitHub pull response missing head')
  const base = object(item.base, 'GitHub pull response missing base')
  const providerRef = String(number(item.number, 'pull number'))
  return { providerRef, url: text(item.html_url, 'pull URL'), sourceRef: text(head.ref, 'head ref') || fallback.sourceRef, targetRef: text(base.ref, 'base ref') || fallback.targetRef, headSha: text(head.sha, 'head SHA') || fallback.headSha, draft: item.draft === undefined ? false : bool(item.draft, 'draft'), state: text(item.state, 'pull state').toLowerCase(), mergedAt: iso(item.merged_at, 'merged_at'), closedAt: iso(item.closed_at, 'closed_at') }
}
function statusOf(value: ReturnType<typeof pull>, check: DeliveryChecks, reviewState: ReturnType<typeof review>): IntegrationStatus {
  if (value.mergedAt !== null) return 'merged'
  if (value.state === 'closed') return 'closed'
  if (value.draft) return 'draft'
  if (check.status === 'failing') return 'checks_failed'
  if (reviewState.status === 'changes_requested') return 'changes_requested'
  if (reviewState.status === 'approved') return 'approved'
  if (check.status === 'passing') return 'reviewable'
  return 'open'
}

/** GitHub REST adapter. All transport and credentials are injected for tests. */
export class GitHubProvider implements DeliveryProvider {
  readonly provider = 'github' as const
  private readonly fetcher: FetchLike
  private readonly api: URL
  constructor(private readonly options: GithubOptions) {
    this.fetcher = options.fetch ?? (async (input, init) => globalThis.fetch(input, init))
    this.api = baseUrl(options.baseUrl)
  }
  private async call(url: URL, init: RequestInit = {}, signal?: AbortSignal): Promise<unknown> {
    const request = signal === undefined ? init : { ...init, signal }
    return requestJson(this.fetcher, this.options.credentials, url, request)
  }
  async create(request: ProviderCreateRequest, signal?: AbortSignal): Promise<ProviderIntegration> {
    const repository = parseOwner(request.repository)
    const value = await this.call(path(this.api, `/repos/${repository}/pulls`), { method: 'POST', body: JSON.stringify({ title: request.title, head: request.sourceRef, base: request.targetRef, body: request.body ?? '', draft: request.draft ?? false }) }, signal)
    const created = pull(value, repository, request)
    const check = checkSummary(created.draft ? 'pending' : 'pending', 'Checks not reported yet')
    const reviewState = review('pending', 'No approval recorded')
    return { provider: 'github', providerRef: created.providerRef, repository, url: created.url, sourceRef: created.sourceRef, targetRef: created.targetRef, headSha: created.headSha, status: statusOf(created, check, reviewState), checks: check, review: reviewState, mergedAt: created.mergedAt, closedAt: created.closedAt }
  }
  async refresh(reference: ProviderRef, signal?: AbortSignal): Promise<ProviderIntegration> {
    const repository = parseOwner(reference.repository)
    const pullValue = await this.call(path(this.api, `/repos/${repository}/pulls/${encodeURIComponent(reference.providerRef)}`), {}, signal)
    const item = pull(pullValue, repository, reference)
    const [checkValue, reviewValue] = await Promise.all([
      this.call(path(this.api, `/repos/${repository}/commits/${encodeURIComponent(item.headSha)}/check-runs`), {}, signal),
      this.call(path(this.api, `/repos/${repository}/pulls/${encodeURIComponent(item.providerRef)}/reviews`), {}, signal),
    ])
    const check = checks(checkValue)
    const reviewState = reviews(reviewValue)
    return { provider: 'github', providerRef: item.providerRef, repository, url: item.url, sourceRef: item.sourceRef, targetRef: item.targetRef, headSha: item.headSha, status: statusOf(item, check, reviewState), checks: check, review: reviewState, mergedAt: item.mergedAt, closedAt: item.closedAt }
  }
  async merge(reference: ProviderRef, signal?: AbortSignal): Promise<ProviderIntegration> {
    const repository = parseOwner(reference.repository)
    const value = await this.call(path(this.api, `/repos/${repository}/pulls/${encodeURIComponent(reference.providerRef)}/merge`), { method: 'PUT', body: JSON.stringify({ sha: reference.headSha, merge_method: 'merge' }) }, signal)
    const item = object(value, 'GitHub merge response must be an object')
    if (!bool(item.merged, 'merge result')) throw new ProviderHttpError('GitHub did not merge the pull request')
    const now = new Date().toISOString()
    const check = checkSummary('passing', 'Merged by GitHub')
    return { provider: 'github', providerRef: reference.providerRef, repository, url: text(item.message === undefined ? `https://github.com/${repository}/pull/${reference.providerRef}` : `https://github.com/${repository}/pull/${reference.providerRef}`, 'pull URL'), sourceRef: reference.sourceRef, targetRef: reference.targetRef, headSha: reference.headSha, status: 'merged', checks: check, review: review('approved', 'Merged by GitHub', now), mergedAt: now, closedAt: now }
  }
}
export const GitHubPullRequestProvider = GitHubProvider
export const GitHubProviderAdapter = GitHubProvider
