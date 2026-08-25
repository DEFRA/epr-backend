import { describe, it, expect } from 'vitest'

import { mapToAdminPrn } from './admin-prn-mapper.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createMockIssuedPrn } from '#packaging-recycling-notes/routes/test-helpers.js'

describe('mapToAdminPrn', () => {
  it('maps core fields', () => {
    const prn = createMockIssuedPrn()

    const mapped = mapToAdminPrn(prn)

    expect(mapped.id).toBe(prn.id)
    expect(mapped.prnNumber).toBe(prn.prnNumber)
    expect(mapped.status).toBe(prn.status.currentStatus)
    expect(mapped.accreditationYear).toBe(prn.accreditation.accreditationYear)
    expect(mapped.obligationYear).toBe(prn.obligationYear)
    expect(mapped.tonnage).toBe(prn.tonnage)
    expect(mapped.organisationName).toBe(prn.organisation.name)
  })

  it('marks an accepted PRN within its cancellation window as regulator-cancellable', () => {
    const futureYear = new Date().getUTCFullYear() + 5
    const prn = createMockIssuedPrn({
      status: {
        ...createMockIssuedPrn().status,
        currentStatus: PRN_STATUS.ACCEPTED
      },
      accreditation: {
        ...createMockIssuedPrn().accreditation,
        accreditationYear: futureYear
      }
    })

    expect(mapToAdminPrn(prn).regulatorCancellable).toBe(true)
  })

  it('marks a PRN past its cancellation window as not regulator-cancellable', () => {
    const prn = createMockIssuedPrn({
      status: {
        ...createMockIssuedPrn().status,
        currentStatus: PRN_STATUS.ACCEPTED
      },
      accreditation: {
        ...createMockIssuedPrn().accreditation,
        accreditationYear: 2000
      }
    })

    expect(mapToAdminPrn(prn).regulatorCancellable).toBe(false)
  })

  it('marks a cancelled PRN as not regulator-cancellable regardless of year', () => {
    const futureYear = new Date().getUTCFullYear() + 5
    const prn = createMockIssuedPrn({
      status: {
        ...createMockIssuedPrn().status,
        currentStatus: PRN_STATUS.CANCELLED
      },
      accreditation: {
        ...createMockIssuedPrn().accreditation,
        accreditationYear: futureYear
      }
    })

    expect(mapToAdminPrn(prn).regulatorCancellable).toBe(false)
  })
})
