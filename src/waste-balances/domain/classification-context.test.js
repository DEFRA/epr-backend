import { describe, it, expect } from 'vitest'

import { toAccreditedPeriod } from './classification-context.js'

describe('toAccreditedPeriod', () => {
  it('returns null for a null accreditation', () => {
    expect(toAccreditedPeriod(null)).toBeNull()
  })

  it('has a null window when the accreditation has no dates', () => {
    const period = toAccreditedPeriod(
      /** @type {any} */ ({
        statusHistory: [{ status: 'created', updatedAt: 0 }]
      })
    )
    expect(period.window).toBeNull()
  })

  it('builds the window from validFrom and validTo', () => {
    const period = toAccreditedPeriod(
      /** @type {any} */ ({
        validFrom: '2025-01-01',
        validTo: '2025-12-31',
        statusHistory: []
      })
    )
    expect(period.window).toEqual({
      validFrom: '2025-01-01',
      validTo: '2025-12-31'
    })
  })

  it('maps statusHistory to a timeline with ISO string timestamps', () => {
    const period = toAccreditedPeriod(
      /** @type {any} */ ({
        validFrom: '2025-01-01',
        validTo: '2025-12-31',
        statusHistory: [
          { status: 'created', updatedAt: Date.UTC(2024, 11, 1, 10) },
          { status: 'approved', updatedAt: '2025-01-01T00:00:00.000Z' }
        ]
      })
    )
    expect(period.timeline).toEqual([
      { status: 'created', at: '2024-12-01T10:00:00.000Z' },
      { status: 'approved', at: '2025-01-01T00:00:00.000Z' }
    ])
  })
})
