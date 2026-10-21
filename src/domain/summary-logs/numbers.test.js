import { describe, expect, it } from 'vitest'
import { numbersForSummaryLog } from './numbers.js'

/** @import {Organisation} from '#domain/organisations/model.js' */

/** @returns {Organisation} */
const buildOrganisation = () =>
  /** @type {Organisation} */ ({
    id: 'org-1',
    orgId: 500123,
    registrations: [
      { id: 'reg-1', registrationNumber: 'R25SR500010912PL' },
      { id: 'reg-2', registrationNumber: null }
    ],
    accreditations: [
      { id: 'acc-1', accreditationNumber: 'ACC500123' },
      { id: 'acc-2', accreditationNumber: null }
    ]
  })

describe('numbersForSummaryLog', () => {
  it('gives the numbers of the organisation, registration and accreditation', () => {
    expect(
      numbersForSummaryLog(buildOrganisation(), {
        registrationId: 'reg-1',
        accreditationId: 'acc-1'
      })
    ).toEqual({
      numbers: {
        organisationNumber: '500123',
        registrationNumber: 'R25SR500010912PL',
        accreditationNumber: 'ACC500123'
      },
      unmapped: []
    })
  })

  it('gives a registered-only summary log a null accreditation number', () => {
    expect(
      numbersForSummaryLog(buildOrganisation(), {
        registrationId: 'reg-1',
        accreditationId: null
      }).numbers
    ).toEqual({
      organisationNumber: '500123',
      registrationNumber: 'R25SR500010912PL',
      accreditationNumber: null
    })
  })

  it('gives no accreditation number to a summary log holding no accreditation id', () => {
    expect(
      numbersForSummaryLog(buildOrganisation(), { registrationId: 'reg-1' })
    ).toEqual({
      numbers: {
        organisationNumber: '500123',
        registrationNumber: 'R25SR500010912PL'
      },
      unmapped: []
    })
  })

  it('gives no number for a registration or accreditation that has none, and says why', () => {
    expect(
      numbersForSummaryLog(buildOrganisation(), {
        registrationId: 'reg-2',
        accreditationId: 'acc-2'
      })
    ).toEqual({
      numbers: { organisationNumber: '500123' },
      unmapped: [
        'registration reg-2 has no registration number',
        'accreditation acc-2 has no accreditation number'
      ]
    })
  })

  it('gives no number for an id the organisation does not hold, and says why', () => {
    expect(
      numbersForSummaryLog(buildOrganisation(), {
        registrationId: 'reg-gone',
        accreditationId: 'acc-gone'
      })
    ).toEqual({
      numbers: { organisationNumber: '500123' },
      unmapped: [
        'organisation org-1 holds no registration reg-gone',
        'organisation org-1 holds no accreditation acc-gone'
      ]
    })
  })
})
