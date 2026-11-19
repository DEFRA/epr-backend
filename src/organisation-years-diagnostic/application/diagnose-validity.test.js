import { toYear } from '#common/helpers/dates/year.js'
import {
  toAccreditationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { buildStoredOrganisation as organisation } from '#organisation-years-diagnostic/validity-test-data.js'
import {
  buildAccreditation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'

import { diagnoseValidity } from './diagnose-validity.js'

const YEAR = toYear(2026)

/** @param {object} overrides */
const registration = (overrides) =>
  buildRegistration({
    id: 'reg-1',
    registrationNumber: toRegistrationNumber('R26ER500001PL'),
    status: 'approved',
    validFrom: '2026-01-01',
    ...overrides
  })

/** @param {object} overrides */
const accreditation = (overrides) =>
  buildAccreditation({
    id: 'acc-1',
    accreditationNumber: toAccreditationNumber('A26ER500001PL'),
    status: 'approved',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    ...overrides
  })

describe('diagnoseValidity', () => {
  it('reports nothing when everything is valid within the year', () => {
    const { registrations, accreditations, summary } = diagnoseValidity(
      [
        organisation({
          registrations: [registration({})],
          accreditations: [accreditation({})]
        })
      ],
      YEAR
    )

    expect(registrations).toStrictEqual([])
    expect(accreditations).toStrictEqual([])
    expect(summary).toStrictEqual({
      year: 2026,
      scannedRegistrations: 1,
      registrationsStartingBefore: 0,
      scannedAccreditations: 1,
      accreditationsStartingBefore: 0,
      accreditationsEndingAfter: 0,
      accreditationsEndingOnFirstJanuary: 0,
      unparseableDates: 0,
      rowsInTestOrganisations: 0
    })
  })

  it('reports a registration valid from an earlier year', () => {
    const { registrations, summary } = diagnoseValidity(
      [
        organisation({
          registrations: [
            registration({ validFrom: '2025-12-31' }),
            registration({ id: 'reg-2', validFrom: '2026-01-01' })
          ]
        })
      ],
      YEAR
    )

    expect(registrations).toStrictEqual([
      {
        organisationNumber: '500001',
        testOrganisation: false,
        registrationId: 'reg-1',
        registrationNumber: 'R26ER500001PL',
        status: 'approved',
        validFrom: '2025-12-31'
      }
    ])
    expect(summary.registrationsStartingBefore).toBe(1)
  })

  it('reports an accreditation starting before the year or ending after 1 January of the next year', () => {
    const { accreditations, summary } = diagnoseValidity(
      [
        organisation({
          accreditations: [
            accreditation({ id: 'starts-early', validFrom: '2025-06-01' }),
            accreditation({ id: 'ends-late', validTo: '2027-01-02' }),
            accreditation({ id: 'within' })
          ]
        })
      ],
      YEAR
    )

    expect(
      accreditations.map(({ accreditationId }) => accreditationId)
    ).toEqual(['starts-early', 'ends-late'])
    expect(accreditations[1]).toStrictEqual({
      organisationNumber: '500001',
      testOrganisation: false,
      accreditationId: 'ends-late',
      accreditationNumber: 'A26ER500001PL',
      status: 'approved',
      validFrom: '2026-01-01',
      validTo: '2027-01-02'
    })
    expect(summary.accreditationsStartingBefore).toBe(1)
    expect(summary.accreditationsEndingAfter).toBe(1)
  })

  it('counts but does not report an accreditation ending on 1 January of the next year', () => {
    const { accreditations, summary } = diagnoseValidity(
      [
        organisation({
          accreditations: [
            accreditation({ id: 'date', validTo: '2027-01-01' }),
            accreditation({
              id: 'instant',
              validTo: '2027-01-01T00:00:00.000Z'
            }),
            accreditation({
              id: 'starts-early',
              validFrom: '2025-01-01',
              validTo: '2027-01-01'
            })
          ]
        })
      ],
      YEAR
    )

    expect(
      accreditations.map(({ accreditationId }) => accreditationId)
    ).toEqual(['starts-early'])
    expect(summary.accreditationsEndingAfter).toBe(0)
    expect(summary.accreditationsEndingOnFirstJanuary).toBe(3)
  })

  it('ignores registrations and accreditations without dates, whether missing or null', () => {
    const { registrations, accreditations, summary } = diagnoseValidity(
      [
        organisation({
          registrations: [
            registration({ validFrom: undefined }),
            registration({ id: 'reg-2', validFrom: null })
          ],
          accreditations: [
            accreditation({ validFrom: undefined, validTo: undefined }),
            accreditation({ id: 'acc-2', validFrom: null, validTo: null })
          ]
        })
      ],
      YEAR
    )

    expect(registrations).toStrictEqual([])
    expect(accreditations).toStrictEqual([])
    expect(summary.scannedRegistrations).toBe(2)
    expect(summary.scannedAccreditations).toBe(2)
    expect(summary.unparseableDates).toBe(0)
  })

  it('reports and counts registrations and accreditations whose dates do not parse', () => {
    const { registrations, accreditations, summary } = diagnoseValidity(
      [
        organisation({
          registrations: [registration({ validFrom: 'garbage' })],
          accreditations: [
            accreditation({ id: 'bad-from', validFrom: 'garbage' }),
            accreditation({ id: 'bad-to', validTo: 'TBC' }),
            accreditation({ id: 'within' })
          ]
        })
      ],
      YEAR
    )

    expect(registrations.map(({ validFrom }) => validFrom)).toEqual(['garbage'])
    expect(
      accreditations.map(({ accreditationId }) => accreditationId)
    ).toEqual(['bad-from', 'bad-to'])
    expect(summary).toMatchObject({
      registrationsStartingBefore: 0,
      accreditationsStartingBefore: 0,
      accreditationsEndingAfter: 0,
      unparseableDates: 3
    })
  })

  it('counts rows in test organisations', () => {
    const { summary } = diagnoseValidity(
      [
        organisation({
          organisationNumber: '999999',
          registrations: [registration({ validFrom: '2024-01-01' })],
          accreditations: [accreditation({ validTo: '2027-12-31' })]
        })
      ],
      YEAR
    )

    expect(summary.rowsInTestOrganisations).toBe(2)
  })
})
