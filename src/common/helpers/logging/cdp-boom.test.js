import { describe, expect, it } from 'vitest'
import { badRequest, conflict, internal } from './cdp-boom.js'

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

  it('merges payload into output.payload when provided', () => {
    const boom = badRequest('msg', 'a_code', {
      event: { action: 'an_action', reason: 'a_reason' },
      payload: { detail: { id: 'x' } }
    })

    expect(boom.output.payload).toMatchObject({ detail: { id: 'x' } })
  })
})
