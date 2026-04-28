import Boom from '@hapi/boom'
import { describe, expect, it } from 'vitest'

import { badRequest, conflict, enrichBoom, internal } from './enrich-boom.js'

describe('enrichBoom', () => {
  it('attaches code and event to the boom', () => {
    const boom = enrichBoom(Boom.badRequest('msg'), 'some_code', {
      event: { action: 'do_thing', reason: 'because' }
    })

    expect(boom.code).toBe('some_code')
    expect(boom.event).toEqual({ action: 'do_thing', reason: 'because' })
  })

  it('merges payload into output.payload when provided', () => {
    const boom = enrichBoom(Boom.badRequest('msg'), 'c', {
      event: { action: 'a', reason: 'r' },
      payload: { detail: { id: 'x' } }
    })

    expect(boom.output.payload).toMatchObject({ detail: { id: 'x' } })
  })

  it('leaves output.payload untouched when no payload is provided', () => {
    const original = Boom.badRequest('msg')
    const before = { ...original.output.payload }

    const boom = enrichBoom(original, 'c', {
      event: { action: 'a', reason: 'r' }
    })

    expect(boom.output.payload).toEqual(before)
  })
})

describe('factories', () => {
  it.each(
    /** @type {Array<{ name: 'badRequest' | 'conflict' | 'internal', factory: typeof badRequest, status: number }>} */ ([
      { name: 'badRequest', factory: badRequest, status: 400 },
      { name: 'conflict', factory: conflict, status: 409 },
      { name: 'internal', factory: internal, status: 500 }
    ])
  )(
    '$name produces a boom with the expected status, code and event',
    ({ factory, status }) => {
      const boom = factory('a message', 'a_code', {
        event: { action: 'an_action', reason: 'a_reason' }
      })

      expect(boom.isBoom).toBe(true)
      expect(boom.output.statusCode).toBe(status)
      expect(boom.code).toBe('a_code')
      expect(boom.event).toEqual({ action: 'an_action', reason: 'a_reason' })
    }
  )
})
