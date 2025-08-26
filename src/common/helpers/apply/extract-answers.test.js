import {
  extractAnswers,
  extractEmail,
  extractOrgId,
  extractOrgName,
  extractReferenceNumber,
  getRegulatorEmail
} from './extract-answers.js'
import { FORM_FIELDS_SHORT_DESCRIPTIONS } from '../../enums/index.js'
import { getConfig } from '../../../config.js'

vi.mock('../../../config.js', async (importOriginal) => {
  const configImportOriginal = await importOriginal()

  return {
    ...configImportOriginal,
    getConfig: vi.fn((overrides) => configImportOriginal.getConfig(overrides))
  }
})

describe('extractAnswers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should extract answers from payload', () => {
    const result = extractAnswers({
      meta: {
        definition: {
          pages: [
            {
              components: [
                {
                  name: 'test',
                  shortDescription: 'test desc',
                  title: 'Test',
                  type: 'text'
                }
              ]
            }
          ]
        }
      },
      data: {
        main: {
          test: 'test value'
        }
      }
    })
    expect(result).toEqual([
      {
        shortDescription: 'test desc',
        title: 'Test',
        type: 'text',
        value: 'test value'
      }
    ])
  })

  it('should return empty array for undefined payload', () => {
    expect(extractAnswers(undefined)).toEqual([])
  })
})

describe('extractEmail', () => {
  it('should extract email from answers', () => {
    const answers = [
      {
        shortDescription: FORM_FIELDS_SHORT_DESCRIPTIONS.EMAIL,
        value: 'test@example.com'
      }
    ]
    expect(extractEmail(answers)).toEqual('test@example.com')
  })

  it('should return undefined if email not found', () => {
    expect(extractEmail([])).toBeUndefined()
  })
})

describe('extractOrgId', () => {
  it('should extract organisation id from answers', () => {
    const answers = [
      {
        shortDescription: FORM_FIELDS_SHORT_DESCRIPTIONS.ORG_ID,
        value: '500019'
      }
    ]
    expect(extractOrgId(answers)).toEqual(500019)
  })

  it('should return undefined if organisation id not found', () => {
    expect(extractOrgId([])).toBeUndefined()
  })
})

describe('extractOrgName', () => {
  it('should extract organisation name from answers', () => {
    const answers = [
      {
        shortDescription: FORM_FIELDS_SHORT_DESCRIPTIONS.ORG_NAME,
        value: 'Test Org'
      }
    ]
    expect(extractOrgName(answers)).toEqual('Test Org')
  })

  it('should return undefined if organisation name not found', () => {
    expect(extractOrgName([])).toBeUndefined()
  })
})

describe('extractReferenceNumber', () => {
  it('should extract reference number from answers', () => {
    const answers = [
      {
        shortDescription: FORM_FIELDS_SHORT_DESCRIPTIONS.REFERENCE_NUMBER,
        value: '68a66ec3dabf09f3e442b2da'
      }
    ]
    expect(extractReferenceNumber(answers)).toEqual('68a66ec3dabf09f3e442b2da')
  })

  it('should return undefined if organisation name not found', () => {
    expect(extractReferenceNumber([])).toBeUndefined()
  })
})

describe('getRegulatorEmail', () => {
  it.each([
    {
      name: 'Extended Producer Responsibilities: provide your organisation details (EA)',
      email: 'test@ea.gov.uk'
    },
    {
      name: 'Extended Producer Responsibilities: provide your organisation details (NIEA)',
      email: 'test@niea.gov.uk'
    },
    {
      name: 'Extended Producer Responsibilities: provide your organisation details (NRW)',
      email: 'test@nrw.gov.uk'
    },
    {
      name: 'Extended Producer Responsibilities: provide your organisation details (SEPA)',
      email: 'test@sepa.gov.uk'
    }
  ])('should get regulator email address from form name', ({ name, email }) => {
    const data = {
      meta: {
        definition: {
          name
        }
      }
    }
    expect(getRegulatorEmail(data)).toEqual(email)
  })

  it('should return undefined if regulator name not found', () => {
    const data = {
      meta: {
        definition: {
          name: 'Extended Producer Responsibilities (EA): provide your organisation details'
        }
      }
    }
    expect(getRegulatorEmail(data)).toBeUndefined()
  })

  it('should return undefined if form definition is missing', () => {
    const data = {
      meta: {
        definition: undefined
      }
    }
    expect(getRegulatorEmail(data)).toBeUndefined()
  })

  it('should return undefined if regulator config is missing', () => {
    const config = getConfig()

    getConfig.mockImplementation(() => ({
      ...config,
      get: (item) => {
        if (item.startsWith('regulator')) {
          return undefined
        }

        return config.get(item)
      }
    }))

    const data = {
      meta: {
        definition: {
          name: 'Extended Producer Responsibilities: provide your organisation details (EA)'
        }
      }
    }

    expect(getRegulatorEmail(data)).toBeUndefined()
  })
})
