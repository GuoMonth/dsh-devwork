import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { replay } from './projection.js'
import { TaskDomainError } from './types.js'
import { parseTaskLog } from './validation.js'
import type { TaskLogStore } from './store.js'
import type { TaskLog } from './types.js'

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

/** Local snapshot of the event log; restoring it never resumes an Agent. */
export class FileTaskLogStore implements TaskLogStore {
  constructor(private readonly path: string) {}

  async load(): Promise<unknown> {
    let source: string
    try { source = await readFile(this.path, 'utf8') }
    catch (error) {
      if (hasCode(error, 'ENOENT')) return { version: 1, events: [] }
      throw error
    }
    try {
      const value: unknown = JSON.parse(source)
      return value
    } catch (cause) {
      throw new TaskDomainError('Task log is not valid JSON; the file was preserved', { cause })
    }
  }

  async save(log: TaskLog, expectedRevision: number): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const lockPath = `${this.path}.lock`
    // Fail closed on contention or an abandoned lock. No automatic crash recovery.
    const lock = await open(lockPath, 'wx', 0o600)
    const temporary = `${this.path}.${randomUUID()}.tmp`
    try {
      const current = replay(parseTaskLog(await this.load()))
      if (current.revision !== expectedRevision) throw new TaskDomainError('Task log changed; reload before writing')
      const validated = parseTaskLog(log)
      if (replay(validated).revision !== expectedRevision + 1) throw new TaskDomainError('Expected one new task event')
      const file = await open(temporary, 'wx', 0o600)
      try {
        await file.writeFile(JSON.stringify(validated) + '\n', 'utf8')
        await file.sync()
      } finally { await file.close() }
      await rename(temporary, this.path)
    } finally {
      await lock.close()
      await rm(temporary, { force: true })
      await rm(lockPath)
    }
  }
}
