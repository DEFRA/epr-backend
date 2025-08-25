import { describe, expect, it } from 'vitest'
import {
  extractAnswers,
  extractEmail,
  extractNations,
  extractOrgId,
  extractOrgName,
  extractReferenceNumber
} from './extract-answers.js'
import { FORM_FIELDS_SHORT_DESCRIPTIONS, NATION } from '../../enums/index.js'

describe('extractAnswers', () => {
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
    expect(extractEmail(answers)).toBe('test@example.com')
  })

  it('should return undefined if email not found', () => {
    expect(extractEmail([])).toBeUndefined()
  })
})

describe('extractNations', () => {
  it('should extract nations from answers', () => {
    const answers = [
      {
        shortDescription: 'Nations with sites',
        value: `${NATION.ENGLAND}, ${NATION.SCOTLAND}`
      }
    ]
    expect(extractNations(answers)).toEqual([NATION.ENGLAND, NATION.SCOTLAND])
  })

  it('should return empty array if nations not found', () => {
    expect(extractNations([])).toEqual([])
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
    expect(extractOrgId(answers)).toBe(500019)
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
    expect(extractOrgName(answers)).toBe('Test Org')
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
    expect(extractReferenceNumber(answers)).toBe('68a66ec3dabf09f3e442b2da')
  })

  it('should return undefined if organisation name not found', () => {
    expect(extractReferenceNumber([])).toBeUndefined()
  })
})
