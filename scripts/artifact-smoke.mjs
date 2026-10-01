import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const pkg = JSON.parse(read('package.json'))
assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
assert.equal(pkg.peerDependencies['@deepseek-ai/cordis'], pkg.devDependencies['@deepseek-ai/cordis'])
assert.ok(pkg.keywords.includes('dsh-plugin'))
assert.equal(pkg.publishConfig.access, 'public')
assert.equal(pkg.publishConfig.tag, 'alpha')
assert.equal(pkg.dsh.profile, undefined, 'A bundle must not also declare a profile')

const patch = parse(read(pkg.dsh.bundle.patch))
assert.deepEqual(patch, [{ insert: [{ id: 'guomonth-devwork', name: pkg.name }] }])
for (const language of ['en', 'zh']) {
  const locale = JSON.parse(read(`locale/${language}.json`))
  assert.equal(locale.meta.title, 'DSH Devwork')
  assert.ok(locale.meta.description.length > 0)
}
for (const path of [pkg.main, pkg.types, pkg.icon, 'README.md', 'README.zh.md', 'LICENSE']) {
  assert.ok(existsSync(new URL(path, root)), `Missing package artifact: ${path}`)
}
const plugin = await import(new URL(pkg.main, root).href)
assert.equal(plugin.name, 'dsh-devwork')
assert.equal(typeof plugin.apply, 'function')
assert.ok(!read(pkg.main).includes('@deepseek-ai/cordis'), 'Host peer must not be bundled into runtime JS')

// A self-referencing import exercises the public package exports map.
const publicEntry = await import(pkg.name)
assert.equal(publicEntry.apply, plugin.apply)
console.log(`Bundle artifacts verified: ${pkg.name}@${pkg.version} (${fileURLToPath(root)})`)
