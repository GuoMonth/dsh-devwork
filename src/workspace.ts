import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readlink, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'

const run = promisify(execFile)
const MAX_FILE_BYTES = 8 * 1024 * 1024
const MAX_TOTAL_BYTES = 64 * 1024 * 1024
const MAX_FILES = 10_000
export type WorkspaceEntry = { kind: 'file'; mode: number; bytes: Buffer } | { kind: 'symlink'; target: string }
export interface WorkspaceManifest { fingerprint: string; entries: Map<string, WorkspaceEntry> }

function absent(error: unknown): boolean { return error instanceof Error && 'code' in error && error.code === 'ENOENT' }
/** Read only actual checkout bytes. Git supplies the bounded tracked/unignored namespace, never HEAD contents. */
async function capture(cwd: string, signal: AbortSignal, retainedPaths: readonly string[]): Promise<WorkspaceManifest> {
  signal.throwIfAborted()
  const options = { cwd, signal, env: scrubbedParentEnv(), maxBuffer: 4 * 1024 * 1024, timeout: 10_000 }
  const { stdout: rootOutput } = await run('git', ['rev-parse', '--show-toplevel'], options)
  const root = rootOutput.trim()
  if (resolve(cwd) !== resolve(root) || await realpath(cwd) !== resolve(cwd)) throw new Error('The POC requires cwd to be the canonical Git repository root')
  const { stdout, stderr } = await run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { ...options, encoding: 'buffer' })
  if (stderr.length) throw new Error('Git could not establish complete workspace path coverage')
  const names = stdout.toString('utf8')
  if (!Buffer.from(names).equals(stdout)) throw new Error('Workspace filenames must be lossless UTF-8')
  const paths = [...new Set([...names.split('\0').filter(Boolean), ...retainedPaths])].sort()
  if (paths.length > MAX_FILES) throw new Error('Workspace exceeds the POC file limit')
  const entries = new Map<string, WorkspaceEntry>()
  const hash = createHash('sha256')
  let bytes = 0
  for (const path of paths) {
    signal.throwIfAborted()
    const absolute = resolve(root, path)
    const local = relative(root, absolute)
    if (isAbsolute(path) || local !== path || local === '..' || local.startsWith(`..${sep}`)) throw new Error('Path escapes workspace or is noncanonical')
    try {
      // Never follow a tracked path through a replaced parent directory symlink.
      let parent = dirname(absolute)
      while (parent !== root) {
        if (!(await lstat(parent)).isDirectory()) throw new Error(`Unsupported workspace ancestor: ${path}`)
        parent = dirname(parent)
      }
      const stat = await lstat(absolute)
      let entry: WorkspaceEntry
      if (stat.isSymbolicLink()) {
        const target = await readlink(absolute)
        bytes += Buffer.byteLength(target)
        entry = { kind: 'symlink', target }
      } else if (stat.isFile()) {
        if (stat.size > MAX_FILE_BYTES) throw new Error(`File exceeds the POC size limit: ${path}`)
        if (bytes + stat.size > MAX_TOTAL_BYTES) throw new Error('Workspace exceeds the POC byte limit')
        const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW)
        try {
          const opened = await handle.stat()
          if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino) throw new Error(`Workspace changed while opening: ${path}`)
          const buffer = Buffer.alloc(Math.min(opened.size + 1, MAX_FILE_BYTES + 1))
          let length = 0
          while (length < buffer.length) {
            signal.throwIfAborted()
            const read = await handle.read(buffer, length, buffer.length - length, length)
            if (read.bytesRead === 0) break
            length += read.bytesRead
          }
          if (length > MAX_FILE_BYTES) throw new Error(`File exceeds the POC size limit: ${path}`)
          const after = await handle.stat()
          if (after.size !== length || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) throw new Error(`Workspace changed while reading: ${path}`)
          const content = Buffer.from(buffer.subarray(0, length))
          bytes += content.length
          entry = { kind: 'file', mode: after.mode & 0o111, bytes: content }
        } finally { await handle.close() }
      } else throw new Error(`Unsupported workspace entry: ${path}`)
      if (bytes > MAX_TOTAL_BYTES) throw new Error('Workspace exceeds the POC byte limit')
      entries.set(path, entry)
      hash.update(`${Buffer.byteLength(path)}:${path}:`)
      if (entry.kind === 'file') hash.update(`file:${entry.mode}:${entry.bytes.length}:`).update(entry.bytes)
      else hash.update(`symlink:${Buffer.byteLength(entry.target)}:${entry.target}`)
      hash.update('\0')
    } catch (error) {
      if (!absent(error)) throw error
      // Absence is the same actual content state before/after staging or committing deletion.
    }
  }
  signal.throwIfAborted()
  return { fingerprint: hash.digest('hex'), entries }
}
/** Two matching bounded reads, with no retry. Detects observed instability; does not lock external writers. */
export async function workspaceManifest(cwd: string, signal: AbortSignal, retainedPaths: readonly string[] = []): Promise<WorkspaceManifest> {
  const before = await capture(cwd, signal, retainedPaths)
  const after = await capture(cwd, signal, retainedPaths)
  if (before.fingerprint !== after.fingerprint) throw new Error('Workspace changed during content capture; retry after writers stop')
  return after
}
export async function workspaceFingerprint(cwd: string, signal: AbortSignal, retainedPaths: readonly string[] = []): Promise<string> {
  return (await workspaceManifest(cwd, signal, retainedPaths)).fingerprint
}
export function sameEntry(before: WorkspaceEntry | undefined, after: WorkspaceEntry | undefined): boolean {
  if (before === undefined || after === undefined) return before === after
  if (before.kind === 'symlink') return after.kind === 'symlink' && before.target === after.target
  return after.kind === 'file' && before.mode === after.mode && before.bytes.equals(after.bytes)
}
export function changedPaths(before: WorkspaceManifest, after: WorkspaceManifest): string[] {
  return [...new Set([...before.entries.keys(), ...after.entries.keys()])].filter(path => !sameEntry(before.entries.get(path), after.entries.get(path))).sort()
}
