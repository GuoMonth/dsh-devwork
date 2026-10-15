import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as plugin from '../lib/index.js'
import * as taskCenter from '../lib/task-center/index.js'

test('public package exposes the task-center Host entry without the removed Round service', () => {
  assert.equal(plugin.name, 'dsh-devwork')
  assert.equal(typeof plugin.apply, 'function')
  assert.equal('Devwork' in plugin, false)
  assert.equal('DevelopmentContract' in plugin, false)
  assert.equal('ReviewSnapshot' in plugin, false)
  assert.equal(typeof plugin.TaskPanelHost, 'function')
  assert.equal(plugin.TaskPanelHost, taskCenter.TaskPanelHost)
  assert.equal(typeof plugin.TaskRepository, 'function')
})
