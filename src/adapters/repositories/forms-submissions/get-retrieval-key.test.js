import { describe, expect, it, vi, beforeEach } from 'vitest'
import { config } from '#root/config.js'
import { getRetrievalKeyForRegulator } from '#adapters/repositories/forms-submissions/get-retrieval-key.js'

vi.mock('#root/config.js', () => ({
  config: {
    get: vi.fn(),
    has: vi.fn()
  }
}))

describe('getRetrievalKeyForRegulator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return the lowercase email when a valid regulator (SEPA) is provided', () => {
    vi.mocked(config.has).mockReturnValue(false)
    vi.mocked(config.get).mockImplementation((key) => {
      if (key === 'regulator.SEPA.email') {
        return 'TEST@SEPA.GOV.UK'
      }
      return null
    })

    const result = getRetrievalKeyForRegulator('sepa')
    expect(result).toBe('test@sepa.gov.uk')
  })

  it('should throw an error when incorrect regulator is provided', () => {
    vi.mocked(config.has).mockReturnValue(false)
    vi.mocked(config.get).mockImplementation((key) => {
      throw new Error(`cannot find configuration param '${key}'`)
    })

    expect(() =>
      getRetrievalKeyForRegulator('incorrect-regulator')
    ).toThrowError(
      "cannot find configuration param 'regulator.INCORRECT-REGULATOR.email'"
    )
  })

  it('should return the defraFormsSubmissionEmail for NIEA when it exists', () => {
    vi.mocked(config.has).mockImplementation((key) => {
      return key === 'regulator.NIEA.defraFormsSubmissionEmail'
    })

    vi.mocked(config.get).mockImplementation((key) => {
      if (key === 'regulator.NIEA.defraFormsSubmissionEmail') {
        return 'TEST.DEFRA.FORMS@NIEA.GOV.UK'
      }
      return 'wrong@email.com'
    })

    const result = getRetrievalKeyForRegulator('niea')
    expect(result).toBe('test.defra.forms@niea.gov.uk')
  })
})
