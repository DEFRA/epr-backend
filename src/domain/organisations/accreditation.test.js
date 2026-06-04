import { describe, expect, it } from 'vitest'
import { isRegisteredOnlyAccreditation } from './accreditation.js'

describe('isRegisteredOnlyAccreditation', () => {
  it.each([
    { status: 'created', expected: true },
    { status: 'rejected', expected: true },
    { status: 'approved', expected: false },
    { status: 'suspended', expected: false },
    { status: 'cancelled', expected: false }
  ])(
    'returns $expected when accreditation status is $status',
    ({ status, expected }) => {
      expect(isRegisteredOnlyAccreditation({ status })).toBe(expected)
    }
  )

  it('returns false when accreditation is null', () => {
    expect(isRegisteredOnlyAccreditation(null)).toBe(false)
  })

  it('returns false when accreditation is undefined', () => {
    expect(isRegisteredOnlyAccreditation(undefined)).toBe(false)
  })
})
