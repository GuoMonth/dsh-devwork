import assert from 'node:assert/strict'
import { test } from 'node:test'
import { StartAction } from '../../lib/client/index.js'
import type { StartProps } from '../../lib/client/index.js'

test('building the start request button is pure and exposes an explicit button action', () => {
  const unexpected = (): never => { throw new Error('Rendering must not edit a draft or submit a request') }
  const actions: StartProps['inputActions'] = {
    captureInsertion: unexpected, insertText: unexpected, setDraft: unexpected, persistDraft: unexpected,
    addAttachments: unexpected, removeAttachment: unexpected, pruneAttachments: unexpected, submit: unexpected,
  }
  const element = StartAction({ inputActions: actions, t: key => `translated:${key}` })
  assert.equal(element.type, 'button')
  assert.equal(element.props.type, 'button')
  assert.equal(element.props.title, 'translated:hint')
  assert.equal(typeof element.props.onClick, 'function')
})
