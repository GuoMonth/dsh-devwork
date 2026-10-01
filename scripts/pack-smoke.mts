import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { array, parseJson, record, string } from './data.mts'

const temporary = mkdtempSync(join(tmpdir(), 'devwork-pack-'))
try {
  const output = execFileSync('npm', ['pack', '--json', '--pack-destination', temporary], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, npm_config_foreground_scripts: 'false' },
  })
  const packed = record(array(parseJson(output))[0])
  const filename = string(packed.filename)
  const paths = array(packed.files).map((entry) => string(record(entry).path))
  for (const path of ['lib/index.js', 'lib/index.d.ts', 'cordis.patch.yml', 'icon.svg', 'locale/en.json', 'locale/zh.json', 'README.md', 'README.zh.md', 'LICENSE']) {
    assert.ok(paths.includes(path), `Tarball is missing ${path}`)
  }
  assert.ok(!paths.some((path) => /^(src|scripts|node_modules|\.github)\//.test(path)), 'Unexpected source/development content in published package')
  execFileSync('tar', ['-xzf', join(temporary, filename), '-C', temporary])
  const pkg = record(parseJson(readFileSync(join(temporary, 'package/package.json'), 'utf8')))
  const entry = record(await import(pathToFileURL(join(temporary, 'package', string(pkg.main))).href))
  assert.equal(entry.name, 'dsh-devwork')
  assert.equal(typeof entry.apply, 'function')
  console.log(`Packed entry imported successfully: ${filename}; ${paths.length} files`)
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
