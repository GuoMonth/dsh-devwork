import { TaskDomainError } from './types.js'
import { isAbsolute } from 'node:path'
import type { TaskRegistration } from './types.js'

export interface TaskDefinition {
  readonly id: string
  readonly parentId: string | null
  readonly title: string
  readonly goal: string
  readonly scope: readonly string[]
  readonly acceptance: readonly string[]
  readonly dependencyIds: readonly string[]
  readonly workingDirectory: string | null
  readonly executionBoundary: string | null
  readonly sessionId: string | null
  readonly children: readonly TaskDefinition[]
}
export type TaskDefinitionInput = TaskDefinition

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new TaskDomainError('Task definition must be an object')
  return value
}

function fields(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  for (const key of Object.keys(value)) {
    if (!required.includes(key) && !optional.includes(key)) throw new TaskDomainError(`Unknown task definition field: ${key}`)
  }
  for (const key of required) if (!Object.hasOwn(value, key)) throw new TaskDomainError(`Missing task definition field: ${key}`)
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TaskDomainError(`Task definition ${name} must be non-empty text`)
  return value
}

function nullableText(value: unknown, name: string): string | null {
  return value === null || value === undefined ? null : text(value, name)
}

function textList(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value)) throw new TaskDomainError(`Task definition ${name} must be a text array`)
  return value.map(item => text(item, name))
}

function parseNode(input: unknown, parentId: string | null, depth = 0): TaskDefinition {
  if (depth > 32) throw new TaskDomainError('Task definition nesting exceeds 32 levels')
  const value = record(input)
  fields(value, ['id', 'title', 'goal', 'scope', 'acceptance'], ['parentId', 'dependencyIds', 'workingDirectory', 'executionBoundary', 'sessionId', 'children'])
  const id = text(value.id, 'id')
  if (value.parentId !== undefined && value.parentId !== parentId) throw new TaskDomainError('Task definition parent conflicts with its tree position')
  if (value.children !== undefined && !Array.isArray(value.children)) throw new TaskDomainError('Task definition children must be an array')
  const children = Array.isArray(value.children) ? value.children.map(child => parseNode(child, id, depth + 1)) : []
  const acceptance = textList(value.acceptance, 'acceptance')
  if (acceptance.length === 0) throw new TaskDomainError('Task requires acceptance criteria')
  const workingDirectory = nullableText(value.workingDirectory, 'workingDirectory')
  if (workingDirectory !== null && !isAbsolute(workingDirectory)) throw new TaskDomainError('Task workingDirectory must be absolute')
  return {
    id,
    parentId,
    title: text(value.title, 'title'),
    goal: text(value.goal, 'goal'),
    scope: [...textList(value.scope, 'scope')],
    acceptance,
    dependencyIds: value.dependencyIds === undefined ? [] : [...textList(value.dependencyIds, 'dependencyIds')],
    workingDirectory,
    executionBoundary: nullableText(value.executionBoundary, 'executionBoundary'),
    sessionId: nullableText(value.sessionId, 'sessionId'),
    children,
  }
}

/** Strictly validate planner output at the unknown boundary. */
export function parseTaskDefinition(input: unknown): TaskDefinition {
  const root = parseNode(input, null)
  const ids = new Set<string>()
  const visit = (node: TaskDefinition): void => {
    if (ids.has(node.id)) throw new TaskDomainError(`Duplicate task definition: ${node.id}`)
    ids.add(node.id)
    for (const child of node.children) visit(child)
  }
  visit(root)
  return root
}
export const parseTaskDefinitionInput = parseTaskDefinition
export const parseTaskIntake = parseTaskDefinition

export interface FlatTaskDefinition {
  readonly definition: TaskDefinition
  readonly parentId: string | null
}

/** Return a stable pre-order view, assigning parent IDs from the nested plan. */
export function flattenTaskDefinition(root: TaskDefinition): readonly FlatTaskDefinition[] {
  const values: FlatTaskDefinition[] = []
  const visit = (node: TaskDefinition, parentId: string | null): void => {
    values.push({ definition: node, parentId })
    for (const child of node.children) visit(child, node.id)
  }
  visit(root, null)
  return values
}

export function taskRegistration(value: FlatTaskDefinition): TaskRegistration {
  const node = value.definition
  return { id: node.id, parentId: value.parentId, title: node.title, goal: node.goal, scope: [...node.scope], acceptance: [...node.acceptance], dependencyIds: [...node.dependencyIds], workingDirectory: node.workingDirectory, executionBoundary: node.executionBoundary, sessionId: node.sessionId ?? `session:${node.id}` }
}
