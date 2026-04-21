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

  it('returns false when accreditation is null', () => {
    expect(
      isRegistrationAccredited({
        accreditationId: 'acc-1',
        accreditation: null
      })
    ).toBe(false)
  })

  it('returns false when accreditation field is absent', () => {
    expect(isRegistrationAccredited({})).toBe(false)
  })

  it('returns false when registration is undefined', () => {
    expect(isRegistrationAccredited()).toBe(false)
  })

  it('returns false when registration is null', () => {
    expect(isRegistrationAccredited(null)).toBe(false)
  })
})
