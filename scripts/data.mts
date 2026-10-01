import assert from 'node:assert/strict'

// JSON, YAML and dynamic imports cross untyped boundaries. Check before use.
export function parseJson(text: string): unknown {
  return JSON.parse(text)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function record(value: unknown): Record<string, unknown> {
  assert.ok(isRecord(value), 'Expected an object')
  return value
}

export function string(value: unknown): string {
  assert.ok(typeof value === 'string', 'Expected a string')
  return value
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

export function array(value: unknown): unknown[] {
  assert.ok(isArray(value), 'Expected an array')
  return value
}
