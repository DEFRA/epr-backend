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
  it('counts an approved accreditation valid from another year', () => {
    expect(
      diagnose([accreditation({ validFrom: '2027-01-01' })])
    ).toStrictEqual({ scannedApproved: 1, outsideYear: 1 })
  })

  it('counts an approved accreditation valid to another year', () => {
    expect(diagnose([accreditation({ validTo: '2027-12-31' })])).toStrictEqual({
      scannedApproved: 1,
      outsideYear: 1
    })
  })

  it('counts an approved accreditation without a validFrom', () => {
    expect(diagnose([accreditation({ validFrom: undefined })])).toStrictEqual({
      scannedApproved: 1,
      outsideYear: 1
    })
  })

  it('leaves out approved accreditations valid within the year', () => {
    expect(diagnose([accreditation({})])).toStrictEqual({
      scannedApproved: 1,
      outsideYear: 0
    })
  })

  it('leaves out accreditations that are not approved', () => {
    expect(
      diagnose([
        accreditation({ status: 'suspended', validFrom: '2025-01-01' })
      ])
    ).toStrictEqual({ scannedApproved: 0, outsideYear: 0 })
  })

  it('counts the approved accreditations scanned and those outside the year', () => {
    expect(
      diagnose([
        accreditation({}),
        accreditation({ validFrom: '2025-06-01' }),
        accreditation({ status: 'created' })
      ])
    ).toStrictEqual({ scannedApproved: 2, outsideYear: 1 })
  })
})
