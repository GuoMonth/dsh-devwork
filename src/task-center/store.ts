import { parseCommand, parseTaskLog } from './validation.js'
import { applyEvent, replay } from './projection.js'
import { TaskDomainError } from './types.js'
import type { TaskCommand, TaskLog, TaskProjection } from './types.js'

export interface TaskLogStore {
  load(): Promise<unknown>
  /** Atomically reject a stale revision instead of overwriting another writer. */
  save(log: TaskLog, expectedRevision: number): Promise<void>
}

export class MemoryTaskLogStore implements TaskLogStore {
  private value: unknown = { version: 1, events: [] }

  async load(): Promise<unknown> { return structuredClone(this.value) }

  async save(log: TaskLog, expectedRevision: number): Promise<void> {
    if (replay(parseTaskLog(this.value)).revision !== expectedRevision) throw new TaskDomainError('Task log changed; reload before writing')
    if (replay(parseTaskLog(log)).revision !== expectedRevision + 1) throw new TaskDomainError('Expected one new task event')
    this.value = structuredClone(log)
  }
}

export class TaskRepository {
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly store: TaskLogStore, private readonly now: () => Date = () => new Date()) {}

  async snapshot(): Promise<TaskProjection> {
    await this.queue
    return replay(parseTaskLog(await this.store.load()))
  }

  async dispatch(input: unknown): Promise<TaskProjection> {
    // Validate and copy before enqueueing; callers cannot mutate queued commands.
    const command = parseCommand(input)
    const result = this.queue.then(() => this.dispatchNow(command))
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  private async dispatchNow(command: TaskCommand): Promise<TaskProjection> {
    const log = parseTaskLog(await this.store.load())
    const previous = replay(log)
    const event = { sequence: previous.revision + 1, occurredAt: this.now().toISOString(), command } as const
    const next = applyEvent(previous, event)
    await this.store.save({ version: 1, events: [...log.events, event] }, previous.revision)
    return next
  }
}
