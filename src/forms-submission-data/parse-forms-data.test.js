import { extractRepeaters } from './parse-forms-data.js'
import registeredLtdPartnership from '#data/fixtures/ea/organisation/registered-ltd-partnership.json' with { type: 'json' }
import reprocessorWood from '#data/fixtures/ea/accreditation/reprocessor-wood.json' with { type: 'json' }

describe('extractRepeaters', () => {
  it('should extract partner names and types from limited partnership', () => {
    const result = extractRepeaters(
      registeredLtdPartnership.rawSubmissionData,
      'Names of partners in your limited partnership',
      {
        'Partner names': 'name',
        'Partner type': 'type'
      }
    )

    expect(result).toEqual([
      {
        name: 'Victor',
        type: 'Company partner'
      },
      {
        name: 'DHL Supply Chain UK Ltd',
        type: 'Company partner'
      }
    ])
  })

  it('should return empty array when page not found', () => {
    const result = extractRepeaters(
      registeredLtdPartnership.rawSubmissionData,
      'Non-existent page title',
      {
        'Partner names': 'name',
        'Partner type': 'type'
      }
    )

    expect(result).toEqual([])
  })

  it('should return empty array when rawFormSubmissionObject is undefined', () => {
    const result = extractRepeaters(
      undefined,
      'Names of partners in your limited partnership',
      {
        'Partner names': 'name',
        'Partner type': 'type'
      }
    )

    expect(result).toEqual([])
  })

  it('should return empty array when repeater data is missing', () => {
    const dataWithoutRepeaters = {
      ...registeredLtdPartnership.rawSubmissionData,
      data: {
        ...registeredLtdPartnership.rawSubmissionData.data,
        repeaters: {}
      }
    }

    const result = extractRepeaters(
      dataWithoutRepeaters,
      'Names of partners in your limited partnership',
      {
        'Partner names': 'name',
        'Partner type': 'type'
      }
    )

    expect(result).toEqual([])
  })

  it('should only extract specified fields from fieldMapping', () => {
    const result = extractRepeaters(
      registeredLtdPartnership.rawSubmissionData,
      'Names of partners in your limited partnership',
      {
        'Partner names': 'name'
      }
    )

    expect(result).toEqual([
      {
        name: 'Victor'
      },
      {
        name: 'DHL Supply Chain UK Ltd'
      }
    ])
  })

  it('should extract PRN signatory details from accreditation form', () => {
    const result = extractRepeaters(
      reprocessorWood.rawSubmissionData,
      'Authority to issue PRNs for this packaging waste category',
      {
        'PRN signatory name': 'name',
        'PRN signatory email address': 'email',
        'PRN signatory phone number': 'phone',
        'PRN signatory job title': 'jobTitle'
      }
    )

    expect(result).toEqual([
      {
        name: 'James Patterson',
        email: 'test@gmail.com',
        phone: '1234567890',
        jobTitle: 'Sustainability Director'
      }
    ])
  })
})
