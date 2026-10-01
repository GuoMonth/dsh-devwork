import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { build } from 'esbuild'

const result = await build({ entryPoints: ['lib/client/index.js'], bundle: true, format: 'cjs', platform: 'browser', target: 'es2022', external: ['react'], write: false })
const output = result.outputFiles[0]
assert.ok(output, 'Missing Client bundle')
assert.ok(!output.text.includes('node:') && !output.text.includes('service.js'), 'Host code leaked into Client output')
await writeFile('lib/client.js', `window.__ModuleLoader__.load({id: '@guosheng_047/dsh-devwork', factory(require) {\nconst module = { exports: {} };\n${output.text}\nreturn module.exports;\n}});\n`)
