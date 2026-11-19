import { toYear } from '#common/helpers/dates/year.js'
import {
  buildInYearAccreditation as accreditation,
  buildInYearRegistration as registration,
  buildStoredOrganisation as organisation
} from '#organisation-years-diagnostic/validity-test-data.js'

import { diagnoseValidityOutsideYear } from './diagnose-validity-outside-year.js'

const NO_PROBLEMS = { before: 0, after: 0, empty: 0, unparseable: 0 }

describe('diagnoseValidityOutsideYear', () => {
  it('reports nothing when every date falls in the year', () => {
    const { registrations, accreditations, summary } =
      diagnoseValidityOutsideYear(
        [
          organisation({
            registrations: [
              registration({}),
              registration({ id: 'reg-2', validFrom: '2026-12-31' })
            ],
            accreditations: [
              accreditation({}),
              accreditation({
                id: 'acc-2',
                validFrom: '2026-06-01T00:00:00.000Z',
                validTo: '2026-12-31T23:59:59.999Z'
              })
            ]
          })
        ],
        toYear(2026)
      )

    expect(registrations).toStrictEqual([])
    expect(accreditations).toStrictEqual([])
    expect(summary).toStrictEqual({
      year: 2026,
      scannedRegistrations: 2,
      registrationsOutsideYear: 0,
      registrationValidFrom: NO_PROBLEMS,
      scannedAccreditations: 2,
      accreditationsOutsideYear: 0,
      accreditationValidFrom: NO_PROBLEMS,
      accreditationValidTo: NO_PROBLEMS,
      rowsInTestOrganisations: 0
    })
  })

  it('reports a registration whose validFrom is before or after the year, empty or unparseable', () => {
    const { registrations, summary } = diagnoseValidityOutsideYear(
      [
        organisation({
          registrations: [
            registration({ id: 'before', validFrom: '2025-12-31' }),
            registration({ id: 'after', validFrom: '2027-01-01' }),
            registration({ id: 'missing', validFrom: undefined }),
            registration({ id: 'null', validFrom: null }),
            registration({ id: 'garbage', validFrom: 'garbage' }),
            registration({ id: 'within' })
          ]
        })
      ],
      toYear(2026)
    )

    expect(
      registrations.map(({ registrationId, validFromProblem }) => [
        registrationId,
        validFromProblem
      ])
    ).toStrictEqual([
      ['before', 'before'],
      ['after', 'after'],
      ['missing', 'empty'],
      ['null', 'empty'],
      ['garbage', 'unparseable']
    ])
    expect(registrations[1]).toStrictEqual({
      organisationNumber: '500001',
      testOrganisation: false,
      registrationId: 'after',
      registrationNumber: 'R26ER500001PL',
      status: 'approved',
      validFrom: '2027-01-01',
      validFromProblem: 'after'
    })
    expect(summary).toMatchObject({
      scannedRegistrations: 6,
      registrationsOutsideYear: 5,
      registrationValidFrom: { before: 1, after: 1, empty: 2, unparseable: 1 }
    })
  })

  it('reports an accreditation whose validFrom or validTo falls outside the year', () => {
    const { accreditations, summary } = diagnoseValidityOutsideYear(
      [
        organisation({
          accreditations: [
            accreditation({ id: 'starts-before', validFrom: '2025-06-01' }),
            accreditation({ id: 'starts-after', validFrom: '2027-01-01' }),
            accreditation({ id: 'ends-before', validTo: '2025-12-31' }),
            accreditation({ id: 'ends-first-january', validTo: '2027-01-01' }),
            accreditation({ id: 'within' })
          ]
        })
      ],
      toYear(2026)
    )

    expect(
      accreditations.map(({ accreditationId }) => accreditationId)
    ).toStrictEqual([
      'starts-before',
      'starts-after',
      'ends-before',
      'ends-first-january'
    ])
    expect(accreditations[0]).toStrictEqual({
      organisationNumber: '500001',
      testOrganisation: false,
      accreditationId: 'starts-before',
      accreditationNumber: 'A26ER500001PL',
      status: 'approved',
      validFrom: '2025-06-01',
      validFromProblem: 'before',
      validTo: '2026-12-31',
      validToProblem: undefined
    })
    expect(summary).toMatchObject({
      scannedAccreditations: 5,
      accreditationsOutsideYear: 4,
      accreditationValidFrom: { before: 1, after: 1, empty: 0, unparseable: 0 },
      accreditationValidTo: { before: 1, after: 1, empty: 0, unparseable: 0 }
    })
  })

  it('reports an accreditation with empty or unparseable dates', () => {
    const { accreditations, summary } = diagnoseValidityOutsideYear(
      [
        organisation({
          accreditations: [
            accreditation({ id: 'no-dates', validFrom: null, validTo: null }),
            accreditation({ id: 'no-end', validTo: undefined }),
            accreditation({ id: 'bad-end', validTo: 'TBC' })
          ]
        })
      ],
      toYear(2026)
    )

    expect(
      accreditations.map(
        ({ accreditationId, validFromProblem, validToProblem }) => [
          accreditationId,
          validFromProblem,
          validToProblem
        ]
      )
    ).toStrictEqual([
      ['no-dates', 'empty', 'empty'],
      ['no-end', undefined, 'empty'],
      ['bad-end', undefined, 'unparseable']
    ])
    expect(summary).toMatchObject({
      accreditationValidFrom: { before: 0, after: 0, empty: 1, unparseable: 0 },
      accreditationValidTo: { before: 0, after: 0, empty: 2, unparseable: 1 }
    })
  })

  it('counts rows in test organisations', () => {
    const { summary } = diagnoseValidityOutsideYear(
      [
        organisation({
          organisationNumber: '999999',
          registrations: [registration({ validFrom: '2024-01-01' })],
          accreditations: [accreditation({ validTo: '2027-12-31' })]
        })
      ],
      toYear(2026)
    )

    expect(summary.rowsInTestOrganisations).toBe(2)
  })
})
