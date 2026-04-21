import { describe, expect, it } from 'vitest'
import { isRegistrationAccredited } from './is-registration-accredited.js'

describe('isRegistrationAccredited', () => {
  it.each([
    { status: 'approved', expected: true },
    { status: 'suspended', expected: true },
    { status: 'created', expected: false },
    { status: 'rejected', expected: false },
    { status: 'cancelled', expected: false }
  ])(
    'returns $expected when linked accreditation status is $status',
    ({ status, expected }) => {
      expect(
        isRegistrationAccredited({
          accreditationId: 'acc-1',
          accreditation: { status }
        })
      ).toBe(expected)
    }
  )

  it('returns false when accreditation is null (accreditationId points to nothing)', () => {
    expect(
      isRegistrationAccredited({
        accreditationId: 'acc-1',
        accreditation: null
      })
    ).toBe(false)
  })
})
