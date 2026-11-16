import { readStoredSummaryLog } from './stored-accreditation.js'

const stored = (accreditation) => ({
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

  it.each([
    ['no accreditation at all', {}],
    ['an accreditation id with no number', { accreditationId: 'acc-1' }],
    ['a number with no accreditation id', { accreditationNumber: 'A26ER123' }],
    [
      'an accreditation id with a null number',
      { accreditationId: 'acc-1', accreditationNumber: null }
    ],
    [
      'a null accreditation id with a number',
      { accreditationId: null, accreditationNumber: 'A26ER123' }
    ],
    [
      'an empty accreditation number',
      { accreditationId: 'acc-1', accreditationNumber: '' }
    ]
  ])('refuses a summary log stored with %s', (_, accreditation) => {
    expect(() => readStoredSummaryLog('log-1', stored(accreditation))).toThrow(
      /^Summary log log-1 is stored with an accreditation in no shape a summary log can take/
    )
  })
})
