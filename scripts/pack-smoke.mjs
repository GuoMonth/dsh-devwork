import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const temporary = mkdtempSync(join(tmpdir(), 'devwork-pack-'))
try {
  const output = execFileSync('npm', ['pack', '--json', '--pack-destination', temporary], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, npm_config_foreground_scripts: 'false' },
  })
  const [packed] = JSON.parse(output)
  const paths = packed.files.map((entry) => entry.path)
  for (const path of ['lib/index.js', 'lib/index.d.ts', 'cordis.patch.yml', 'icon.svg', 'locale/en.json', 'locale/zh.json', 'README.md', 'README.zh.md', 'LICENSE']) {
    assert.ok(paths.includes(path), `Tarball is missing ${path}`)
  }
  assert.ok(!paths.some((path) => /^(src|scripts|node_modules|\.github)\//.test(path)), 'Unexpected source/development content in published package')
  execFileSync('tar', ['-xzf', join(temporary, packed.filename), '-C', temporary])
  const pkg = JSON.parse(readFileSync(join(temporary, 'package/package.json'), 'utf8'))
  const entry = await import(pathToFileURL(join(temporary, 'package', pkg.main)).href)
  assert.equal(entry.name, 'dsh-devwork')
  assert.equal(typeof entry.apply, 'function')
  console.log(`Packed entry imported successfully: ${packed.filename}; ${paths.length} files`)
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
