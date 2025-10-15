import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseOrgSubmission } from './parse-organisation-data.js'
import * as parseFormsData from './parse-forms-data.js'
import { CREATED, WASTE_PROCESSING_TYPES } from '#domain/organisation.js'
import { FORM_PAGES } from './form-field-constants.js'

// Mock only parse-forms-data module
vi.mock('./parse-forms-data.js', () => ({
  extractAnswers: vi.fn(),
  flattenAnswersByShortDesc: vi.fn()
}))

describe('parseOrgSubmission', () => {
  const mockId = '507f1f77bcf86cd799439011' // MongoDB ObjectId format
  const mockOrgId = 123456
  const mockRawSubmissionData = { test: 'data' }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should parse organisation submission with valid data', () => {
    const mockAnswersByPages = {
      'Page 1': { field1: 'value1' }
    }
    const mockAnswersByShortDescription = {
      [FORM_PAGES.ORGANISATION.WASTE_PROCESSING_DETAILS.fields.TYPES]:
        'Reprocessor',
      [FORM_PAGES.ORGANISATION.REPROCESSING_NATIONS.fields.NATIONS]:
        'England,Scotland'
    }

    parseFormsData.extractAnswers.mockReturnValue(mockAnswersByPages)
    parseFormsData.flattenAnswersByShortDesc.mockReturnValue(
      mockAnswersByShortDescription
    )

    const result = parseOrgSubmission(mockId, mockOrgId, mockRawSubmissionData)

    expect(parseFormsData.extractAnswers).toHaveBeenCalledWith(
      mockRawSubmissionData
    )
    expect(parseFormsData.flattenAnswersByShortDesc).toHaveBeenCalledWith(
      mockAnswersByPages
    )

    expect(result).toEqual({
      _id: mockId,
      orgId: mockId,
      status: CREATED,
      wasteProcessingTypes: [WASTE_PROCESSING_TYPES.REPROCESSOR],
      reprocessingNations: expect.any(Array)
    })
    expect(result.reprocessingNations).toHaveLength(2)
  })

  it('should throw error when waste processing type field is missing', () => {
    const mockAnswersByPages = {}
    const mockAnswersByShortDescription = {
      [FORM_PAGES.ORGANISATION.REPROCESSING_NATIONS.fields.NATIONS]: 'England'
    }

    parseFormsData.extractAnswers.mockReturnValue(mockAnswersByPages)
    parseFormsData.flattenAnswersByShortDesc.mockReturnValue(
      mockAnswersByShortDescription
    )

    expect(() =>
      parseOrgSubmission(mockId, mockOrgId, mockRawSubmissionData)
    ).toThrow(
      `Waste processing type field "${FORM_PAGES.ORGANISATION.WASTE_PROCESSING_DETAILS.fields.TYPES}" not found`
    )
  })

  it('should throw error when waste processing type field is null', () => {
    const mockAnswersByPages = {}
    const mockAnswersByShortDescription = {
      [FORM_PAGES.ORGANISATION.WASTE_PROCESSING_DETAILS.fields.TYPES]: null,
      [FORM_PAGES.ORGANISATION.REPROCESSING_NATIONS.fields.NATIONS]: 'England'
    }

    parseFormsData.extractAnswers.mockReturnValue(mockAnswersByPages)
    parseFormsData.flattenAnswersByShortDesc.mockReturnValue(
      mockAnswersByShortDescription
    )

    expect(() =>
      parseOrgSubmission(mockId, mockOrgId, mockRawSubmissionData)
    ).toThrow(
      `Waste processing type field "${FORM_PAGES.ORGANISATION.WASTE_PROCESSING_DETAILS.fields.TYPES}" not found`
    )
  })

  it('should throw error when reprocessing nations field is missing', () => {
    const mockAnswersByPages = {}
    const mockAnswersByShortDescription = {
      [FORM_PAGES.ORGANISATION.WASTE_PROCESSING_DETAILS.fields.TYPES]:
        'Reprocessor'
    }

    parseFormsData.extractAnswers.mockReturnValue(mockAnswersByPages)
    parseFormsData.flattenAnswersByShortDesc.mockReturnValue(
      mockAnswersByShortDescription
    )

    expect(() =>
      parseOrgSubmission(mockId, mockOrgId, mockRawSubmissionData)
    ).toThrow(
      `Reprocessing nations "${FORM_PAGES.ORGANISATION.REPROCESSING_NATIONS.fields.NATIONS}" not found`
    )
  })

  it('should throw error when reprocessing nations field is null', () => {
    const mockAnswersByPages = {}
    const mockAnswersByShortDescription = {
      [FORM_PAGES.ORGANISATION.WASTE_PROCESSING_DETAILS.fields.TYPES]:
        'Reprocessor',
      [FORM_PAGES.ORGANISATION.REPROCESSING_NATIONS.fields.NATIONS]: null
    }

    parseFormsData.extractAnswers.mockReturnValue(mockAnswersByPages)
    parseFormsData.flattenAnswersByShortDesc.mockReturnValue(
      mockAnswersByShortDescription
    )

    expect(() =>
      parseOrgSubmission(mockId, mockOrgId, mockRawSubmissionData)
    ).toThrow(
      `Reprocessing nations "${FORM_PAGES.ORGANISATION.REPROCESSING_NATIONS.fields.NATIONS}" not found`
    )
  })

  it('should propagate errors from extractAnswers', () => {
    parseFormsData.extractAnswers.mockImplementation(() => {
      throw new Error('extractAnswers failed')
    })

    expect(() =>
      parseOrgSubmission(mockId, mockOrgId, mockRawSubmissionData)
    ).toThrow('extractAnswers failed')
  })

  it('should propagate errors from flattenAnswersByShortDesc', () => {
    const mockAnswersByPages = {}

    parseFormsData.extractAnswers.mockReturnValue(mockAnswersByPages)
    parseFormsData.flattenAnswersByShortDesc.mockImplementation(() => {
      throw new Error('flattenAnswersByShortDesc failed')
    })

    expect(() =>
      parseOrgSubmission(mockId, mockOrgId, mockRawSubmissionData)
    ).toThrow('flattenAnswersByShortDesc failed')
  })
})
