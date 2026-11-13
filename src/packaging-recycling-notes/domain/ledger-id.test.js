import { describe, expect, it } from 'vitest'

import { utcYearOf } from '#common/helpers/dates/year.js'
import { buildPrn } from '#packaging-recycling-notes/repository/contract/test-data.js'

import { prnLedgerId } from './ledger-id.js'

describe('prnLedgerId', () => {
  it('is the ledger of the accreditation for its accreditation year', () => {
    const prn = buildPrn()
    const year = utcYearOf('2027-01-01')

    const ledgerId = prnLedgerId({
      id: 'prn-1',
      ...prn,
      accreditation: { ...prn.accreditation, accreditationYear: year }
    })

    expect(ledgerId).toEqual({
      organisationNumber: prn.organisation.organisationNumber,
      registrationNumber: prn.registration.registrationNumber,
      accreditationNumber: prn.accreditation.accreditationNumber,
      year
    })
  })
})
