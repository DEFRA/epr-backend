import { describe, expect, it } from 'vitest'
import { numbersForSummaryLog, summaryLogKeyOf } from './numbers.js'

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {SummaryLog} from './model.js' */

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

  for (const [description, orgId] of [
    ['no orgId', undefined],
    ['an orgId that is not an organisation number', 0]
  ]) {
    it(`gives no organisation number for an organisation with ${description}, and says why`, () => {
      expect(
        numbersForSummaryLog(
          /** @type {Organisation} */ ({ ...buildOrganisation(), orgId }),
          { registrationId: 'reg-1' }
        )
      ).toEqual({
        numbers: { registrationNumber: 'R25SR500010912PL' },
        unmapped: [`organisation org-1 has no organisation number`]
      })
    })
  }
})

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
      ...fields
    })

  it("names the summary log's registration, year and accreditation", () => {
    expect(
      summaryLogKeyOf(
        summaryLog({
          year: 2026,
          accreditationId: 'acc-1',
          accreditationNumber: /** @type {any} */ ('ACC500123')
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
          year: 2026,
          accreditationId: null,
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

  it('names every year and accreditation for a summary log stored before either was recorded', () => {
    expect(summaryLogKeyOf(summaryLog({}))).toEqual({
      organisationNumber: '500123',
      registrationNumber: 'R25SR500010912PL'
    })
  })

  it.each([
    ['an organisation number', { organisationNumber: undefined }],
    ['a registration number', { registrationNumber: undefined }],
    ['an accreditation number', { accreditationId: 'acc-1' }]
  ])('refuses a summary log without %s', (_missing, fields) => {
    expect(() => summaryLogKeyOf(summaryLog(fields))).toThrow(
      'The summary log is missing one of its numbers'
    )
  })
})
