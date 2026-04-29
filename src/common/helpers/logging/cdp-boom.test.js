import { describe, expect, it } from 'vitest'
import { badRequest, classifierTail, conflict, internal } from './cdp-boom.js'

describe('classifierTail', () => {
  it.each([
    {
      label: 'with name and code',
      input: Object.assign(new TypeError('msg'), { code: 'ERR_INVALID_URL' }),
      expected: 'type=TypeError code=ERR_INVALID_URL'
    },
    {
      label: 'with name but no code',
      input: new TypeError('msg'),
      expected: 'type=TypeError code=unknown'
    },
    {
      label: 'with null',
      input: null,
      expected: 'type=Error code=unknown'
    }
  ])('returns "$expected" $label', ({ input, expected }) => {
    expect(classifierTail(input)).toBe(expected)
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

  it('merges payload into output.payload when provided', () => {
    const boom = badRequest('msg', 'a_code', {
      event: { action: 'an_action', reason: 'a_reason' },
      payload: { detail: { id: 'x' } }
    })

    expect(boom.output.payload).toMatchObject({ detail: { id: 'x' } })
  })
})
