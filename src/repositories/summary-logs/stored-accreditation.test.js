import { readStoredSummaryLog } from './stored-accreditation.js'

/** @import { StoredSummaryLog } from './port.js' */

/**
 * A document as the database hands it back, whatever its accreditation.
 *
 * @param {object} accreditation
 */
const stored = (accreditation) =>
  /** @type {StoredSummaryLog} */ ({
    status: 'submitted',
    year: 2026,
    ...accreditation
  })

describe('readStoredSummaryLog', () => {
  it('reads a summary log uploaded for an accreditation by its number alone', () => {
    expect(
      readStoredSummaryLog(
        'log-1',
        stored({ accreditationId: 'acc-1', accreditationNumber: 'A26ER123' })
      )
    ).toEqual({
      status: 'submitted',
      year: 2026,
      accreditationNumber: 'A26ER123'
    })
  })

  it('reads a registered-only summary log with a null accreditation number', () => {
    expect(
      readStoredSummaryLog(
        'log-1',
        stored({ accreditationId: null, accreditationNumber: null })
      )
    ).toEqual({ status: 'submitted', year: 2026, accreditationNumber: null })
  })

  it('reads a summary log uploaded for an accreditation held outside this service, which has no accreditation id', () => {
    expect(
      readStoredSummaryLog('log-1', stored({ accreditationNumber: 'A27ER123' }))
    ).toEqual({
      status: 'submitted',
      year: 2026,
      accreditationNumber: 'A27ER123'
    })
  })

  it('reads a registered-only summary log with no accreditation id', () => {
    expect(
      readStoredSummaryLog('log-1', stored({ accreditationNumber: null }))
    ).toEqual({ status: 'submitted', year: 2026, accreditationNumber: null })
  })

  it.each([
    ['no accreditation number', {}],
    ['an empty accreditation number', { accreditationNumber: '' }],
    [
      'an accreditation number that is not a string',
      { accreditationNumber: 123 }
    ],
    [
      'an accreditation id but no accreditation number',
      { accreditationId: 'acc-1', accreditationNumber: null }
    ],
    [
      'an accreditation number but a null accreditation id',
      { accreditationId: null, accreditationNumber: 'A26ER123' }
    ]
  ])('refuses a summary log stored with %s', (_, accreditation) => {
    expect(() => readStoredSummaryLog('log-1', stored(accreditation))).toThrow(
      /^Summary log log-1 is stored with an accreditation in no shape a summary log can take/
    )
  })
})
