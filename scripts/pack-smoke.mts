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
  for (const path of ['lib/index.js', 'lib/index.d.ts', 'lib/client.js', 'lib/client/index.d.ts', 'cordis.patch.yml', 'icon.svg', 'locale/en.json', 'locale/zh.json', 'README.md', 'README.zh.md', 'LICENSE']) {
    assert.ok(paths.includes(path), `Tarball is missing ${path}`)
  }
  assert.ok(!paths.some((path) => /^(src|scripts|tests|node_modules|\.github)\//.test(path)), 'Unexpected source/development content in published package')
  execFileSync('tar', ['-xzf', join(temporary, filename), '-C', temporary])
  const pkg = record(parseJson(readFileSync(join(temporary, 'package/package.json'), 'utf8')))
  // Install the tarball as a real consumer dependency; shared APIs resolve as peers.
  // Peer resolution needs registry metadata even when npm ci cached tarballs.
  execFileSync('npm', ['install', join(temporary, filename), '--omit=dev', '--no-audit', '--no-fund'], { cwd: temporary, stdio: ['ignore', 'pipe', 'inherit'] })
  const entry = record(await import(pathToFileURL(join(temporary, 'node_modules', string(pkg.name), string(pkg.main))).href))
  assert.equal(entry.name, 'dsh-devwork')
  assert.equal(typeof entry.apply, 'function')
  assert.ok(!paths.includes('scripts/prepare-types.mts'), 'Development declaration correction must not be published')
  console.log(`Packed entry imported successfully: ${filename}; ${paths.length} files`)
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
