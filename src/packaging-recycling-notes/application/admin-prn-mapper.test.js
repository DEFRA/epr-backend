import { describe, it, expect } from 'vitest'

import { mapToAdminPrn } from './admin-prn-mapper.js'
import { createMockIssuedPrn } from '#packaging-recycling-notes/routes/test-helpers.js'

describe('mapToAdminPrn', () => {
  it('maps core fields', () => {
    const prn = createMockIssuedPrn()

    const mapped = mapToAdminPrn(prn)

    expect(mapped.id).toBe(prn.id)
    expect(mapped.prnNumber).toBe(prn.prnNumber)
    expect(mapped.status).toBe(prn.status.currentStatus)
    expect(mapped.accreditationYear).toBe(prn.accreditation.accreditationYear)
    expect(mapped.tonnage).toBe(prn.tonnage)
    expect(mapped.organisationName).toBe(prn.organisation.name)
  })
})
