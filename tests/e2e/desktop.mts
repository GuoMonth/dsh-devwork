import assert from 'node:assert/strict'
import { access, mkdir, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'

type AcceptanceStatus = 'blocked' | 'failed' | 'passed'
type CheckpointName =
  | 'definition'
  | 'childTaskRegistration'
  | 'oneSessionPerTask'
  | 'taskPanel'
  | 'sessionTree'
  | 'artifact'
  | 'provider'
  | 'mergeAuthorization'
  | 'cleanup'
  | 'failureEvidence'

interface Checkpoints {
  readonly definition: boolean
  readonly childTaskRegistration: boolean
  readonly oneSessionPerTask: boolean
  readonly taskPanel: boolean
  readonly sessionTree: boolean
  readonly artifact: boolean
  readonly provider: boolean
  readonly mergeAuthorization: boolean
  readonly cleanup: boolean
  readonly failureEvidence: boolean
}

interface EvidenceFiles {
  readonly screenshots: readonly string[]
  readonly logs: readonly string[]
  readonly artifacts: readonly string[]
}

interface DriverResult {
  readonly checkpoints: Checkpoints
  readonly evidence: EvidenceFiles
  readonly notes?: readonly string[] | undefined
}

interface DriverContext {
  readonly artifactDirectory: string
  readonly environment: Readonly<Record<string, string>>
}

interface RealE2EDriver {
  run(context: DriverContext): Promise<unknown>
}

interface Preflight {
  readonly status: 'ready' | 'blocked'
  readonly missing: readonly string[]
  readonly checkedAt: string
  readonly nodeVersion: string
  readonly artifactDirectory: string
  readonly desktopExecutable: string | null
  readonly driver: string | null
  readonly desktopVersion: string | null
  readonly dshVersion: string | null
  readonly pluginVersion: string | null
  readonly modelName: string | null
  readonly modelEndpoint: string | null
  readonly provider: string | null
  readonly providerRepository: string | null
  readonly providerTargetRef: string | null
}

interface AcceptanceReport {
  readonly schemaVersion: 1
  readonly status: AcceptanceStatus
  readonly startedAt: string
  readonly finishedAt: string
  readonly preflight: Preflight
  readonly checkpoints?: Checkpoints | undefined
  readonly evidence?: EvidenceFiles | undefined
  readonly notes: readonly string[]
}

const requiredCheckpoints: readonly CheckpointName[] = [
  'definition',
  'childTaskRegistration',
  'oneSessionPerTask',
  'taskPanel',
  'sessionTree',
  'artifact',
  'provider',
  'mergeAuthorization',
  'cleanup',
  'failureEvidence',
]

const text = (value: string | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed
}

const artifactDirectory = resolve(process.env['DSH_DEVWORK_E2E_ARTIFACT_DIR'] ?? join('.artifacts', 'real-e2e'))
const reportPath = join(artifactDirectory, 'acceptance.json')
const logPath = join(artifactDirectory, 'acceptance.log')

function ownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBooleanRecord<Key extends string>(value: unknown, keys: readonly Key[]): value is Record<Key, boolean> {
  if (!ownRecord(value)) return false
  return keys.every((key) => typeof value[key] === 'boolean')
}

function isDriverRun(value: unknown): value is RealE2EDriver['run'] {
  return typeof value === 'function'
}

function parseDriverResult(value: unknown): DriverResult {
  if (!ownRecord(value)) throw new Error('Real desktop driver did not return an object')
  const checkpoints = value.checkpoints
  if (!isBooleanRecord(checkpoints, requiredCheckpoints)) throw new Error('Real desktop driver did not return all required acceptance checkpoints')
  const evidence = value.evidence
  if (!ownRecord(evidence)) throw new Error('Real desktop driver did not return evidence files')
  const readPaths = (candidate: unknown, name: string): readonly string[] => {
    if (!Array.isArray(candidate) || candidate.length === 0 || candidate.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)) throw new Error(`Real desktop driver evidence.${name} must be a non-empty path array`)
    return candidate.map((entry) => entry.trim())
  }
  const notes = value.notes
  if (notes !== undefined && (!Array.isArray(notes) || notes.some((entry) => typeof entry !== 'string'))) throw new Error('Real desktop driver notes must be a string array')
  return {
    checkpoints: {
      definition: checkpoints.definition,
      childTaskRegistration: checkpoints.childTaskRegistration,
      oneSessionPerTask: checkpoints.oneSessionPerTask,
      taskPanel: checkpoints.taskPanel,
      sessionTree: checkpoints.sessionTree,
      artifact: checkpoints.artifact,
      provider: checkpoints.provider,
      mergeAuthorization: checkpoints.mergeAuthorization,
      cleanup: checkpoints.cleanup,
      failureEvidence: checkpoints.failureEvidence,
    },
    evidence: { screenshots: readPaths(evidence.screenshots, 'screenshots'), logs: readPaths(evidence.logs, 'logs'), artifacts: readPaths(evidence.artifacts, 'artifacts') },
    notes: notes === undefined ? undefined : [...notes],
  }
}

async function executableFile(value: string | null): Promise<boolean> {
  if (value === null) return false
  try {
    const details = await stat(value)
    if (!details.isFile()) return false
    await access(value, constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function readableFile(value: string | null): Promise<boolean> {
  if (value === null) return false
  try {
    const details = await stat(value)
    if (!details.isFile()) return false
    await access(value, constants.R_OK)
    return true
  } catch {
    return false
  }
}

async function preflight(): Promise<Preflight> {
  const missing: string[] = []
  if (text(process.env['DSH_DEVWORK_REAL_E2E']) !== '1') missing.push('DSH_DEVWORK_REAL_E2E=1 (explicit real side-effect consent)')
  if (!process.versions.node.startsWith('24.')) missing.push(`Node 24.x (found ${process.versions.node})`)
  const desktopExecutable = text(process.env['DSH_DEVWORK_DESKTOP_EXECUTABLE'])
  if (!(await executableFile(desktopExecutable))) missing.push('DSH_DEVWORK_DESKTOP_EXECUTABLE (an executable isolated DSH desktop)')
  const driver = text(process.env['DSH_DEVWORK_E2E_DRIVER'])
  if (driver === null) missing.push('DSH_DEVWORK_E2E_DRIVER (real desktop/provider driver module)')
  else if (!(await readableFile(driver))) missing.push(`driver module is not readable: ${driver}`)
  for (const [name, env] of [
    ['desktop version', 'DSH_DEVWORK_DESKTOP_VERSION'],
    ['DSH version', 'DSH_DEVWORK_DSH_VERSION'],
    ['plugin version', 'DSH_DEVWORK_PLUGIN_VERSION'],
    ['model name', 'DSH_DEVWORK_MODEL_NAME'],
    ['model endpoint', 'DSH_DEVWORK_MODEL_ENDPOINT'],
    ['model credential', 'DSH_DEVWORK_MODEL_API_KEY'],
    ['provider kind', 'DSH_DEVWORK_PROVIDER'],
    ['provider credential', 'DSH_DEVWORK_PROVIDER_TOKEN'],
    ['provider repository', 'DSH_DEVWORK_PROVIDER_REPOSITORY'],
    ['provider target ref', 'DSH_DEVWORK_PROVIDER_TARGET_REF'],
  ] as const) if (text(process.env[env]) === null) missing.push(`${env} (${name})`)
  return {
    status: missing.length === 0 ? 'ready' : 'blocked',
    missing,
    checkedAt: new Date().toISOString(),
    nodeVersion: process.versions.node,
    artifactDirectory,
    desktopExecutable,
    driver,
    desktopVersion: text(process.env['DSH_DEVWORK_DESKTOP_VERSION']),
    dshVersion: text(process.env['DSH_DEVWORK_DSH_VERSION']),
    pluginVersion: text(process.env['DSH_DEVWORK_PLUGIN_VERSION']),
    modelName: text(process.env['DSH_DEVWORK_MODEL_NAME']),
    modelEndpoint: text(process.env['DSH_DEVWORK_MODEL_ENDPOINT']),
    provider: text(process.env['DSH_DEVWORK_PROVIDER']),
    providerRepository: text(process.env['DSH_DEVWORK_PROVIDER_REPOSITORY']),
    providerTargetRef: text(process.env['DSH_DEVWORK_PROVIDER_TARGET_REF']),
  }
}

async function writeReport(report: AcceptanceReport): Promise<void> {
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

async function writeLog(lines: readonly string[]): Promise<void> {
  await mkdir(dirname(logPath), { recursive: true })
  await writeFile(logPath, `${lines.join('\n')}\n`, 'utf8')
}

async function evidenceFilesExist(evidence: EvidenceFiles): Promise<void> {
  const files = [...evidence.screenshots, ...evidence.logs, ...evidence.artifacts]
  if (files.length === 0) throw new Error('Real desktop driver returned no evidence files')
  for (const file of files) {
    const absolute = isAbsolute(file) ? file : resolve(file)
    try {
      const details = await stat(absolute)
      if (!details.isFile() || details.size === 0) throw new Error(`Evidence file is empty: ${file}`)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Evidence file is empty:')) throw error
      throw new Error(`Evidence file does not exist: ${file}`)
    }
  }
}

function allCheckpointsPassed(checkpoints: Checkpoints): boolean {
  return requiredCheckpoints.every((name) => checkpoints[name])
}

async function loadDriver(path: string): Promise<RealE2EDriver> {
  const loaded: unknown = await import(pathToFileURL(resolve(path)).href)
  if (!ownRecord(loaded) || !isDriverRun(loaded['run'])) throw new Error('DSH_DEVWORK_E2E_DRIVER must export async function run(context)')
  const run = loaded['run']
  return { run }
}

await test('real DSH desktop acceptance (desktop/provider prerequisites are explicit)', async () => {
  const startedAt = new Date().toISOString()
  const checked = await preflight()
  if (checked.status === 'blocked') {
    const reason = `BLOCKED: ${checked.missing.join('; ')}`
    await writeReport({ schemaVersion: 1, status: 'blocked', startedAt, finishedAt: new Date().toISOString(), preflight: checked, notes: [reason] })
    await writeLog([
      'status=blocked',
      `node=${checked.nodeVersion}`,
      `desktop=${checked.desktopVersion ?? 'unknown'}`,
      `dsh=${checked.dshVersion ?? 'unknown'}`,
      `plugin=${checked.pluginVersion ?? 'unknown'}`,
      `model=${checked.modelName ?? 'unknown'}`,
      `provider=${checked.provider ?? 'unknown'}`,
      ...checked.missing.map((item) => `missing=${item}`),
    ])
    assert.fail(`${reason}. Evidence: ${reportPath}`)
  }

  const driverPath = checked.driver
  assert.ok(driverPath)
  try {
    const driver = await loadDriver(driverPath)
    const environment: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) if (value !== undefined && !/TOKEN|KEY|SECRET|PASSWORD/i.test(key)) environment[key] = value
    const result = parseDriverResult(await driver.run({ artifactDirectory, environment }))
    await evidenceFilesExist(result.evidence)
    const status: AcceptanceStatus = allCheckpointsPassed(result.checkpoints) ? 'passed' : 'failed'
    const notes = result.notes ?? []
    await writeReport({ schemaVersion: 1, status, startedAt, finishedAt: new Date().toISOString(), preflight: checked, checkpoints: result.checkpoints, evidence: result.evidence, notes })
    await writeLog([
      `status=${status}`,
      `node=${checked.nodeVersion}`,
      `desktop=${checked.desktopVersion ?? 'unknown'}`,
      `dsh=${checked.dshVersion ?? 'unknown'}`,
      `plugin=${checked.pluginVersion ?? 'unknown'}`,
      `model=${checked.modelName ?? 'unknown'}`,
      `provider=${checked.provider ?? 'unknown'}`,
      ...notes.map((item) => `note=${item}`),
    ])
    assert.equal(status, 'passed', `Real desktop acceptance checkpoints incomplete. Evidence: ${reportPath}`)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await writeReport({ schemaVersion: 1, status: 'failed', startedAt, finishedAt: new Date().toISOString(), preflight: checked, notes: [reason] })
    await writeLog([
      'status=failed',
      `node=${checked.nodeVersion}`,
      `desktop=${checked.desktopVersion ?? 'unknown'}`,
      `dsh=${checked.dshVersion ?? 'unknown'}`,
      `plugin=${checked.pluginVersion ?? 'unknown'}`,
      `model=${checked.modelName ?? 'unknown'}`,
      `provider=${checked.provider ?? 'unknown'}`,
      `error=${reason}`,
    ])
    throw error
  }
})
