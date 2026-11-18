import { describe, expect, it } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import { isRegistrationActiveInYear } from './registration-active-in-year.js'

describe('isRegistrationActiveInYear', () => {
  /**
   * @param {{ current?: 'approved' | 'cancelled', approvedFrom?: string }} [overrides]
   */
  const buildRegistration = ({
    current = 'approved',
    approvedFrom = '2025-01-01'
  } = {}) => {
    const at = new Date(approvedFrom).toISOString()
    return {
      status: {
        current,
        lastUpdatedAt: at,
        timeline: [{ status: /** @type {const} */ ('approved'), at }]
      }
    }
  }

  it('is true when approved on or before the year ends', () => {
    expect(
      isRegistrationActiveInYear(
        buildRegistration({ approvedFrom: '2025-06-01' }),
        toYear(2025)
      )
    ).toBe(true)
  })

  it('is true for a later year, since a registration never expires', () => {
    expect(
      isRegistrationActiveInYear(
        buildRegistration({ approvedFrom: '2025-06-01' }),
        toYear(2030)
      )
    ).toBe(true)
  })

  it('is false for a year before its approval takes effect', () => {
    expect(
      isRegistrationActiveInYear(
        buildRegistration({ approvedFrom: '2026-01-01' }),
        toYear(2025)
      )
    ).toBe(false)
  })

  it('is false when cancelled', () => {
    expect(
      isRegistrationActiveInYear(
        buildRegistration({ current: 'cancelled', approvedFrom: '2025-01-01' }),
        toYear(2025)
      )
    ).toBe(false)
  })

  it('is false when approved but its timeline holds no approval', () => {
    expect(
      isRegistrationActiveInYear(
        {
          status: {
            current: 'approved',
            lastUpdatedAt: '2025-01-01T00:00:00.000Z',
            timeline: [{ status: 'cancelled', at: '2025-01-01T00:00:00.000Z' }]
          }
        },
        toYear(2025)
      )
    ).toBe(false)
  })
})
