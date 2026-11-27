import { describe, expect, it } from 'vitest'
import { getRetrievalKeyForRegulator } from '#formsubmission/file-uploads/get-retrieval-key.js'

const regulators = {
  NIEA: {
    email: 'wrong@email.com',
    defraFormsSubmissionEmail: 'TEST.DEFRA.FORMS@NIEA.GOV.UK'
  },
  SEPA: { email: 'TEST@SEPA.GOV.UK' }
}

describe('getRetrievalKeyForRegulator', () => {
  it('should return the lowercase email when a valid regulator (SEPA) is provided', () => {
    expect(getRetrievalKeyForRegulator(regulators, 'sepa')).toBe(
      'test@sepa.gov.uk'
    )
  })

  it('should throw an error when incorrect regulator is provided', () => {
    expect(() =>
      getRetrievalKeyForRegulator(regulators, 'incorrect-regulator')
    ).toThrowError('No email address is configured for INCORRECT-REGULATOR')
  })

  it('should return the defraFormsSubmissionEmail for NIEA when it exists', () => {
    expect(getRetrievalKeyForRegulator(regulators, 'niea')).toBe(
      'test.defra.forms@niea.gov.uk'
    )
  })
})
