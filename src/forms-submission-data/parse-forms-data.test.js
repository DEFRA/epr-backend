import {
  extractRepeaters,
  extractAnswers,
  flattenAnswersByShortDesc,
  retrieveFileUploadDetails
} from './parse-forms-data.js'
import { FORM_PAGES } from './form-field-constants.js'
import registeredLtdPartnership from '#data/fixtures/ea/organisation/registered-ltd-partnership.json' with { type: 'json' }
import reprocessorWood from '#data/fixtures/ea/accreditation/reprocessor-wood.json' with { type: 'json' }
import exporterRegistration from '#data/fixtures/ea/registration/exporter.json' with { type: 'json' }
import reprocessorAllMaterials from '#data/fixtures/ea/registration/reprocessor-all-materials.json' with { type: 'json' }
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

describe('extractRepeaters', () => {
  const partnershipPage = FORM_PAGES.ORGANISATION.PARTNERSHIP_DETAILS

  it('should extract partner names and types from limited partnership', () => {
    const result = extractRepeaters(
      registeredLtdPartnership.rawSubmissionData,
      partnershipPage.title,
      {
        [partnershipPage.fields.PARTNER_NAMES]: 'name',
        [partnershipPage.fields.PARTNER_TYPE]: 'type'
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
        [partnershipPage.fields.PARTNER_NAMES]: 'name',
        [partnershipPage.fields.PARTNER_TYPE]: 'type'
      }
    )

    expect(result).toEqual([])
  })

  it('should return empty array when rawFormSubmissionObject is undefined', () => {
    const result = extractRepeaters(undefined, partnershipPage.title, {
      [partnershipPage.fields.PARTNER_NAMES]: 'name',
      [partnershipPage.fields.PARTNER_TYPE]: 'type'
    })

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
      partnershipPage.title,
      {
        [partnershipPage.fields.PARTNER_NAMES]: 'name',
        [partnershipPage.fields.PARTNER_TYPE]: 'type'
      }
    )

    expect(result).toEqual([])
  })

  it('should only extract specified fields from fieldMapping', () => {
    const result = extractRepeaters(
      registeredLtdPartnership.rawSubmissionData,
      partnershipPage.title,
      {
        [partnershipPage.fields.PARTNER_NAMES]: 'name'
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
    const prnSignatory = FORM_PAGES.REPROCESSOR_ACCREDITATION.PRN_SIGNATORY

    const result = extractRepeaters(
      reprocessorWood.rawSubmissionData,
      prnSignatory.title,
      {
        [prnSignatory.fields.NAME]: 'name',
        [prnSignatory.fields.EMAIL]: 'email',
        [prnSignatory.fields.PHONE]: 'phone',
        [prnSignatory.fields.JOB_TITLE]: 'jobTitle'
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

describe('extractAnswers', () => {
  it('should extract answers in nested structure by page', () => {
    const result = extractAnswers(exporterRegistration)
    const orgDetails = FORM_PAGES.REPROCESSOR_REGISTRATION.ORGANISATION_DETAILS

    const haveOrgId = FORM_PAGES.REPROCESSOR_REGISTRATION.HAVE_ORGANISATION_ID
    expect(result[haveOrgId.title]).toBeDefined()
    expect(result[haveOrgId.title][haveOrgId.fields.HAVE_ORG_ID]).toBe('true')

    expect(result[orgDetails.title]).toBeDefined()
    expect(result[orgDetails.title][orgDetails.fields.ORG_NAME]).toBe(
      'EuroPack GmbH'
    )
    expect(result[orgDetails.title][orgDetails.fields.ORGANISATION_ID]).toBe(
      '503181'
    )
    expect(result[orgDetails.title][orgDetails.fields.SYSTEM_REFERENCE]).toBe(
      '68e6912278f83083f0f17a7b'
    )
  })

  it('should handle duplicate field names across different pages', () => {
    const result = extractAnswers(reprocessorAllMaterials)
    const envPermit =
      FORM_PAGES.REPROCESSOR_REGISTRATION.ALUMINIUM_ENVIRONMENTAL_PERMIT
    const siteCapacity =
      FORM_PAGES.REPROCESSOR_REGISTRATION.ALUMINIUM_SITE_CAPACITY

    expect(result[envPermit.title]).toBeDefined()
    expect(result[envPermit.title][envPermit.fields.TIMESCALE]).toBe('Yearly')

    expect(result[siteCapacity.title]).toBeDefined()
    expect(result[siteCapacity.title][siteCapacity.fields.TIMESCALE]).toBe(
      'Monthly'
    )
  })

  it('should throw error when rawFormSubmission is undefined', () => {
    expect(() => extractAnswers(undefined)).toThrow(
      'extractAnswers: Missing or invalid pages definition'
    )
  })

  it('should throw error when data.main is missing', () => {
    const mockData = {
      rawSubmissionData: {
        meta: {
          definition: {
            pages: []
          }
        }
      }
    }
    expect(() => extractAnswers(mockData)).toThrow(
      'extractAnswers: Missing or invalid data.main'
    )
  })

  it('should skip components without shortDescription or name', () => {
    const mockData = {
      rawSubmissionData: {
        meta: {
          definition: {
            pages: [
              {
                title: 'Test Page',
                components: [
                  {
                    type: 'TextField',
                    title: 'Some question without shortDescription',
                    name: 'abc123'
                  },
                  {
                    shortDescription: 'Valid field',
                    title: 'Valid question',
                    name: 'xyz789'
                  },
                  {
                    shortDescription: 'Field without name',
                    title: 'Another question'
                  }
                ]
              }
            ]
          }
        },
        data: {
          main: {
            abc123: 'Some value',
            xyz789: 'Valid value'
          }
        }
      }
    }

    const result = extractAnswers(mockData)

    expect(result).toEqual({
      'Test Page': {
        'Valid field': 'Valid value'
      }
    })
  })

  it('should throw error when pages definition is missing', () => {
    const mockData = {
      rawSubmissionData: {
        data: {
          main: {
            abc123: 'test value'
          }
        }
      }
    }

    expect(() => extractAnswers(mockData)).toThrow(
      'extractAnswers: Missing or invalid pages definition'
    )
  })

  it('should throw error for duplicate fields within the same page', () => {
    const mockData = {
      rawSubmissionData: {
        meta: {
          definition: {
            pages: [
              {
                title: 'Organisation details',
                components: [
                  { shortDescription: 'Org name', name: 'field1' },
                  { shortDescription: 'Org name', name: 'field2' }
                ]
              }
            ]
          }
        },
        data: {
          main: {
            field1: 'Company A',
            field2: 'Company B'
          }
        }
      }
    }

    expect(() => extractAnswers(mockData)).toThrow(
      'Duplicate shortDescription detected in page "Organisation details": Org name'
    )
  })
})

describe('flattenAnswersByShortDesc', () => {
  it('should flatten nested answers by shortDescription', () => {
    const nestedAnswers = {
      'Organisation details': {
        'Org name': 'Test Company',
        'Organisation ID': '12345'
      },
      'Contact details': {
        'Contact name': 'John Doe',
        'Contact email': 'john@test.com'
      }
    }

    const result = flattenAnswersByShortDesc(nestedAnswers)

    expect(result).toEqual({
      'Org name': 'Test Company',
      'Organisation ID': '12345',
      'Contact name': 'John Doe',
      'Contact email': 'john@test.com'
    })
  })

  it('should allow duplicate fields that are in allowedDuplicates list', () => {
    const nestedAnswers = {
      'Page 1': {
        Timescale: 'Monthly',
        'Authorised weight': '100'
      },
      'Page 2': {
        Timescale: 'Yearly',
        'Authorised packaging waste categories': 'Paper'
      },
      'Page 3': {
        'Authorised packaging waste categories': 'Plastic'
      }
    }

    const result = flattenAnswersByShortDesc(nestedAnswers)

    expect(result).toEqual({
      Timescale: 'Yearly',
      'Authorised weight': '100',
      'Authorised packaging waste categories': 'Plastic'
    })
  })

  it('should throw error for non-allowed duplicate fields', () => {
    const nestedAnswers = {
      'Page 1': {
        'Org name': 'Company A'
      },
      'Page 2': {
        'Org name': 'Company B'
      }
    }

    expect(() => flattenAnswersByShortDesc(nestedAnswers)).toThrow(
      'Duplicate fields found: Org name'
    )
  })

  it('should throw error for multiple non-allowed duplicates', () => {
    const nestedAnswers = {
      'Page 1': {
        'Field A': 'Value 1',
        'Field B': 'Value 2'
      },
      'Page 2': {
        'Field A': 'Value 3',
        'Field B': 'Value 4'
      }
    }

    expect(() => flattenAnswersByShortDesc(nestedAnswers)).toThrow(
      'Duplicate fields found: Field A, Field B'
    )
  })

  it('should handle empty answers object', () => {
    const result = flattenAnswersByShortDesc({})
    expect(result).toEqual({})
  })

  it('should work with real fixture data', () => {
    const answers = extractAnswers(exporterRegistration)
    const flattened = flattenAnswersByShortDesc(answers)

    const orgDetails = FORM_PAGES.REPROCESSOR_REGISTRATION.ORGANISATION_DETAILS
    expect(flattened[orgDetails.fields.ORG_NAME]).toBe('EuroPack GmbH')
    expect(flattened[orgDetails.fields.ORGANISATION_ID]).toBe('503181')
  })
})

describe('extractAnswers - validate all EA fixtures for duplicates', () => {
  const eaFixturesPath = 'src/data/fixtures/ea'

  function getAllJsonFiles(dir) {
    const files = []
    const entries = readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...getAllJsonFiles(fullPath))
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(fullPath)
      }
    }

    return files
  }

  const allJsonFiles = getAllJsonFiles(eaFixturesPath)

  test.each(allJsonFiles)(
    'should not have duplicate page title or shortDescription within single page in %s',
    (filePath) => {
      const content = readFileSync(filePath, 'utf8')
      const data = JSON.parse(content)

      // Should extract answers without duplicate page titles or shortDescriptions within same page
      const answers = extractAnswers(data)
      expect(answers).toBeDefined()

      // Should flatten answers without unexpected duplicate shortDescriptions
      const flattened = flattenAnswersByShortDesc(answers)
      expect(flattened).toBeDefined()
    }
  )
})

describe('retrieveFileUploadDetails', () => {
  it('should retrieve file upload details', () => {
    const result = retrieveFileUploadDetails(
      exporterRegistration,
      'Sampling and inspection plan'
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      defraFormUploadedFileId: '12b95c25-6119-4478-a060-79716455036b',
      defraFormUserDownloadLink:
        'https://forms-designer.test.cdp-int.defra.cloud/file-download/12b95c25-6119-4478-a060-79716455036b'
    })
  })

  it('should retrieve file with ORS Log shortDescription', () => {
    const result = retrieveFileUploadDetails(
      exporterRegistration,
      'Overseas reprocessing and interim sites'
    )

    expect(result).toHaveLength(1)
    expect(result[0].defraFormUploadedFileId).toBeDefined()
    expect(result[0].defraFormUserDownloadLink).toContain(
      'forms-designer.test.cdp-int.defra.cloud/file-download/'
    )
  })

  it('should throw error when FileUploadField exists but has no files', () => {
    const dataWithoutFiles = {
      rawSubmissionData: {
        ...exporterRegistration.rawSubmissionData,
        data: {
          ...exporterRegistration.rawSubmissionData.data,
          files: {}
        }
      }
    }

    expect(() =>
      retrieveFileUploadDetails(
        dataWithoutFiles,
        'Sampling and inspection plan'
      )
    ).toThrow('No files uploaded for field: Sampling and inspection plan')
  })

  it('should throw error when file upload field not found', () => {
    expect(() =>
      retrieveFileUploadDetails(exporterRegistration, 'Non-existent field')
    ).toThrow(
      'File upload field not found for shortDescription: Non-existent field'
    )
  })

  it('should throw error when shortDescription matches TextField not FileUploadField', () => {
    expect(() =>
      retrieveFileUploadDetails(exporterRegistration, 'Org name')
    ).toThrow('File upload field not found for shortDescription: Org name')
  })
})
