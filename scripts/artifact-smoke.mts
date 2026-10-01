import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { array, parseJson, record, string } from './data.mts'

const root = new URL('../', import.meta.url)
const read = (path: string): string => readFileSync(new URL(path, root), 'utf8')
const pkg = record(parseJson(read('package.json')))
const dsh = record(pkg.dsh)
const patchPath = string(record(dsh.bundle).patch)
const main = string(pkg.main)
const name = string(pkg.name)
assert.equal(patchPath, './cordis.patch.yml')
assert.equal(record(pkg.peerDependencies)['@deepseek-ai/cordis'], record(pkg.devDependencies)['@deepseek-ai/cordis'])
assert.ok(array(pkg.keywords).includes('dsh-plugin'))
assert.equal(record(pkg.publishConfig).access, 'public')
assert.equal(record(pkg.publishConfig).tag, 'alpha')
assert.equal(dsh.profile, undefined, 'A bundle must not also declare a profile')

const patch: unknown = parse(read(patchPath))
assert.deepEqual(patch, [{ insert: [{ id: 'guomonth-devwork', name: pkg.name }] }])
for (const language of ['en', 'zh']) {
  const meta = record(record(parseJson(read(`locale/${language}.json`))).meta)
  assert.equal(meta.title, 'DSH Devwork')
  assert.ok(string(meta.description).length > 0)
}
for (const path of [main, string(pkg.types), string(pkg.icon), 'README.md', 'README.zh.md', 'LICENSE']) {
  assert.ok(existsSync(new URL(path, root)), `Missing package artifact: ${path}`)
}
const plugin = record(await import(new URL(main, root).href))
assert.equal(plugin.name, 'dsh-devwork')
assert.equal(typeof plugin.apply, 'function')
assert.ok(!read(main).includes('@deepseek-ai/cordis'), 'Host peer must not be bundled into runtime JS')

// A self-referencing import exercises the public package exports map.
const publicEntry = record(await import(name))
assert.equal(publicEntry.apply, plugin.apply)
console.log(`Bundle artifacts verified: ${name}@${string(pkg.version)} (${fileURLToPath(root)})`)
