import { toYear } from '#common/helpers/dates/year.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import {
  approvedStatusFrom,
  buildReadOrganisation,
  buildReadReprocessorRegistration
} from '#organisation-read-model/repository/read-model-test-data.js'

import { diagnoseOrganisationYears } from './diagnose-organisation-years.js'

const OPEN_YEAR = toYear(2026)

/** @param {Record<string, string>} approvedFromByRegistration */
const organisationApprovedFrom = (approvedFromByRegistration, overrides = {}) =>
  buildReadOrganisation({
    registrations: Object.fromEntries(
      Object.entries(approvedFromByRegistration).map(([id, approvedFrom]) => [
        id,
        buildReadReprocessorRegistration({
          status: approvedStatusFrom(approvedFrom)
        })
      ])
    ),
    ...overrides
  })

describe('diagnoseOrganisationYears', () => {
  it('reports nothing when every organisation has only the open year', () => {
    const { rows, summary } = diagnoseOrganisationYears(
      [organisationApprovedFrom({ R1: '2026-02-01' })],
      OPEN_YEAR
    )

    expect(rows).toStrictEqual([])
    expect(summary).toStrictEqual({
      openYear: 2026,
      scannedOrganisations: 1,
      organisationsWithOtherYears: 0,
      otherYearsInTestOrganisations: 0,
      organisationsWithNoYear: 0,
      organisationsByYear: { 2026: 1 }
    })
  })

  it('reports an organisation with an earlier year and only the registrations that bring it in', () => {
    const organisation = organisationApprovedFrom({
      R1: '2025-11-01',
      R2: '2026-02-01'
    })

    const { rows, summary } = diagnoseOrganisationYears(
      [organisation],
      OPEN_YEAR
    )

    expect(rows).toStrictEqual([
      {
        organisationNumber: organisation.organisationNumber,
        testOrganisation: false,
        years: [2026, 2025],
        registrations: [
          {
            registrationId: 'R1',
            status: 'approved',
            firstApprovedAt: '2025-11-01T00:00:00.000Z',
            years: [2025, 2026]
          }
        ]
      }
    ])
    expect(summary.organisationsByYear).toStrictEqual({ 2025: 1, 2026: 1 })
  })

  it('counts other years in test organisations separately', () => {
    const { rows, summary } = diagnoseOrganisationYears(
      [
        organisationApprovedFrom(
          { R1: '2025-11-01' },
          { organisationNumber: toOrganisationNumber('999999') }
        )
      ],
      OPEN_YEAR
    )

    expect(rows[0].testOrganisation).toBe(true)
    expect(summary.organisationsWithOtherYears).toBe(1)
    expect(summary.otherYearsInTestOrganisations).toBe(1)
  })

  it('counts an organisation with no approved year without reporting it', () => {
    const { rows, summary } = diagnoseOrganisationYears(
      [buildReadOrganisation({ registrations: {} })],
      OPEN_YEAR
    )

    expect(rows).toStrictEqual([])
    expect(summary.organisationsWithNoYear).toBe(1)
    expect(summary.organisationsByYear).toStrictEqual({})
  })
})
