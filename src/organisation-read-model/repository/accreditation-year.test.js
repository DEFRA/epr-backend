import { describe, expect, it } from 'vitest'

import { deriveAccreditationYear } from './accreditation-year.js'

describe('deriveAccreditationYear', () => {
  it('derives the year from validFrom', () => {
    expect(
      deriveAccreditationYear({ id: 'acc-1', validFrom: '2026-03-01' })
    ).toBe(2026)
  })

  it('throws when validFrom is missing', () => {
    expect(() => deriveAccreditationYear({ id: 'acc-1' })).toThrow(
      /missing validFrom/
    )
  })
})
