import { describe, expect, it } from 'vitest'

import { toOrganisationNumber } from './numbers.js'

describe('toOrganisationNumber', () => {
  it('accepts a positive whole number', () => {
    expect(toOrganisationNumber('500001')).toBe('500001')
  })

  it.each(['', '0', '0500001', '-1', '5000.1', ' 500001', 'abc'])(
    'rejects %j',
    (value) => {
      expect(() => toOrganisationNumber(value)).toThrow(
        `'${value}' is not an organisation number`
      )
    }
  )
})
