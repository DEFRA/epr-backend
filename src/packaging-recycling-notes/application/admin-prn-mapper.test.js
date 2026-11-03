import { toYear } from '#common/helpers/dates/year.js'
import { describe, it, expect } from 'vitest'

import { mapToAdminPrn } from './admin-prn-mapper.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { buildAccreditationSnapshot } from '#packaging-recycling-notes/repository/contract/test-data.js'
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

  const futureYear = toYear(new Date().getUTCFullYear() + 5)

  it.for([
    {
      description:
        'marks an accepted PRN within its cancellation window as regulator-cancellable',
      currentStatus: PRN_STATUS.ACCEPTED,
      accreditationYear: futureYear,
      cancellable: true
    },
    {
      description:
        'marks a PRN past its cancellation window as not regulator-cancellable',
      currentStatus: PRN_STATUS.ACCEPTED,
      accreditationYear: toYear(2000),
      cancellable: false
    },
    {
      description:
        'marks a cancelled PRN as not regulator-cancellable regardless of year',
      currentStatus: PRN_STATUS.CANCELLED,
      accreditationYear: futureYear,
      cancellable: false
    }
  ])('$description', ({ currentStatus, accreditationYear, cancellable }) => {
    const issued = createMockIssuedPrn({
      accreditation: buildAccreditationSnapshot({ accreditationYear })
    })
    const prn = { ...issued, status: { ...issued.status, currentStatus } }

    expect(mapToAdminPrn(prn).regulatorCancellable).toBe(cancellable)
  })
})
