import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readFile, readlink } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'

const run = promisify(execFile)
const MAX_FILE_BYTES = 8 * 1024 * 1024
const MAX_TOTAL_BYTES = 64 * 1024 * 1024
const MAX_FILES = 10_000

/** Read-only bounded fingerprint; never changes index, refs, or worktree. */
export async function workspaceFingerprint(cwd: string, signal: AbortSignal, requiredPaths: readonly string[] = []): Promise<string> {
  signal.throwIfAborted()
  const options = { cwd, signal, env: scrubbedParentEnv(), maxBuffer: 4 * 1024 * 1024, timeout: 10_000 }
  const { stdout: rootOutput } = await run('git', ['rev-parse', '--show-toplevel'], options)
  const root = rootOutput.trim()
  if (resolve(cwd) !== resolve(root)) throw new Error('The POC requires cwd to be the Git repository root')
  const { stdout } = await run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], options)
  const paths = [...new Set(stdout.split('\0').filter(Boolean))].sort()
  const covered = new Set(paths)
  for (const path of requiredPaths) if (!covered.has(path)) throw new Error(`Official change snapshot file is not covered by the integration root fingerprint: ${path}`)
  if (paths.length > MAX_FILES) throw new Error('Workspace exceeds the POC file limit')
  const hash = createHash('sha256')
  let bytes = 0
  for (const path of paths) {
    signal.throwIfAborted()
    const absolute = resolve(root, path)
    const local = relative(root, absolute)
    if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) throw new Error('Path escapes workspace')
    hash.update(`${Buffer.byteLength(path)}:${path}:`)
    try {
      const stat = await lstat(absolute)
      if (stat.isSymbolicLink()) hash.update(`symlink:${await readlink(absolute)}\0`)
      else if (stat.isFile()) {
        if (stat.size > MAX_FILE_BYTES) throw new Error(`File exceeds the POC size limit: ${path}`)
        bytes += stat.size
        if (bytes > MAX_TOTAL_BYTES) throw new Error('Workspace exceeds the POC byte limit')
        const content = await readFile(absolute, { signal })
        hash.update(`${stat.mode & 0o111}:${content.length}:`).update(content).update('\0')
      } else throw new Error(`Unsupported workspace entry: ${path}`)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') hash.update('missing\0')
      else throw error
    }
  }
  signal.throwIfAborted()
  return hash.digest('hex')
}
