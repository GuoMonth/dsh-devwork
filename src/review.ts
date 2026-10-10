import type { WorkspaceEntry, WorkspaceManifest } from './workspace.js'
import type { ReviewFileDiff, ReviewSide } from './types.js'

function side(entry: WorkspaceEntry | undefined): ReviewSide {
  if (entry === undefined) return { kind: 'absent' }
  if (entry.kind === 'symlink') return { kind: 'symlink', target: entry.target }
  return { kind: 'file', mode: entry.mode, bytes: entry.bytes.length }
}
function text(entry: WorkspaceEntry | undefined): string | undefined {
  if (entry === undefined) return ''
  if (entry.kind !== 'file' || entry.bytes.includes(0)) return undefined
  const decoded = entry.bytes.toString('utf8')
  return Buffer.from(decoded).equals(entry.bytes) ? decoded : undefined
}
/** Small explicit whole-file adapter, not an import of private official comparison internals. */
export function fileDiff(before: WorkspaceManifest, after: WorkspaceManifest, path: string): ReviewFileDiff {
  const oldEntry = before.entries.get(path)
  const newEntry = after.entries.get(path)
  const oldText = text(oldEntry)
  const newText = text(newEntry)
  const base = { path, before: side(oldEntry), after: side(newEntry) }
  if (oldText === undefined || newText === undefined) return { ...base, kind: 'metadata' }
  // Preserve exact text including missing final newline. No lossy hunk normalization.
  return { ...base, kind: 'text', coarse: true, oldText, newText }
}
export function contentLines(text: string): string[] {
  return text === '' ? [] : (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n')
}
