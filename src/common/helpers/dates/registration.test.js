import { describe, expect, it } from 'vitest'
import { isRegistrationActiveInYear } from './registration.js'

/** @import {Registration} from '#domain/organisations/registration.js' */

/**
 * @param {Partial<Registration>} [overrides]
 * @returns {Registration}
 */
const buildRegistration = (overrides = {}) =>
  /** @type {Registration} */ ({
    status: 'approved',
    validFrom: '2025-01-01',
    statusHistory: [],
    ...overrides
  })

describe('isRegistrationActiveInYear', () => {
  it('is true when approved and validFrom is on or before the year ends', () => {
    expect(
      isRegistrationActiveInYear(
        buildRegistration({ validFrom: '2025-06-01' }),
        2025
      )
    ).toBe(true)
  })

  it('is true for a later year, since a registration never expires', () => {
    expect(
      isRegistrationActiveInYear(
        buildRegistration({ validFrom: '2025-06-01' }),
        2030
      )
    ).toBe(true)
  })

  it('is false for a year before validFrom', () => {
    expect(
      isRegistrationActiveInYear(
        buildRegistration({ validFrom: '2026-01-01' }),
        2025
      )
    ).toBe(false)
  })

  it.each(/** @type {const} */ (['created', 'rejected', 'cancelled']))(
    'is false when status is %s',
    (status) => {
      expect(
        isRegistrationActiveInYear(
          buildRegistration({ status, validFrom: '2025-01-01' }),
          2025
        )
      ).toBe(false)
    }
  )
})
