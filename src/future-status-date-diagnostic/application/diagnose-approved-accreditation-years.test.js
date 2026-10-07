import {
  buildAccreditation,
  buildOrganisation
} from '#repositories/organisations/contract/test-data.js'
import { partialMock } from '#test/type-helpers.js'

import { diagnoseApprovedAccreditationYears } from './diagnose-approved-accreditation-years.js'

/** @param {Record<string, unknown>} overrides */
const accreditation = (overrides) =>
  buildAccreditation({
    status: 'approved',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    ...overrides
  })

/** @param {ReturnType<typeof buildAccreditation>[]} accreditations */
const diagnose = (accreditations) =>
  diagnoseApprovedAccreditationYears(
    [partialMock(buildOrganisation({ accreditations }))],
    2026
  )

describe('diagnoseApprovedAccreditationYears', () => {
  it('describes an approved accreditation valid from another year', () => {
    const outside = accreditation({
      accreditationNumber: 'ACC12345',
      validFrom: '2027-01-01'
    })
    const organisation = buildOrganisation({ accreditations: [outside] })

    const { rows } = diagnoseApprovedAccreditationYears(
      [partialMock(organisation)],
      2026
    )

    expect(rows).toStrictEqual([
      {
        organisationId: organisation.id,
        orgId: organisation.orgId,
        testOrganisation: false,
        accreditationId: outside.id,
        accreditationNumber: 'ACC12345',
        validFrom: '2027-01-01',
        validTo: '2026-12-31'
      }
    ])
  })

  it('flags an approved accreditation valid to another year', () => {
    const { rows } = diagnose([accreditation({ validTo: '2027-12-31' })])

    expect(rows).toStrictEqual([
      expect.objectContaining({ validTo: '2027-12-31' })
    ])
  })

  it('flags an approved accreditation without a validFrom', () => {
    const { rows } = diagnose([accreditation({ validFrom: undefined })])

    expect(rows).toStrictEqual([
      expect.objectContaining({ validFrom: undefined })
    ])
  })

  it('leaves out approved accreditations valid within the year', () => {
    const { rows } = diagnose([accreditation({})])

    expect(rows).toStrictEqual([])
  })

  it('leaves out accreditations that are not approved', () => {
    const { rows } = diagnose([
      accreditation({ status: 'suspended', validFrom: '2025-01-01' })
    ])

    expect(rows).toStrictEqual([])
  })

  it('counts the approved accreditations scanned and those outside the year', () => {
    const { summary } = diagnose([
      accreditation({}),
      accreditation({ validFrom: '2025-06-01' }),
      accreditation({ status: 'created' })
    ])

    expect(summary).toStrictEqual({ scannedApproved: 2, outsideYear: 1 })
  })
})
