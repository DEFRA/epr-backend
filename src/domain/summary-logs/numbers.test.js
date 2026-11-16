import { toYear } from '#common/helpers/dates/year.js'
import { describe, expect, it } from 'vitest'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { summaryLogKeyOf } from './numbers.js'

/** @import {SummaryLog} from './model.js' */

describe('summaryLogKeyOf', () => {
  /** @param {Partial<SummaryLog>} fields */
  const summaryLog = (fields) =>
    /** @type {SummaryLog} */ ({
      status: 'submitted',
      file: { id: 'file-1', name: 'log.xlsx' },
      organisationId: 'org-1',
      registrationId: 'reg-1',
      organisationNumber: '500123',
      registrationNumber: 'R25SR500010912PL',
      accreditationNumber: null,
      year: toYear(2026),
      ...fields
    })

  it("names the summary log's registration, year and accreditation", () => {
    expect(
      summaryLogKeyOf(
        summaryLog({
          year: toYear(2026),
          accreditationNumber: toAccreditationNumber('ACC500123')
        })
      )
    ).toEqual({
      organisationNumber: '500123',
      registrationNumber: 'R25SR500010912PL',
      accreditationNumber: 'ACC500123',
      year: 2026
    })
  })

  it('names a registered-only summary log by a null accreditation number', () => {
    expect(
      summaryLogKeyOf(
        summaryLog({
          year: toYear(2026),
          accreditationNumber: null
        })
      )
    ).toEqual({
      organisationNumber: '500123',
      registrationNumber: 'R25SR500010912PL',
      accreditationNumber: null,
      year: 2026
    })
  })

  it.each([
    ['an organisation number', { organisationNumber: undefined }],
    ['a registration number', { registrationNumber: undefined }]
  ])('refuses a summary log without %s', (_missing, fields) => {
    expect(() => summaryLogKeyOf(summaryLog(fields))).toThrow(
      'The summary log is missing one of its numbers'
    )
  })
})
