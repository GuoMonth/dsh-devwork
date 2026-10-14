import { ProviderHttpError } from './types.js'
import type { ProviderCredentials } from './types.js'

export interface HttpResponseLike {
  readonly ok: boolean
  readonly status: number
  json(): Promise<unknown>
  text(): Promise<string>
}
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<HttpResponseLike>

export async function credentialToken(credentials: ProviderCredentials): Promise<string> {
  const value = typeof credentials.token === 'function' ? await credentials.token() : credentials.token
  if (typeof value !== 'string' || value.trim().length === 0) throw new ProviderHttpError('Provider credentials returned an empty token')
  return value
}

export async function requestJson(fetcher: FetchLike, credentials: ProviderCredentials, url: URL, init: RequestInit = {}, authHeader = 'authorization'): Promise<unknown> {
  const token = await credentialToken(credentials)
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  headers.set(authHeader, authHeader.toLowerCase() === 'authorization' ? `Bearer ${token}` : token)
  if (init.body !== undefined) headers.set('content-type', 'application/json')
  let response: HttpResponseLike
  try {
    response = await fetcher(url, { ...init, headers })
  } catch (cause) {
    throw new ProviderHttpError(cause instanceof Error ? cause.message : 'Provider request failed')
  }
  if (!response.ok) {
    // Do not include response text: providers can echo credentials or user data.
    throw new ProviderHttpError(`Provider request failed with HTTP ${response.status}`, response.status)
  }
  try { return await response.json() } catch { throw new ProviderHttpError('Provider returned invalid JSON', response.status) }
}

export function object(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ProviderHttpError(message)
  const record: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) record[key] = item
  return record
}
export function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new ProviderHttpError(`Provider response missing ${field}`)
  return value
}
export function optionalText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value, 'text field')
}
export function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new ProviderHttpError(`Provider response has invalid ${field}`)
  return value
}
export function number(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new ProviderHttpError(`Provider response has invalid ${field}`)
  return value
}
export function iso(value: unknown, field: string): string | null {
  const parsed = optionalText(value)
  if (parsed === null) return null
  if (!Number.isFinite(Date.parse(parsed))) throw new ProviderHttpError(`Provider response has invalid ${field}`)
  return new Date(parsed).toISOString()
}
export function pathRepository(repository: string): string {
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) throw new ProviderHttpError('Provider repository must be owner/name')
  return repository
}
export function encodedProject(project: string): string { return encodeURIComponent(project) }
